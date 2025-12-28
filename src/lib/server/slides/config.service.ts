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

export async function initializeDefaultSlideConfig(): Promise<void> {
	const migrationApplied = await db
		.select()
		.from(appSettings)
		.where(eq(appSettings.key, SLIDES_ENABLED_MIGRATION_KEY))
		.limit(1);

	const needsMigration = migrationApplied.length === 0;

	const funFactRemovalApplied = await db
		.select()
		.from(appSettings)
		.where(eq(appSettings.key, FUN_FACT_REMOVAL_MIGRATION_KEY))
		.limit(1);

	const needsFunFactRemoval = funFactRemovalApplied.length === 0;

	if (needsFunFactRemoval) {
		await db.delete(slideConfig).where(eq(slideConfig.slideType, 'fun-fact'));

		await db
			.insert(appSettings)
			.values({ key: FUN_FACT_REMOVAL_MIGRATION_KEY, value: 'applied' })
			.onConflictDoNothing();
	}

	const existingConfigs = await db.select().from(slideConfig);
	const existingTypes = new Set(existingConfigs.map((c) => c.slideType));

	const maxSortOrder =
		existingConfigs.length > 0 ? Math.max(...existingConfigs.map((c) => c.sortOrder)) : -1;

	let nextSortOrder = maxSortOrder + 1;

	for (const slideType of DEFAULT_SLIDE_ORDER) {
		if (!existingTypes.has(slideType)) {
			await db.insert(slideConfig).values({
				slideType,
				enabled: true,
				sortOrder: nextSortOrder++
			});
		} else if (needsMigration) {
			// One-time migration: fixes slides created with enabled: false from a previous bug
			await db
				.update(slideConfig)
				.set({ enabled: true })
				.where(eq(slideConfig.slideType, slideType));
		}
	}

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
	const parsed = SlideTypeSchema.safeParse(type);
	if (!parsed.success) {
		throw new SlideError(`Invalid slide type: ${type}`, 'INVALID_SLIDE_TYPE');
	}

	const existing = await getSlideConfigByType(type);
	if (!existing) {
		throw new SlideError(`Slide config not found for type: ${type}`, 'NOT_FOUND');
	}

	const updateValues: Record<string, unknown> = {};

	if (updates.enabled !== undefined) {
		updateValues.enabled = updates.enabled;
	}

	if (updates.sortOrder !== undefined) {
		updateValues.sortOrder = updates.sortOrder;
	}

	if (Object.keys(updateValues).length > 0) {
		await db.update(slideConfig).set(updateValues).where(eq(slideConfig.slideType, type));
	}

	const updated = await getSlideConfigByType(type);
	if (!updated) {
		throw new SlideError('Failed to retrieve updated config', 'UPDATE_FAILED');
	}

	return updated;
}

export async function reorderSlides(newOrder: SlideType[]): Promise<SlideConfig[]> {
	for (const type of newOrder) {
		const parsed = SlideTypeSchema.safeParse(type);
		if (!parsed.success) {
			throw new SlideError(`Invalid slide type: ${type}`, 'INVALID_SLIDE_TYPE');
		}
	}

	for (let i = 0; i < newOrder.length; i++) {
		const slideType = newOrder[i];
		if (!slideType) continue;

		await db.update(slideConfig).set({ sortOrder: i }).where(eq(slideConfig.slideType, slideType));
	}

	return getAllSlideConfigs();
}

export async function toggleSlide(type: SlideType): Promise<SlideConfig> {
	const existing = await getSlideConfigByType(type);
	if (!existing) {
		throw new SlideError(`Slide config not found for type: ${type}`, 'NOT_FOUND');
	}

	return updateSlideConfig(type, { enabled: !existing.enabled });
}

export async function resetToDefaultConfig(): Promise<void> {
	await db.delete(slideConfig);
	await initializeDefaultSlideConfig();
}
