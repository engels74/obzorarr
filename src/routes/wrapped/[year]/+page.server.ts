import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getServerStatsWithAnonymization } from '$lib/server/stats/engine';
import {
	initializeDefaultSlideConfig,
	getEnabledSlides,
	getEnabledCustomSlides,
	buildSlideRenderConfigs,
	customSlidesToMap,
	intersperseFunFacts
} from '$lib/server/slides';
import { generateFunFacts } from '$lib/server/funfacts';
import { getLogoVisibility } from '$lib/server/logo';
import { getServerName } from '$lib/server/plex/server-name.service';
import { getFunFactFrequency } from '$lib/server/admin/settings.service';
import { triggerLiveSyncIfNeeded } from '$lib/server/sync/live-sync';

/**
 * Server-wide Wrapped Page Load Function
 *
 * Loads server-wide statistics for the Year in Review page.
 * Applies anonymization based on the viewing user.
 *
 * Implements Requirements:
 * - 12.1: URL format /wrapped/{year} for server-wide
 * - 14.3: Router serves server-wide wrapped at /wrapped/{year}
 *
 * @module routes/wrapped/[year]
 */

export const load: PageServerLoad = async ({ params, locals }) => {
	// Validate year parameter (4-digit number, reasonable range 2000-2100)
	const year = parseInt(params.year, 10);
	if (isNaN(year) || year < 2000 || year > 2100) {
		error(404, 'Invalid year');
	}

	// Trigger live sync in background (fire-and-forget)
	triggerLiveSyncIfNeeded('server-wrapped').catch(() => {});

	// Get viewing user ID for anonymization (null if not authenticated)
	const viewingUserId = locals.user?.id ?? null;

	// Fetch stats with anonymization applied
	const stats = await getServerStatsWithAnonymization(year, viewingUserId);

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

	// Get logo visibility (server-wide pages don't have per-user control)
	const logoVisibility = await getLogoVisibility(null, year);

	// Get server name for messaging
	const serverName = await getServerName();

	return {
		stats,
		slides,
		customSlidesMap,
		year,
		isServerWrapped: true,
		serverName,
		showLogo: logoVisibility.showLogo,
		canUserControlLogo: false // Server-wide pages don't have per-user logo control
	};
};
