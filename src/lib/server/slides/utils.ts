import type { SlideRenderConfig, FunFactData } from '$lib/components/slides/types';
import type { SlideConfig, CustomSlide } from './types';
import type { FunFact } from '$lib/server/funfacts';

export function buildSlideRenderConfigs(
	slideConfigs: SlideConfig[],
	customSlides: CustomSlide[]
): SlideRenderConfig[] {
	const configs: SlideRenderConfig[] = [];

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

	return configs.sort((a, b) => a.sortOrder - b.sortOrder);
}

export function customSlidesToMap(customSlides: CustomSlide[]): Map<number, CustomSlide> {
	const map = new Map<number, CustomSlide>();
	for (const slide of customSlides) {
		map.set(slide.id, slide);
	}
	return map;
}

export function intersperseFunFacts(
	slides: SlideRenderConfig[],
	funFacts: FunFact[]
): SlideRenderConfig[] {
	if (funFacts.length === 0 || slides.length <= 1) {
		return slides;
	}

	const effectiveFunFacts = funFacts.slice(0, Math.max(1, slides.length - 1));
	const result: SlideRenderConfig[] = [];
	const totalSlides = slides.length;
	const numFunFacts = effectiveFunFacts.length;

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

	return result.map((slide, index) => ({
		...slide,
		sortOrder: index
	}));
}
