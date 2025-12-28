import { db } from '$lib/server/db/client';
import { slideConfig, appSettings } from '$lib/server/db/schema';
import { eq, asc } from 'drizzle-orm';
import { DEFAULT_SLIDE_ORDER, type SlideType } from '$lib/components/slides/types';
import {
	SlideTypeSchema,
	SlideError,
	type SlideConfig,
	type UpdateSlideConfig,
	type SlideTypeValue
} from './types';

const SLIDES_ENABLED_MIGRATION_KEY = 'slides_enabled_migration_v1';
const FUN_FACT_REMOVAL_MIGRATION_KEY = 'fun_fact_slide_removal_v1';

/**
 * Initialize default slide configuration.
 * Creates entries for all standard slide types and applies migrations.
 */
export async function initializeDefaultSlideConfig(): Promise<void> {
	// Check if the enabled migration has been applied
	const migrationApplied = await db
		.select()
		.from(appSettings)
		.where(eq(appSettings.key, SLIDES_ENABLED_MIGRATION_KEY))
		.limit(1);

	const needsMigration = migrationApplied.length === 0;

	// Check if fun-fact removal migration has been applied
	const funFactRemovalApplied = await db
		.select()
		.from(appSettings)
		.where(eq(appSettings.key, FUN_FACT_REMOVAL_MIGRATION_KEY))
		.limit(1);

	const needsFunFactRemoval = funFactRemovalApplied.length === 0;

	// Apply fun-fact removal migration if needed
	if (needsFunFactRemoval) {
		// Delete any fun-fact entries from slideConfig
		await db.delete(slideConfig).where(eq(slideConfig.slideType, 'fun-fact'));

		// Mark migration as applied
		await db
			.insert(appSettings)
			.values({ key: FUN_FACT_REMOVAL_MIGRATION_KEY, value: 'applied' })
			.onConflictDoNothing();
	}

	// Fetch all existing configs in a single query
	const existingConfigs = await db.select().from(slideConfig);
	const existingTypes = new Set(existingConfigs.map((c) => c.slideType));

	// Calculate next sortOrder (after all existing slides)
	const maxSortOrder =
		existingConfigs.length > 0 ? Math.max(...existingConfigs.map((c) => c.sortOrder)) : -1;

	let nextSortOrder = maxSortOrder + 1;

	// Process default slides
	for (const slideType of DEFAULT_SLIDE_ORDER) {
		if (!existingTypes.has(slideType)) {
			// Insert missing slide with enabled: true
			await db.insert(slideConfig).values({
				slideType,
				enabled: true,
				sortOrder: nextSortOrder++
			});
		} else if (needsMigration) {
			// One-time migration: ensure existing default slides are enabled
			// This fixes slides that were created with enabled: false from a previous bug
			await db
				.update(slideConfig)
				.set({ enabled: true })
				.where(eq(slideConfig.slideType, slideType));
		}
	}

	// Mark migration as applied
	if (needsMigration) {
		await db
			.insert(appSettings)
			.values({ key: SLIDES_ENABLED_MIGRATION_KEY, value: 'applied' })
			.onConflictDoNothing();
	}
}

export async function getAllSlideConfigs(): Promise<SlideConfig[]> {
	const results = await db.select().from(slideConfig).orderBy(asc(slideConfig.sortOrder));

	return results.map((record) => ({
		id: record.id,
		slideType: record.slideType as SlideTypeValue,
		enabled: record.enabled ?? true,
		sortOrder: record.sortOrder
	}));
}

export async function getSlideConfigByType(type: SlideType): Promise<SlideConfig | null> {
	const result = await db
		.select()
		.from(slideConfig)
		.where(eq(slideConfig.slideType, type))
		.limit(1);

	const record = result[0];
	if (!record) {
		return null;
	}

	return {
		id: record.id,
		slideType: record.slideType as SlideTypeValue,
		enabled: record.enabled ?? true,
		sortOrder: record.sortOrder
	};
}

export async function getEnabledSlides(): Promise<SlideConfig[]> {
	const results = await db
		.select()
		.from(slideConfig)
		.where(eq(slideConfig.enabled, true))
		.orderBy(asc(slideConfig.sortOrder));

	return results.map((record) => ({
		id: record.id,
		slideType: record.slideType as SlideTypeValue,
		enabled: true,
		sortOrder: record.sortOrder
	}));
}

export async function updateSlideConfig(
	type: SlideType,
	updates: UpdateSlideConfig
): Promise<SlideConfig> {
	// Validate the slide type
	const parsed = SlideTypeSchema.safeParse(type);
	if (!parsed.success) {
		throw new SlideError(`Invalid slide type: ${type}`, 'INVALID_SLIDE_TYPE');
	}

	// Check if the slide config exists
	const existing = await getSlideConfigByType(type);
	if (!existing) {
		throw new SlideError(`Slide config not found for type: ${type}`, 'NOT_FOUND');
	}

	// Prepare update values
	const updateValues: Record<string, unknown> = {};

	if (updates.enabled !== undefined) {
		updateValues.enabled = updates.enabled;
	}

	if (updates.sortOrder !== undefined) {
		updateValues.sortOrder = updates.sortOrder;
	}

	// Only update if there are changes
	if (Object.keys(updateValues).length > 0) {
		await db.update(slideConfig).set(updateValues).where(eq(slideConfig.slideType, type));
	}

	// Return updated config
	const updated = await getSlideConfigByType(type);
	if (!updated) {
		throw new SlideError('Failed to retrieve updated config', 'UPDATE_FAILED');
	}

	return updated;
}

export async function reorderSlides(newOrder: SlideType[]): Promise<SlideConfig[]> {
	// Validate all slide types
	for (const type of newOrder) {
		const parsed = SlideTypeSchema.safeParse(type);
		if (!parsed.success) {
			throw new SlideError(`Invalid slide type: ${type}`, 'INVALID_SLIDE_TYPE');
		}
	}

	// Update each slide's sortOrder
	for (let i = 0; i < newOrder.length; i++) {
		const slideType = newOrder[i];
		if (!slideType) continue;

		await db.update(slideConfig).set({ sortOrder: i }).where(eq(slideConfig.slideType, slideType));
	}

	// Return updated configs
	return getAllSlideConfigs();
}

export async function toggleSlide(type: SlideType): Promise<SlideConfig> {
	const existing = await getSlideConfigByType(type);
	if (!existing) {
		throw new SlideError(`Slide config not found for type: ${type}`, 'NOT_FOUND');
	}

	return updateSlideConfig(type, { enabled: !existing.enabled });
}

/** Reset to default configuration (primarily used for testing). */
export async function resetToDefaultConfig(): Promise<void> {
	// Delete all existing configs
	await db.delete(slideConfig);

	// Reinitialize with defaults
	await initializeDefaultSlideConfig();
}
