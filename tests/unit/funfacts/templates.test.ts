import { describe, expect, it, beforeEach, afterAll } from 'bun:test';
import {
	clearRegistry,
	isRegistryInitialized,
	getAllTemplates
} from '$lib/server/funfacts/registry';
import {
	initializeTemplates,
	resetTemplates,
	getALL_TEMPLATES,
	getTemplatesForCategory,
	ALL_TEMPLATES,
	TEMPLATES_BY_CATEGORY,
	TIME_EQUIVALENCY_TEMPLATES,
	BEHAVIORAL_TEMPLATES
} from '$lib/server/funfacts/templates';

describe('Fun Facts Templates Index', () => {
	afterAll(() => {
		resetTemplates();
	});

	describe('initializeTemplates', () => {
		beforeEach(() => {
			clearRegistry();
		});

		it('registers all template categories', () => {
			initializeTemplates();

			expect(isRegistryInitialized()).toBe(true);
			expect(getAllTemplates().length).toBeGreaterThan(0);
		});

		it('is idempotent - multiple calls do not duplicate templates', () => {
			initializeTemplates();
			const firstCount = getAllTemplates().length;

			initializeTemplates();
			const secondCount = getAllTemplates().length;

			expect(firstCount).toBe(secondCount);
		});

		it('skips initialization when already initialized', () => {
			initializeTemplates();
			const templates = getAllTemplates();

			initializeTemplates();

			expect(getAllTemplates()).toEqual(templates);
		});
	});

	describe('resetTemplates', () => {
		beforeEach(() => {
			clearRegistry();
		});

		it('clears and reinitializes registry', () => {
			initializeTemplates();
			const originalTemplates = getAllTemplates();

			clearRegistry();
			expect(getAllTemplates()).toHaveLength(0);
			expect(isRegistryInitialized()).toBe(false);

			resetTemplates();
			expect(isRegistryInitialized()).toBe(true);
			expect(getAllTemplates().length).toBe(originalTemplates.length);
		});

		it('restores templates after registry was cleared', () => {
			initializeTemplates();
			clearRegistry();

			resetTemplates();

			expect(getAllTemplates().length).toBeGreaterThan(0);
		});
	});

	describe('getALL_TEMPLATES', () => {
		beforeEach(() => {
			clearRegistry();
		});

		it('ensures initialization before returning templates', () => {
			expect(isRegistryInitialized()).toBe(false);

			const templates = getALL_TEMPLATES();

			expect(isRegistryInitialized()).toBe(true);
			expect(templates.length).toBeGreaterThan(0);
		});

		it('returns all registered templates', () => {
			const templates = getALL_TEMPLATES();

			expect(templates.length).toBe(ALL_TEMPLATES.length);
		});
	});

	describe('getTemplatesForCategory', () => {
		beforeEach(() => {
			clearRegistry();
		});

		it('ensures initialization before returning templates', () => {
			expect(isRegistryInitialized()).toBe(false);

			const templates = getTemplatesForCategory('time-equivalency');

			expect(isRegistryInitialized()).toBe(true);
			expect(templates.length).toBeGreaterThan(0);
		});

		it('returns templates for time-equivalency category', () => {
			const templates = getTemplatesForCategory('time-equivalency');
			expect(templates.length).toBe(TIME_EQUIVALENCY_TEMPLATES.length);
		});

		it('returns templates for behavioral-insight category', () => {
			const templates = getTemplatesForCategory('behavioral-insight');
			expect(templates.length).toBe(BEHAVIORAL_TEMPLATES.length);
		});

		it('re-initializes registry when cleared and returns templates', () => {
			initializeTemplates();

			clearRegistry();

			const templates = getTemplatesForCategory('achievement');
			expect(templates.length).toBe(TEMPLATES_BY_CATEGORY['achievement'].length);
		});
	});

	describe('Static Constants', () => {
		it('ALL_TEMPLATES contains templates from all categories', () => {
			expect(ALL_TEMPLATES.length).toBeGreaterThan(0);

			const categoryCount = Object.keys(TEMPLATES_BY_CATEGORY).length;
			expect(categoryCount).toBe(8);
		});

		it('TEMPLATES_BY_CATEGORY has all 8 categories', () => {
			const expectedCategories = [
				'time-equivalency',
				'content-comparison',
				'behavioral-insight',
				'binge-related',
				'temporal-pattern',
				'achievement',
				'social-comparison',
				'entertainment-trivia'
			];

			for (const category of expectedCategories) {
				expect(TEMPLATES_BY_CATEGORY[category as keyof typeof TEMPLATES_BY_CATEGORY]).toBeDefined();
			}
		});

		it('ALL_TEMPLATES count matches sum of category counts', () => {
			let totalFromCategories = 0;
			for (const category of Object.values(TEMPLATES_BY_CATEGORY)) {
				totalFromCategories += category.length;
			}

			expect(ALL_TEMPLATES.length).toBe(totalFromCategories);
		});
	});
});
