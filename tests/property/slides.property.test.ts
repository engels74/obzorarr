import { describe, expect, it, beforeEach } from 'bun:test';
import * as fc from 'fast-check';

import {
	initializeDefaultSlideConfig,
	getAllSlideConfigs,
	getSlideConfigByType,
	getEnabledSlides,
	updateSlideConfig,
	reorderSlides,
	toggleSlide,
	resetToDefaultConfig
} from '$lib/server/slides/config.service';

import { DEFAULT_SLIDE_ORDER, type SlideType } from '$lib/components/slides/types';

/**
 * Property-based tests for Slide System
 *
 * Feature: obzorarr, Properties 19-20
 * Validates: Requirements 9.4, 9.5
 *
 * These tests verify the formal correctness properties defined in design.md
 * for the slide configuration system.
 */

// =============================================================================
// Arbitraries
// =============================================================================

const slideTypeArbitrary: fc.Arbitrary<SlideType> = fc.constantFrom(
	'total-time',
	'top-movies',
	'top-shows',
	'genres',
	'distribution',
	'percentile',
	'binge',
	'first-last',
	'fun-fact'
);

// Generate a shuffled order of all default slides
const slideOrderArbitrary: fc.Arbitrary<SlideType[]> = fc
	.shuffledSubarray([...DEFAULT_SLIDE_ORDER] as SlideType[], {
		minLength: DEFAULT_SLIDE_ORDER.length,
		maxLength: DEFAULT_SLIDE_ORDER.length
	})
	.map((arr) => arr as SlideType[]);

// Generate a subset of slides to disable
const slidesToDisableArbitrary: fc.Arbitrary<SlideType[]> = fc.subarray(
	[...DEFAULT_SLIDE_ORDER] as SlideType[],
	{ minLength: 1, maxLength: DEFAULT_SLIDE_ORDER.length - 1 }
);

// =============================================================================
// Property 19: Slide Order Persistence
// =============================================================================

// Feature: obzorarr, Property 19: Slide Order Persistence
describe('Property 19: Slide Order Persistence', () => {
	beforeEach(async () => {
		await resetToDefaultConfig();
	});

	it('after save and reload, slide order matches saved order', async () => {
		await fc.assert(
			fc.asyncProperty(slideOrderArbitrary, async (newOrder) => {
				// Save the new order
				await reorderSlides(newOrder);

				// Reload from database
				const loadedConfigs = await getAllSlideConfigs();

				// Extract order from loaded configs
				const loadedOrder = loadedConfigs
					.sort((a, b) => a.sortOrder - b.sortOrder)
					.map((c) => c.slideType);

				// Verify order matches
				if (loadedOrder.length !== newOrder.length) return false;

				for (let i = 0; i < newOrder.length; i++) {
					if (loadedOrder[i] !== newOrder[i]) return false;
				}

				return true;
			}),
			{ numRuns: 100 }
		);
	});

	it('sortOrder values are consecutive starting from 0', async () => {
		await fc.assert(
			fc.asyncProperty(slideOrderArbitrary, async (newOrder) => {
				await reorderSlides(newOrder);
				const configs = await getAllSlideConfigs();

				const sortedConfigs = [...configs].sort((a, b) => a.sortOrder - b.sortOrder);

				for (let i = 0; i < sortedConfigs.length; i++) {
					const config = sortedConfigs[i];
					if (!config || config.sortOrder !== i) return false;
				}

				return true;
			}),
			{ numRuns: 100 }
		);
	});

	it('order persistence is idempotent', async () => {
		await fc.assert(
			fc.asyncProperty(slideOrderArbitrary, async (newOrder) => {
				// Save order twice
				await reorderSlides(newOrder);
				await reorderSlides(newOrder);

				// Load and verify
				const configs = await getAllSlideConfigs();
				const loadedOrder = [...configs]
					.sort((a, b) => a.sortOrder - b.sortOrder)
					.map((c) => c.slideType);

				return (
					loadedOrder.length === newOrder.length &&
					loadedOrder.every((type, i) => type === newOrder[i])
				);
			}),
			{ numRuns: 100 }
		);
	});

	it('reordering preserves enabled state', async () => {
		await fc.assert(
			fc.asyncProperty(
				slideOrderArbitrary,
				slideTypeArbitrary,
				async (newOrder, slideToDisable) => {
					// Disable a specific slide
					await updateSlideConfig(slideToDisable, { enabled: false });

					// Reorder slides
					await reorderSlides(newOrder);

					// Verify the disabled slide is still disabled
					const config = await getSlideConfigByType(slideToDisable);

					return config !== null && config.enabled === false;
				}
			),
			{ numRuns: 100 }
		);
	});
});

