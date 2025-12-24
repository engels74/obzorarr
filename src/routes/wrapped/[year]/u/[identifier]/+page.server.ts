import { error, fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { PageServerLoad, Actions } from './$types';
import { db } from '$lib/server/db/client';
import { users } from '$lib/server/db/schema';
import { calculateUserStats } from '$lib/server/stats/engine';
import { checkWrappedAccess, checkTokenAccess } from '$lib/server/sharing/access-control';
import {
	isValidTokenFormat,
	getOrCreateShareSettings,
	updateShareSettings,
	regenerateShareToken
} from '$lib/server/sharing/service';
import {
	ShareAccessDeniedError,
	InvalidShareTokenError,
	PermissionExceededError,
	ShareModeSchema
} from '$lib/server/sharing/types';
import {
	initializeDefaultSlideConfig,
	getEnabledSlides,
	getEnabledCustomSlides,
	buildSlideRenderConfigs,
	customSlidesToMap,
	intersperseFunFacts
} from '$lib/server/slides';
import { generateFunFacts } from '$lib/server/funfacts';
import { getLogoVisibility, setUserLogoPreference } from '$lib/server/logo';
import { getFunFactFrequency } from '$lib/server/admin/settings.service';
import { triggerLiveSyncIfNeeded } from '$lib/server/sync/live-sync';

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

	// Trigger live sync in background (fire-and-forget)
	triggerLiveSyncIfNeeded('user-wrapped').catch(() => {});

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

	// Get user from database to retrieve accountId (needed for stats)
	// The stats engine uses playHistory.accountId to match viewing history
	const userResult = await db.select().from(users).where(eq(users.id, userId)).limit(1);

	const user = userResult[0];
	if (!user) {
		error(404, 'User not found');
	}

	// Use accountId for stats queries (falls back to plexId for backward compatibility)
	// Note: accountId is the Plex server's local ID, which may differ from plexId (Plex.tv ID)
	const statsAccountId = user.accountId ?? user.plexId;
	const stats = await calculateUserStats(statsAccountId, year);

	// Initialize default slide config if needed and fetch configurations
	await initializeDefaultSlideConfig();
	const [slideConfigs, customSlides] = await Promise.all([
		getEnabledSlides(),
		getEnabledCustomSlides(year)
	]);

	// Build base slide render configs
	const baseSlides = buildSlideRenderConfigs(slideConfigs, customSlides);

	// Convert custom slides to map for component usage
	const customSlidesMap = customSlidesToMap(customSlides);

	// Get fun fact frequency setting and generate fun facts
	const frequencyConfig = await getFunFactFrequency();
	let funFacts: Awaited<ReturnType<typeof generateFunFacts>> = [];
	try {
		funFacts = await generateFunFacts(stats, { count: frequencyConfig.count });
	} catch (err) {
		console.warn('Failed to generate fun facts:', err);
		// Continue without fun facts rather than failing the page
	}

	// Intersperse fun facts into slides
	const slides = intersperseFunFacts(baseSlides, funFacts);

	// Get logo visibility (per-user pages can have user control if mode is USER_CHOICE)
	const logoVisibility = await getLogoVisibility(userId, year);

	// Get share settings for the modal
	const shareSettings = await getOrCreateShareSettings({ userId, year });

	// Determine ownership and permissions
	const isOwner = locals.user?.id === userId;
	const isAdmin = locals.user?.isAdmin ?? false;

	return {
		stats,
		slides,
		customSlidesMap,
		year,
		userId,
		username: user.username,
		isServerWrapped: false,
		serverName: null, // Personal wrapped doesn't use server name
		showLogo: logoVisibility.showLogo,
		canUserControlLogo: logoVisibility.canUserControl,
		// Share modal data
		shareSettings: {
			mode: shareSettings.mode,
			shareToken: shareSettings.shareToken,
			canUserControl: shareSettings.canUserControl || isAdmin
		},
		isOwner,
		isAdmin,
		currentUrl: `/wrapped/${year}/u/${userId}`
	};
};

// =============================================================================
// Actions
// =============================================================================

export const actions: Actions = {
	/**
	 * Toggle user's logo preference for this wrapped page
	 */
	toggleLogo: async ({ request, params, locals }) => {
		// Require authentication for preference changes
		if (!locals.user) {
			return fail(401, { error: 'Authentication required' });
		}

		const year = parseInt(params.year, 10);
		if (isNaN(year)) {
			return fail(400, { error: 'Invalid year' });
		}

		const formData = await request.formData();
		const showLogoStr = formData.get('showLogo')?.toString();
		const showLogo = showLogoStr === 'true';

		try {
			await setUserLogoPreference(locals.user.id, year, showLogo);
			return { success: true };
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to update preference';
			return fail(500, { error: message });
		}
	},

	/**
	 * Update share mode for this wrapped page
	 */
	updateShareMode: async ({ request, params, locals }) => {
		// Require authentication
		if (!locals.user) {
			return fail(401, { error: 'Authentication required' });
		}

		const year = parseInt(params.year, 10);
		if (isNaN(year)) {
			return fail(400, { error: 'Invalid year' });
		}

		// Parse and validate the identifier as userId
		const userId = parseInt(params.identifier, 10);
		if (isNaN(userId) || userId <= 0) {
			return fail(400, { error: 'Invalid user identifier' });
		}

		// Verify ownership or admin status
		if (locals.user.id !== userId && !locals.user.isAdmin) {
			return fail(403, { error: 'Not authorized to change share settings' });
		}

		const formData = await request.formData();
		const modeValue = formData.get('mode')?.toString();

		// Validate share mode
		const parseResult = ShareModeSchema.safeParse(modeValue);
		if (!parseResult.success) {
			return fail(400, { error: 'Invalid share mode' });
		}

		try {
			const updated = await updateShareSettings(
				userId,
				year,
				{ mode: parseResult.data },
				locals.user.isAdmin
			);
			return {
				success: true,
				shareSettings: {
					mode: updated.mode,
					shareToken: updated.shareToken,
					canUserControl: updated.canUserControl
				}
			};
		} catch (err) {
			if (err instanceof PermissionExceededError) {
				return fail(403, { error: err.message });
			}
			const message = err instanceof Error ? err.message : 'Failed to update share settings';
			return fail(500, { error: message });
		}
	},

	/**
	 * Regenerate share token for private-link mode (admin only)
	 */
	regenerateToken: async ({ params, locals }) => {
		// Require admin authentication
		if (!locals.user?.isAdmin) {
			return fail(403, { error: 'Admin access required' });
		}

		const year = parseInt(params.year, 10);
		if (isNaN(year)) {
			return fail(400, { error: 'Invalid year' });
		}

		// Parse and validate the identifier as userId
		const userId = parseInt(params.identifier, 10);
		if (isNaN(userId) || userId <= 0) {
			return fail(400, { error: 'Invalid user identifier' });
		}

		try {
			const newToken = await regenerateShareToken(userId, year);
			return { success: true, shareToken: newToken };
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to regenerate token';
			return fail(500, { error: message });
		}
	}
};
