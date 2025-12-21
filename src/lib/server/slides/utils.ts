import type { SlideRenderConfig, FunFactData } from '$lib/components/slides/types';
import type { SlideConfig, CustomSlide } from './types';
import type { FunFact } from '$lib/server/funfacts';

/**
 * Slide Utilities
 *
 * Helper functions for building slide configurations for wrapped pages.
 *
 * @module slides/utils
 */

/**
 * Build an array of SlideRenderConfig from slide configs and custom slides
 *
 * Combines standard slide configurations with custom slides,
 * sorts by sortOrder, and returns ready-to-render configs.
 *
 * @param slideConfigs - Standard slide configurations from config.service
 * @param customSlides - Custom slides from custom.service
 * @returns Sorted array of SlideRenderConfig for rendering
 *
 * @example
 * ```typescript
 * const [configs, customs] = await Promise.all([
 *   getEnabledSlides(),
 *   getEnabledCustomSlides(2024)
 * ]);
 * const slides = buildSlideRenderConfigs(configs, customs);
 * ```
 */
export function buildSlideRenderConfigs(
	slideConfigs: SlideConfig[],
	customSlides: CustomSlide[]
): SlideRenderConfig[] {
	const configs: SlideRenderConfig[] = [];

	// Add standard slides (skip 'custom' type as they are added separately)
	for (const config of slideConfigs) {
		if (config.slideType === 'custom') {
			continue;
		}
		configs.push({
			type: config.slideType,
			enabled: config.enabled,
			sortOrder: config.sortOrder
		});
	}

	// Add custom slides with their content
	for (const custom of customSlides) {
		configs.push({
			type: 'custom',
			enabled: custom.enabled,
			sortOrder: custom.sortOrder,
			customSlideId: custom.id,
			customTitle: custom.title,
			customContent: custom.content
		});
	}

	// Sort by sortOrder
	return configs.sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * Convert custom slides array to a Map keyed by ID
 *
 * Useful for passing to StoryMode/ScrollMode components.
 *
 * @param customSlides - Array of custom slides
 * @returns Map with slide ID as key and CustomSlide as value
 */
export function customSlidesToMap(customSlides: CustomSlide[]): Map<number, CustomSlide> {
	const map = new Map<number, CustomSlide>();
	for (const slide of customSlides) {
		map.set(slide.id, slide);
	}
	return map;
}

/**
 * Intersperse fun facts evenly throughout the slides array.
 *
 * Algorithm:
 * 1. If no fun facts or only 1 slide, return slides unchanged
 * 2. Calculate spacing: floor(slides.length / (funFacts.length + 1))
 * 3. Insert fun facts at evenly distributed positions
 * 4. Recalculate sortOrder for all slides
 *
 * Example with 8 slides and 3 fun facts:
 * - spacing = floor(8 / 4) = 2
 * - Insert after indices: 1, 3, 5 (every 2 slides)
 * - Result: [S0, S1, FF0, S2, S3, FF1, S4, S5, FF2, S6, S7]
 *
 * @param slides - The base slide configurations
 * @param funFacts - Fun facts to intersperse
 * @returns Slides with fun facts interspersed
 */
export function intersperseFunFacts(
	slides: SlideRenderConfig[],
	funFacts: FunFact[]
): SlideRenderConfig[] {
	// Edge cases: no fun facts, empty slides, or only 1 slide
	if (funFacts.length === 0 || slides.length <= 1) {
		return slides;
	}

	// Limit fun facts to slides.length - 1 (can't have more fun facts than gaps)
	const effectiveFunFacts = funFacts.slice(0, Math.max(1, slides.length - 1));

	const result: SlideRenderConfig[] = [];

	// Calculate spacing between fun facts
	// With N slides and M fun facts, we want to place fun facts at even intervals
	// Formula: insert after every ceil(N / (M + 1)) slides
	const totalSlides = slides.length;
	const numFunFacts = effectiveFunFacts.length;

	// Calculate positions where fun facts should be inserted
	// We want to spread them evenly, so insert after position: floor((i+1) * N / (M+1)) - 1
	const insertPositions: number[] = [];
	for (let i = 0; i < numFunFacts; i++) {
		const position = Math.floor(((i + 1) * totalSlides) / (numFunFacts + 1));
		insertPositions.push(position);
	}

	let funFactIndex = 0;
	for (let i = 0; i < slides.length; i++) {
		const slide = slides[i];
		if (slide) {
			result.push(slide);
		}

		// Check if we should insert a fun fact after this slide
		if (funFactIndex < insertPositions.length && i + 1 === insertPositions[funFactIndex]) {
			const funFact = effectiveFunFacts[funFactIndex];
			if (funFact) {
				const funFactData: FunFactData = {
					fact: funFact.fact,
					comparison: funFact.comparison,
					icon: funFact.icon
				};
				result.push({
					type: 'fun-fact',
					enabled: true,
					sortOrder: -1, // Will be recalculated
					funFact: funFactData
				});
			}
			funFactIndex++;
		}
	}

	// Recalculate sortOrder for all slides
	return result.map((slide, index) => ({
		...slide,
		sortOrder: index
	}));
}