// =============================================================================
// Property 20: Disabled Slide Exclusion
// =============================================================================

// Feature: obzorarr, Property 20: Disabled Slide Exclusion
describe('Property 20: Disabled Slide Exclusion', () => {
	beforeEach(async () => {
		await resetToDefaultConfig();
	});

	it('disabled slides are not included in enabled slides list', async () => {
		await fc.assert(
			fc.asyncProperty(slidesToDisableArbitrary, async (slidesToDisable) => {
				// Reset before each iteration to ensure clean state
				await resetToDefaultConfig();

				// Disable selected slides
				for (const slideType of slidesToDisable) {
					await updateSlideConfig(slideType, { enabled: false });
				}

				// Get enabled slides
				const enabledSlides = await getEnabledSlides();
				const enabledTypes = enabledSlides.map((s) => s.slideType);

				// Verify none of the disabled slides appear
				for (const disabledType of slidesToDisable) {
					if (enabledTypes.includes(disabledType)) {
						return false;
					}
				}

				return true;
			}),
			{ numRuns: 100 }
		);
	});

	it('enabled slides count equals total minus disabled count', async () => {
		await fc.assert(
			fc.asyncProperty(slidesToDisableArbitrary, async (slidesToDisable) => {
				// Reset before each iteration to ensure clean state
				await resetToDefaultConfig();

				// Disable selected slides
				for (const slideType of slidesToDisable) {
					await updateSlideConfig(slideType, { enabled: false });
				}

				const enabledSlides = await getEnabledSlides();
				const allSlides = await getAllSlideConfigs();

				const expectedEnabled = allSlides.length - slidesToDisable.length;

				return enabledSlides.length === expectedEnabled;
			}),
			{ numRuns: 100 }
		);
	});

	it('re-enabling a slide includes it in enabled list', async () => {
		await fc.assert(
			fc.asyncProperty(slideTypeArbitrary, async (slideType) => {
				// Disable then re-enable
				await updateSlideConfig(slideType, { enabled: false });
				await updateSlideConfig(slideType, { enabled: true });

				const enabledSlides = await getEnabledSlides();
				const enabledTypes = enabledSlides.map((s) => s.slideType);

				return enabledTypes.includes(slideType);
			}),
			{ numRuns: 100 }
		);
	});

	it('disabled slide maintains its sortOrder', async () => {
		await fc.assert(
			fc.asyncProperty(slideTypeArbitrary, async (slideType) => {
				// Get original order
				const originalConfigs = await getAllSlideConfigs();
				const original = originalConfigs.find((c) => c.slideType === slideType);
				if (!original) return false;

				const originalSortOrder = original.sortOrder;

				// Disable
				await updateSlideConfig(slideType, { enabled: false });

				// Get updated config
				const updatedConfigs = await getAllSlideConfigs();
				const updated = updatedConfigs.find((c) => c.slideType === slideType);

				return updated !== null && updated !== undefined && updated.sortOrder === originalSortOrder;
			}),
			{ numRuns: 100 }
		);
	});

	it('enabled slides preserve relative order when some are disabled', async () => {
		await fc.assert(
			fc.asyncProperty(slidesToDisableArbitrary, async (slidesToDisable) => {
				// Get original enabled order
				const originalEnabled = await getEnabledSlides();
				const originalOrder = originalEnabled.map((s) => s.slideType);

				// Disable slides
				for (const slideType of slidesToDisable) {
					await updateSlideConfig(slideType, { enabled: false });
				}

				// Get new enabled slides
				const newEnabled = await getEnabledSlides();
				const newOrder = newEnabled.map((s) => s.slideType);

				// Filter original order to exclude disabled slides
				const expectedOrder = originalOrder.filter((type) => !slidesToDisable.includes(type));

				// Verify order is preserved
				return (
					newOrder.length === expectedOrder.length &&
					newOrder.every((type, i) => type === expectedOrder[i])
				);
			}),
			{ numRuns: 100 }
		);
	});

	it('toggle correctly switches enabled state', async () => {
		await fc.assert(
			fc.asyncProperty(slideTypeArbitrary, async (slideType) => {
				// Get initial state
				const initial = await getSlideConfigByType(slideType);
				if (!initial) return false;

				// Toggle
				const toggled = await toggleSlide(slideType);

				// Verify state changed
				return toggled.enabled === !initial.enabled;
			}),
			{ numRuns: 100 }
		);
	});
});

