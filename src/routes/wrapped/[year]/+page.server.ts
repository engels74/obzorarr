import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getServerStatsWithAnonymization } from '$lib/server/stats/engine';
import {
	initializeDefaultSlideConfig,
	getEnabledSlides,
	getEnabledCustomSlides,
	buildSlideRenderConfigs,
	customSlidesToMap
} from '$lib/server/slides';
import { generateFunFacts, type FunFact } from '$lib/server/funfacts';

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
		isServerWrapped: true
	};
};
