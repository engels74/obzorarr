import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db/client';
import { users } from '$lib/server/db/schema';
import { calculateUserStats } from '$lib/server/stats/engine';
import {
	checkWrappedAccess,
	checkTokenAccess
} from '$lib/server/sharing/access-control';
import { isValidTokenFormat } from '$lib/server/sharing/service';
import {
	ShareAccessDeniedError,
	InvalidShareTokenError
} from '$lib/server/sharing/types';
import {
	initializeDefaultSlideConfig,
	getEnabledSlides,
	getEnabledCustomSlides,
	buildSlideRenderConfigs,
	customSlidesToMap
} from '$lib/server/slides';
import { generateFunFacts, type FunFact } from '$lib/server/funfacts';

/**
 * Per-user Wrapped Page Load Function
 *
 * Loads user-specific statistics for the Year in Review page.
 * Handles both user ID and share token access patterns.
 *
 * The identifier can be:
 * - A numeric user ID (internal database ID)
 * - A UUID share token for private-link access
 *
 * Implements Requirements:
 * - 12.1: URL format /wrapped/{year}/u/{identifier} for per-user
 * - 14.4: Router serves per-user wrapped at /wrapped/{year}/u/{identifier}
 *
 * Implements Properties:
 * - Property 15: Share Mode Access Control
 * - Property 22: URL Route Parsing
 *
 * @module routes/wrapped/[year]/u/[identifier]
 */

export const load: PageServerLoad = async ({ params, locals }) => {
	// Validate year parameter (4-digit number, reasonable range 2000-2100)
	const year = parseInt(params.year, 10);
	if (isNaN(year) || year < 2000 || year > 2100) {
		error(404, 'Invalid year');
	}

	const { identifier } = params;
	let userId: number; // Internal database user ID

	// Detect if identifier is a share token (UUID) or user ID (number)
	if (isValidTokenFormat(identifier)) {
		// It's a share token - use token-based access (no further auth check needed)
		try {
			const tokenResult = await checkTokenAccess(identifier);
			userId = tokenResult.userId;

			// Verify year matches the token's year
			if (tokenResult.year !== year) {
				error(404, 'Wrapped not found');
			}
		} catch (err) {
			if (err instanceof InvalidShareTokenError) {
				error(404, 'Wrapped not found');
			}
			throw err;
		}
	} else {
		// It's a user ID - parse and validate
		const parsedId = parseInt(identifier, 10);
		if (isNaN(parsedId) || parsedId <= 0) {
			error(404, 'Invalid identifier');
		}
		userId = parsedId;

		// Check access using share settings
		try {
			await checkWrappedAccess({
				userId,
				year,
				currentUser: locals.user
			});
		} catch (err) {
			if (err instanceof ShareAccessDeniedError) {
				error(403, err.message);
			}
			if (err instanceof InvalidShareTokenError) {
				error(404, 'Wrapped not found');
			}
			throw err;
		}
	}

	// Get user from database to retrieve plexId (needed for stats)
	// The stats engine uses playHistory.accountId which is the Plex ID
	const userResult = await db
		.select()
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);

	const user = userResult[0];
	if (!user) {
		error(404, 'User not found');
	}

	// Fetch user stats using plexId (accountId in play_history)
	const stats = await calculateUserStats(user.plexId, year);

	// Initialize default slide config if needed and fetch configurations
	await initializeDefaultSlideConfig();
	const [slideConfigs, customSlides] = await Promise.all([
		getEnabledSlides(),
		getEnabledCustomSlides(year)
	]);

	// Build slide render configs
	const slides = buildSlideRenderConfigs(slideConfigs, customSlides);

	// Convert custom slides to map for component usage
	const customSlidesMap = customSlidesToMap(customSlides);

	// Generate fun facts for the stats
	let funFacts: FunFact[] = [];
	try {
		funFacts = await generateFunFacts(stats, { count: 3 });
	} catch (err) {
		console.warn('Failed to generate fun facts:', err);
		// Continue without fun facts rather than failing the page
	}

	return {
		stats,
		slides,
		customSlidesMap,
		funFacts,
		year,
		userId,
		username: user.username,
		isServerWrapped: false
	};
};
