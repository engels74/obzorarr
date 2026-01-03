import { describe, expect, it, beforeEach, afterAll } from 'bun:test';
import {
	registerTemplate,
	registerTemplates,
	getAllTemplates,
	getTemplatesByCategory,
	getTemplateById,
	getTemplateWeight,
	getRegisteredCategories,
	getTemplateCounts,
	selectWeightedTemplates,
	clearRegistry,
	isRegistryInitialized,
	markRegistryInitialized
} from '$lib/server/funfacts/registry';
import { resetTemplates } from '$lib/server/funfacts/templates';
import type { FactTemplate, FactCategory } from '$lib/server/funfacts/types';

function createTestTemplate(overrides: Partial<FactTemplate> = {}): FactTemplate {
	return {
		id: `test-${crypto.randomUUID().slice(0, 8)}`,
		category: 'time-equivalency',
		factTemplate: 'You watched {{totalHours}} hours of content.',
		requiredStats: ['totalWatchTimeMinutes'],
		...overrides
	};
}

describe('Fun Facts Registry', () => {
	beforeEach(() => {
		clearRegistry();
	});

	afterAll(() => {
		resetTemplates();
	});

	describe('registerTemplate', () => {
		it('registers a template successfully', () => {
			const template = createTestTemplate({ id: 'test-1' });
			registerTemplate(template);

			expect(getTemplateById('test-1')).toEqual(template);
		});

		it('throws when registering duplicate ID without allowOverride', () => {
			const template = createTestTemplate({ id: 'duplicate' });
			registerTemplate(template);

			expect(() => registerTemplate(template)).toThrow('already registered');
		});

		it('allows override with allowOverride: true', () => {
			const original = createTestTemplate({
				id: 'override-test',
				factTemplate: 'Original template'
			});
			registerTemplate(original);

			const updated = createTestTemplate({
				id: 'override-test',
				factTemplate: 'Updated template'
			});
			registerTemplate(updated, { allowOverride: true });

			const result = getTemplateById('override-test');
			expect(result?.factTemplate).toBe('Updated template');
		});

		it('registers with custom weight', () => {
			const template = createTestTemplate({ id: 'weighted' });
			registerTemplate(template, { weight: 2.5 });

			expect(getTemplateWeight('weighted')).toBe(2.5);
		});

		it('uses default weight of 1.0 when not specified', () => {
			const template = createTestTemplate({ id: 'default-weight' });
			registerTemplate(template);

			expect(getTemplateWeight('default-weight')).toBe(1.0);
		});
	});

	describe('registerTemplates', () => {
		it('registers multiple templates at once', () => {
			const templates = [
				createTestTemplate({ id: 'batch-1' }),
				createTestTemplate({ id: 'batch-2' }),
				createTestTemplate({ id: 'batch-3' })
			];
			registerTemplates(templates);

			expect(getAllTemplates()).toHaveLength(3);
		});

		it('applies options to all templates', () => {
			const templates = [
				createTestTemplate({ id: 'weighted-1' }),
				createTestTemplate({ id: 'weighted-2' })
			];
			registerTemplates(templates, { weight: 3.0 });

			expect(getTemplateWeight('weighted-1')).toBe(3.0);
			expect(getTemplateWeight('weighted-2')).toBe(3.0);
		});
	});

	describe('getAllTemplates', () => {
		it('returns empty array when no templates registered', () => {
			expect(getAllTemplates()).toEqual([]);
		});

		it('returns all registered templates', () => {
			registerTemplate(createTestTemplate({ id: 't1' }));
			registerTemplate(createTestTemplate({ id: 't2' }));

			const all = getAllTemplates();
			expect(all).toHaveLength(2);
		});
	});

	describe('getTemplatesByCategory', () => {
		it('returns empty array for category with no templates', () => {
			const templates = getTemplatesByCategory('achievement');
			expect(templates).toEqual([]);
		});

		it('returns templates for specific category', () => {
			registerTemplate(createTestTemplate({ id: 't1', category: 'time-equivalency' }));
			registerTemplate(createTestTemplate({ id: 't2', category: 'behavioral-insight' }));
			registerTemplate(createTestTemplate({ id: 't3', category: 'time-equivalency' }));

			const timeEquivalency = getTemplatesByCategory('time-equivalency');
			expect(timeEquivalency).toHaveLength(2);

			const behavioral = getTemplatesByCategory('behavioral-insight');
			expect(behavioral).toHaveLength(1);
		});

		it('updates template in same category when overridden', () => {
			registerTemplate(
				createTestTemplate({
					id: 'update-me',
					category: 'time-equivalency',
					factTemplate: 'Original'
				})
			);

			registerTemplate(
				createTestTemplate({
					id: 'update-me',
					category: 'time-equivalency',
					factTemplate: 'Updated'
				}),
				{ allowOverride: true }
			);

			const templates = getTemplatesByCategory('time-equivalency');
			expect(templates).toHaveLength(1);
			expect(templates[0]?.factTemplate).toBe('Updated');
		});
	});

	describe('getTemplateById', () => {
		it('returns undefined for non-existent ID', () => {
			expect(getTemplateById('non-existent')).toBeUndefined();
		});

		it('returns template for existing ID', () => {
			const template = createTestTemplate({ id: 'find-me' });
			registerTemplate(template);

			expect(getTemplateById('find-me')).toEqual(template);
		});
	});

	describe('getTemplateWeight', () => {
		it('returns default 1.0 for non-existent template', () => {
			expect(getTemplateWeight('non-existent')).toBe(1.0);
		});

		it('returns registered weight', () => {
			registerTemplate(createTestTemplate({ id: 'heavy' }), { weight: 5.0 });
			expect(getTemplateWeight('heavy')).toBe(5.0);
		});
	});

	describe('getRegisteredCategories', () => {
		it('returns empty array when no templates registered', () => {
			expect(getRegisteredCategories()).toEqual([]);
		});

		it('returns all categories with registered templates', () => {
			registerTemplate(createTestTemplate({ category: 'time-equivalency' }));
			registerTemplate(createTestTemplate({ category: 'behavioral-insight' }));
			registerTemplate(createTestTemplate({ category: 'achievement' }));

			const categories = getRegisteredCategories();
			expect(categories).toHaveLength(3);
			expect(categories).toContain('time-equivalency');
			expect(categories).toContain('behavioral-insight');
			expect(categories).toContain('achievement');
		});
	});

	describe('getTemplateCounts', () => {
		it('returns empty object when no templates registered', () => {
			const counts = getTemplateCounts();
			expect(Object.keys(counts)).toHaveLength(0);
		});

		it('returns correct counts per category', () => {
			registerTemplate(createTestTemplate({ id: 't1', category: 'time-equivalency' }));
			registerTemplate(createTestTemplate({ id: 't2', category: 'time-equivalency' }));
			registerTemplate(createTestTemplate({ id: 't3', category: 'behavioral-insight' }));

			const counts = getTemplateCounts();
			expect(counts['time-equivalency']).toBe(2);
			expect(counts['behavioral-insight']).toBe(1);
		});
	});

	describe('selectWeightedTemplates', () => {
		it('returns empty array when no templates available', () => {
			const selected = selectWeightedTemplates([], 5);
			expect(selected).toEqual([]);
		});

		it('returns all templates when count >= available', () => {
			const templates = [
				createTestTemplate({ id: 't1' }),
				createTestTemplate({ id: 't2' }),
				createTestTemplate({ id: 't3' })
			];
			templates.forEach((t) => registerTemplate(t));

			const selected = selectWeightedTemplates(templates, 10);
			expect(selected).toHaveLength(3);
		});

		it('excludes templates by ID', () => {
			const templates = [
				createTestTemplate({ id: 'keep-1' }),
				createTestTemplate({ id: 'exclude-1' }),
				createTestTemplate({ id: 'keep-2' })
			];
			templates.forEach((t) => registerTemplate(t));

			const selected = selectWeightedTemplates(templates, 10, ['exclude-1']);
			expect(selected).toHaveLength(2);
			expect(selected.find((t) => t.id === 'exclude-1')).toBeUndefined();
		});

		it('returns requested count when available > count', () => {
			const templates = Array.from({ length: 10 }, (_, i) => createTestTemplate({ id: `t${i}` }));
			templates.forEach((t) => registerTemplate(t));

			const selected = selectWeightedTemplates(templates, 3);
			expect(selected).toHaveLength(3);
		});

		it('returns empty when all templates excluded', () => {
			const templates = [createTestTemplate({ id: 'ex1' }), createTestTemplate({ id: 'ex2' })];
			templates.forEach((t) => registerTemplate(t));

			const selected = selectWeightedTemplates(templates, 5, ['ex1', 'ex2']);
			expect(selected).toEqual([]);
		});

		it('respects weight in selection (higher weight = more likely)', () => {
			const lightTemplate = createTestTemplate({ id: 'light' });
			const heavyTemplate = createTestTemplate({ id: 'heavy' });

			registerTemplate(lightTemplate, { weight: 0.001 });
			registerTemplate(heavyTemplate, { weight: 1000 });

			let heavyCount = 0;
			const iterations = 100;

			for (let i = 0; i < iterations; i++) {
				const selected = selectWeightedTemplates([lightTemplate, heavyTemplate], 1);
				if (selected[0]?.id === 'heavy') {
					heavyCount++;
				}
			}

			expect(heavyCount).toBeGreaterThan(90);
		});

		it('handles templates with priority', () => {
			const lowPriority = createTestTemplate({ id: 'low', priority: 10 } as FactTemplate);
			const highPriority = createTestTemplate({ id: 'high', priority: 100 } as FactTemplate);

			registerTemplate(lowPriority);
			registerTemplate(highPriority);

			let highCount = 0;
			const iterations = 100;

			for (let i = 0; i < iterations; i++) {
				const selected = selectWeightedTemplates([lowPriority, highPriority], 1);
				if (selected[0]?.id === 'high') {
					highCount++;
				}
			}

			expect(highCount).toBeGreaterThan(70);
		});
	});

	describe('Registry State', () => {
		describe('clearRegistry', () => {
			it('clears all templates', () => {
				registerTemplate(createTestTemplate());
				registerTemplate(createTestTemplate());
				expect(getAllTemplates()).toHaveLength(2);

				clearRegistry();
				expect(getAllTemplates()).toHaveLength(0);
			});

			it('resets initialization flag', () => {
				markRegistryInitialized();
				expect(isRegistryInitialized()).toBe(true);

				clearRegistry();
				expect(isRegistryInitialized()).toBe(false);
			});
		});

		describe('isRegistryInitialized', () => {
			it('returns false when not initialized', () => {
				expect(isRegistryInitialized()).toBe(false);
			});

			it('returns true after markRegistryInitialized', () => {
				markRegistryInitialized();
				expect(isRegistryInitialized()).toBe(true);
			});
		});

		describe('markRegistryInitialized', () => {
			it('sets initialization flag', () => {
				expect(isRegistryInitialized()).toBe(false);
				markRegistryInitialized();
				expect(isRegistryInitialized()).toBe(true);
			});
		});
	});
});
