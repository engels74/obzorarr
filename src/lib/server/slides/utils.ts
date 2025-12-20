import type { SlideRenderConfig } from '$lib/components/slides/types';
import type { SlideConfig, CustomSlide } from './types';

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
