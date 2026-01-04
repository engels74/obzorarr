import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { appSettings } from '$lib/server/db/schema';
import {
	type AnonymizableUser,
	AnonymizationMode,
	AnonymizationModeSchema,
	type AnonymizationModeType,
	AnonymizationSettingsKey,
	type PerStatAnonymizationSettings,
	PerStatAnonymizationSettingsSchema
} from './types';

export function applyAnonymization<T extends AnonymizableUser>(
	users: T[],
	mode: AnonymizationModeType,
	viewingUserId: number | null
): T[] {
	// Hybrid mode falls back to anonymous if no authenticated user
	const effectiveMode =
		mode === AnonymizationMode.HYBRID && viewingUserId === null
			? AnonymizationMode.ANONYMOUS
			: mode;

	switch (effectiveMode) {
		case AnonymizationMode.REAL:
			return users;

		case AnonymizationMode.ANONYMOUS:
			return users.map((user, index) => ({
				...user,
				username: generateAnonymousIdentifier(index)
			}));

		case AnonymizationMode.HYBRID:
			return users.map((user, index) => ({
				...user,
				username: user.userId === viewingUserId ? user.username : generateAnonymousIdentifier(index)
			}));
	}
}

export function generateAnonymousIdentifier(index: number): string {
	return `User #${index + 1}`;
}

export async function getGlobalAnonymizationMode(): Promise<AnonymizationModeType> {
	const result = await db
		.select()
		.from(appSettings)
		.where(eq(appSettings.key, AnonymizationSettingsKey.DEFAULT_MODE))
		.limit(1);

	const setting = result[0];
	if (!setting) {
		return AnonymizationMode.REAL;
	}

	const parsed = AnonymizationModeSchema.safeParse(setting.value);
	return parsed.success ? parsed.data : AnonymizationMode.REAL;
}

export async function setGlobalAnonymizationMode(mode: AnonymizationModeType): Promise<void> {
	await db
		.insert(appSettings)
		.values({
			key: AnonymizationSettingsKey.DEFAULT_MODE,
			value: mode
		})
		.onConflictDoUpdate({
			target: appSettings.key,
			set: { value: mode }
		});
}

export async function getPerStatAnonymization(): Promise<PerStatAnonymizationSettings> {
	const result = await db
		.select()
		.from(appSettings)
		.where(eq(appSettings.key, AnonymizationSettingsKey.PER_STAT_SETTINGS))
		.limit(1);

	const setting = result[0];
	if (!setting) {
		return {};
	}

	try {
		const parsed = PerStatAnonymizationSettingsSchema.safeParse(JSON.parse(setting.value));
		return parsed.success ? parsed.data : {};
	} catch {
		return {};
	}
}

export async function setPerStatAnonymization(
	settings: PerStatAnonymizationSettings
): Promise<void> {
	const value = JSON.stringify(settings);

	await db
		.insert(appSettings)
		.values({
			key: AnonymizationSettingsKey.PER_STAT_SETTINGS,
			value
		})
		.onConflictDoUpdate({
			target: appSettings.key,
			set: { value }
		});
}

export async function getAnonymizationModeForStat(
	statName: keyof PerStatAnonymizationSettings
): Promise<AnonymizationModeType> {
	const perStatSettings = await getPerStatAnonymization();
	const override = perStatSettings[statName];

	if (override) {
		return override;
	}

	return getGlobalAnonymizationMode();
}
