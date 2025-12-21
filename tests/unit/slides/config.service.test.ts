/**
 * Unit tests for Slide Configuration Service
 *
 * Tests slide config initialization, updates, and error handling.
 */

import { describe, expect, it, beforeEach } from 'bun:test';
import { db } from '$lib/server/db/client';
import { slideConfig, appSettings } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { SlideError } from '$lib/server/slides/types';
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
import { DEFAULT_SLIDE_ORDER } from '$lib/components/slides/types';

describe('Slide Config Service', () => {
	beforeEach(async () => {
		// Clean up tables before each test
		await db.delete(slideConfig);
		await db.delete(appSettings);
	});

	describe('initializeDefaultSlideConfig', () => {
		it('creates default slide configs when none exist', async () => {
			await initializeDefaultSlideConfig();

			const configs = await getAllSlideConfigs();
			expect(configs.length).toBe(DEFAULT_SLIDE_ORDER.length);
		});

		it('sets all default slides to enabled', async () => {
			await initializeDefaultSlideConfig();

			const configs = await getAllSlideConfigs();
			for (const config of configs) {
				expect(config.enabled).toBe(true);
			}
		});

		it('assigns sequential sortOrder values', async () => {
			await initializeDefaultSlideConfig();

			const configs = await getAllSlideConfigs();
			for (let i = 0; i < configs.length; i++) {
				expect(configs[i]?.sortOrder).toBe(i);
			}
		});

		it('does not duplicate existing slides', async () => {
			// First initialization
			await initializeDefaultSlideConfig();
			const firstCount = (await getAllSlideConfigs()).length;

			// Second initialization
			await initializeDefaultSlideConfig();
			const secondCount = (await getAllSlideConfigs()).length;

			expect(secondCount).toBe(firstCount);
		});

		it('migrates disabled slides to enabled on first run', async () => {
			// Insert a disabled slide manually (simulating bug where slides were created disabled)
			await db.insert(slideConfig).values({
				slideType: 'total-time',
				enabled: false,
				sortOrder: 0
			});

			// Run initialization (should migrate)
			await initializeDefaultSlideConfig();

			const config = await getSlideConfigByType('total-time');
			expect(config?.enabled).toBe(true);
		});

		it('does not re-migrate on subsequent runs', async () => {
			// First initialization with migration
			await initializeDefaultSlideConfig();

			// Disable a slide
			await updateSlideConfig('total-time', { enabled: false });

			// Second initialization (should not override user's choice)
			await initializeDefaultSlideConfig();

			const config = await getSlideConfigByType('total-time');
			expect(config?.enabled).toBe(false);
		});

		it('creates migration marker in appSettings', async () => {
			await initializeDefaultSlideConfig();

			const marker = await db
				.select()
				.from(appSettings)
				.where(eq(appSettings.key, 'slides_enabled_migration_v1'))
				.limit(1);

			expect(marker.length).toBe(1);
			expect(marker[0]?.value).toBe('applied');
		});
	});

	describe('getAllSlideConfigs', () => {
		it('returns empty array when no configs exist', async () => {
			const configs = await getAllSlideConfigs();
			expect(configs).toEqual([]);
		});

		it('returns configs sorted by sortOrder', async () => {
			await db.insert(slideConfig).values([
				{ slideType: 'total-time', enabled: true, sortOrder: 2 },
				{ slideType: 'top-movies', enabled: true, sortOrder: 0 },
				{ slideType: 'genres', enabled: true, sortOrder: 1 }
			]);

			const configs = await getAllSlideConfigs();

			expect(configs[0]?.slideType).toBe('top-movies');
			expect(configs[1]?.slideType).toBe('genres');
			expect(configs[2]?.slideType).toBe('total-time');
		});
	});

	describe('getSlideConfigByType', () => {
		it('returns null for non-existent type', async () => {
			const config = await getSlideConfigByType('total-time');
			expect(config).toBeNull();
		});

		it('returns config for existing type', async () => {
			await db.insert(slideConfig).values({
				slideType: 'total-time',
				enabled: true,
				sortOrder: 0
			});

			const config = await getSlideConfigByType('total-time');

			expect(config).not.toBeNull();
			expect(config?.slideType).toBe('total-time');
			expect(config?.enabled).toBe(true);
		});
	});

	describe('getEnabledSlides', () => {
		it('returns only enabled slides', async () => {
			await db.insert(slideConfig).values([
				{ slideType: 'total-time', enabled: true, sortOrder: 0 },
				{ slideType: 'top-movies', enabled: false, sortOrder: 1 },
				{ slideType: 'genres', enabled: true, sortOrder: 2 }
			]);

			const enabled = await getEnabledSlides();

			expect(enabled.length).toBe(2);
			expect(enabled.every((s) => s.enabled)).toBe(true);
		});

		it('returns slides in sortOrder', async () => {
			await db.insert(slideConfig).values([
				{ slideType: 'total-time', enabled: true, sortOrder: 2 },
				{ slideType: 'genres', enabled: true, sortOrder: 0 }
			]);

			const enabled = await getEnabledSlides();

			expect(enabled[0]?.slideType).toBe('genres');
			expect(enabled[1]?.slideType).toBe('total-time');
		});
	});

	describe('updateSlideConfig', () => {
		beforeEach(async () => {
			await initializeDefaultSlideConfig();
		});

		it('updates enabled state', async () => {
			const updated = await updateSlideConfig('total-time', { enabled: false });

			expect(updated.enabled).toBe(false);
		});

		it('updates sortOrder', async () => {
			const updated = await updateSlideConfig('total-time', { sortOrder: 99 });

			expect(updated.sortOrder).toBe(99);
		});

		it('updates both enabled and sortOrder', async () => {
			const updated = await updateSlideConfig('total-time', {
				enabled: false,
				sortOrder: 50
			});

			expect(updated.enabled).toBe(false);
			expect(updated.sortOrder).toBe(50);
		});

		it('throws INVALID_SLIDE_TYPE for invalid type', async () => {
			let error: SlideError | null = null;

			try {
				await updateSlideConfig('invalid-type' as any, { enabled: false });
			} catch (e) {
				if (e instanceof SlideError) {
					error = e;
				}
			}

			expect(error).not.toBeNull();
			expect(error?.code).toBe('INVALID_SLIDE_TYPE');
			expect(error?.message).toContain('Invalid slide type');
		});

		it('throws NOT_FOUND for non-existent slide', async () => {
			// Delete all configs first
			await db.delete(slideConfig);

			let error: SlideError | null = null;

			try {
				await updateSlideConfig('total-time', { enabled: false });
			} catch (e) {
				if (e instanceof SlideError) {
					error = e;
				}
			}

			expect(error).not.toBeNull();
			expect(error?.code).toBe('NOT_FOUND');
			expect(error?.message).toContain('Slide config not found');
		});

		it('handles empty update gracefully', async () => {
			const original = await getSlideConfigByType('total-time');
			const updated = await updateSlideConfig('total-time', {});

			expect(original).not.toBeNull();
			expect(updated.enabled).toBe(original!.enabled);
			expect(updated.sortOrder).toBe(original!.sortOrder);
		});
	});

	describe('reorderSlides', () => {
		beforeEach(async () => {
			await initializeDefaultSlideConfig();
		});

		it('updates sortOrder based on new order', async () => {
			const newOrder = ['genres', 'total-time', 'top-movies'] as const;
			await reorderSlides([...newOrder]);

			const genres = await getSlideConfigByType('genres');
			const totalTime = await getSlideConfigByType('total-time');
			const topMovies = await getSlideConfigByType('top-movies');

			expect(genres?.sortOrder).toBe(0);
			expect(totalTime?.sortOrder).toBe(1);
			expect(topMovies?.sortOrder).toBe(2);
		});

		it('throws INVALID_SLIDE_TYPE for invalid type in array', async () => {
			let error: SlideError | null = null;

			try {
				await reorderSlides(['total-time', 'invalid-type' as any, 'genres']);
			} catch (e) {
				if (e instanceof SlideError) {
					error = e;
				}
			}

			expect(error).not.toBeNull();
			expect(error?.code).toBe('INVALID_SLIDE_TYPE');
		});

		it('returns all configs in new order', async () => {
			const newOrder = ['genres', 'total-time'] as const;
			const result = await reorderSlides([...newOrder]);

			// Should return all configs sorted by sortOrder
			expect(result.length).toBeGreaterThan(0);
			// First two should be in our specified order
			expect(result[0]?.slideType).toBe('genres');
			expect(result[1]?.slideType).toBe('total-time');
		});
	});

	describe('toggleSlide', () => {
		beforeEach(async () => {
			await initializeDefaultSlideConfig();
		});

		it('toggles enabled slide to disabled', async () => {
			// Ensure it's enabled first
			const original = await getSlideConfigByType('total-time');
			expect(original?.enabled).toBe(true);

			const toggled = await toggleSlide('total-time');
			expect(toggled.enabled).toBe(false);
		});

		it('toggles disabled slide to enabled', async () => {
			// First disable it
			await updateSlideConfig('total-time', { enabled: false });

			const toggled = await toggleSlide('total-time');
			expect(toggled.enabled).toBe(true);
		});

		it('throws NOT_FOUND for non-existent slide', async () => {
			await db.delete(slideConfig);

			let error: SlideError | null = null;

			try {
				await toggleSlide('total-time');
			} catch (e) {
				if (e instanceof SlideError) {
					error = e;
				}
			}

			expect(error).not.toBeNull();
			expect(error?.code).toBe('NOT_FOUND');
		});
	});

	describe('resetToDefaultConfig', () => {
		it('clears and reinitializes all configs', async () => {
			// Initialize and modify
			await initializeDefaultSlideConfig();
			await updateSlideConfig('total-time', { enabled: false, sortOrder: 99 });

			// Reset
			await resetToDefaultConfig();

			const config = await getSlideConfigByType('total-time');
			expect(config?.enabled).toBe(true);
			expect(config?.sortOrder).toBe(0); // Should be back at default position
		});
	});
});