// =============================================================================
// Additional Unit Tests
// =============================================================================

describe('Slide Configuration Service', () => {
	beforeEach(async () => {
		await resetToDefaultConfig();
	});

	it('initializes with default slide order', async () => {
		const configs = await getAllSlideConfigs();
		expect(configs.length).toBe(DEFAULT_SLIDE_ORDER.length);

		const types = configs.map((c) => c.slideType).sort();
		const expected = [...DEFAULT_SLIDE_ORDER].sort();
		expect(types).toEqual(expected);
	});

	it('all slides are enabled by default', async () => {
		const configs = await getAllSlideConfigs();
		expect(configs.every((c) => c.enabled)).toBe(true);
	});

	it('can disable individual slide', async () => {
		await updateSlideConfig('genres', { enabled: false });
		const configs = await getAllSlideConfigs();
		const genres = configs.find((c) => c.slideType === 'genres');
		expect(genres?.enabled).toBe(false);
	});

	it('reorder updates all sortOrder values', async () => {
		const newOrder: SlideType[] = [
			'binge',
			'total-time',
			'percentile',
			'top-movies',
			'top-shows',
			'genres',
			'distribution',
			'first-last',
			'fun-fact'
		];
		await reorderSlides(newOrder);

		const configs = await getAllSlideConfigs();
		const bingeConfig = configs.find((c) => c.slideType === 'binge');
		const totalTimeConfig = configs.find((c) => c.slideType === 'total-time');

		expect(bingeConfig?.sortOrder).toBe(0);
		expect(totalTimeConfig?.sortOrder).toBe(1);
	});

	it('getSlideConfigByType returns null for unknown type', async () => {
		const result = await getSlideConfigByType('unknown-type' as SlideType);
		expect(result).toBeNull();
	});

	it('enabled slides are in sorted order', async () => {
		// Reorder slides
		const newOrder: SlideType[] = [
			'fun-fact',
			'binge',
			'total-time',
			'percentile',
			'top-movies',
			'top-shows',
			'genres',
			'distribution',
			'first-last'
		];
		await reorderSlides(newOrder);

		// Disable some
		await updateSlideConfig('binge', { enabled: false });
		await updateSlideConfig('percentile', { enabled: false });

		// Get enabled slides
		const enabled = await getEnabledSlides();

		// Verify they are in ascending sortOrder
		for (let i = 1; i < enabled.length; i++) {
			const prev = enabled[i - 1];
			const curr = enabled[i];
			if (!prev || !curr) continue;
			expect(curr.sortOrder).toBeGreaterThan(prev.sortOrder);
		}
	});
});

describe('Slide Order Edge Cases', () => {
	beforeEach(async () => {
		await resetToDefaultConfig();
	});

	it('reordering with same order has no effect', async () => {
		const beforeConfigs = await getAllSlideConfigs();
		const currentOrder = [...beforeConfigs]
			.sort((a, b) => a.sortOrder - b.sortOrder)
			.map((c) => c.slideType) as SlideType[];

		await reorderSlides(currentOrder);

		const afterConfigs = await getAllSlideConfigs();

		// Verify nothing changed
		for (const before of beforeConfigs) {
			const after = afterConfigs.find((c) => c.slideType === before.slideType);
			expect(after?.sortOrder).toBe(before.sortOrder);
			expect(after?.enabled).toBe(before.enabled);
		}
	});

	it('disabling all slides except one returns only that slide', async () => {
		const slidesToDisable = [...DEFAULT_SLIDE_ORDER].filter(
			(t) => t !== 'total-time'
		) as SlideType[];

		for (const slideType of slidesToDisable) {
			await updateSlideConfig(slideType, { enabled: false });
		}

		const enabled = await getEnabledSlides();
		expect(enabled.length).toBe(1);
		expect(enabled[0]?.slideType).toBe('total-time');
	});
});
