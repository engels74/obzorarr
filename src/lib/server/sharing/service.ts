import { and, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { appSettings, shareSettings } from '$lib/server/db/schema';
import {
	type GetOrCreateShareSettingsOptions,
	type GlobalShareDefaults,
	meetsPrivacyFloor,
	PermissionExceededError,
	ShareError,
	ShareMode,
	ShareModeSchema,
	ShareModeSource,
	type ShareModeSourceType,
	type ShareModeType,
	type ShareSettings,
	ShareSettingsKey,
	ShareSettingsNotFoundError,
	type UpdateShareSettings
} from './types';

type ShareSettingsRecord = typeof shareSettings.$inferSelect;

export function generateShareToken(): string {
	return crypto.randomUUID();
}

export function isValidTokenFormat(token: string): boolean {
	const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
	return uuidV4Regex.test(token);
}

export async function getGlobalDefaultShareMode(): Promise<ShareModeType> {
	const result = await db
		.select()
		.from(appSettings)
		.where(eq(appSettings.key, ShareSettingsKey.DEFAULT_SHARE_MODE))
		.limit(1);

	const setting = result[0];
	if (!setting) {
		return ShareMode.PUBLIC;
	}

	const parsed = ShareModeSchema.safeParse(setting.value);
	return parsed.success ? parsed.data : ShareMode.PUBLIC;
}

export async function getGlobalAllowUserControl(): Promise<boolean> {
	const result = await db
		.select()
		.from(appSettings)
		.where(eq(appSettings.key, ShareSettingsKey.ALLOW_USER_CONTROL))
		.limit(1);

	const setting = result[0];
	if (!setting) {
		return false;
	}

	return setting.value === 'true';
}

export async function setGlobalShareDefaults(defaults: GlobalShareDefaults): Promise<void> {
	await db.transaction(async (tx) => {
		await tx
			.insert(appSettings)
			.values({
				key: ShareSettingsKey.DEFAULT_SHARE_MODE,
				value: defaults.defaultShareMode
			})
			.onConflictDoUpdate({
				target: appSettings.key,
				set: { value: defaults.defaultShareMode }
			});

		await tx
			.insert(appSettings)
			.values({
				key: ShareSettingsKey.ALLOW_USER_CONTROL,
				value: String(defaults.allowUserControl)
			})
			.onConflictDoUpdate({
				target: appSettings.key,
				set: { value: String(defaults.allowUserControl) }
			});

		// Rotate tokens for default-sourced rows when the new global default is
		// no longer PRIVATE_LINK. Any captured token from a previous PRIVATE_LINK
		// default becomes unusable; getShareSettings re-mints on demand if the
		// default later flips back to PRIVATE_LINK.
		if (defaults.defaultShareMode !== ShareMode.PRIVATE_LINK) {
			await tx
				.update(shareSettings)
				.set({ shareToken: null })
				.where(eq(shareSettings.modeSource, ShareModeSource.DEFAULT));
		}
	});
}

export async function bulkApplyUserControl(canUserControl: boolean): Promise<number> {
	const result = await db
		.update(shareSettings)
		.set({ canUserControl })
		.returning({ id: shareSettings.id });
	return result.length;
}

export async function getServerWrappedShareMode(): Promise<ShareModeType> {
	const result = await db
		.select()
		.from(appSettings)
		.where(eq(appSettings.key, ShareSettingsKey.SERVER_WRAPPED_SHARE_MODE))
		.limit(1);

	const setting = result[0];
	if (!setting) {
		return ShareMode.PUBLIC;
	}

	const parsed = ShareModeSchema.safeParse(setting.value);
	return parsed.success ? parsed.data : ShareMode.PUBLIC;
}

export async function setServerWrappedShareMode(mode: ShareModeType): Promise<void> {
	await db
		.insert(appSettings)
		.values({
			key: ShareSettingsKey.SERVER_WRAPPED_SHARE_MODE,
			value: mode
		})
		.onConflictDoUpdate({
			target: appSettings.key,
			set: { value: mode }
		});
}

export async function getShareSettings(
	userId: number,
	year: number
): Promise<ShareSettings | null> {
	const result = await db
		.select()
		.from(shareSettings)
		.where(and(eq(shareSettings.userId, userId), eq(shareSettings.year, year)))
		.limit(1);

	const record = result[0];
	if (!record) {
		return null;
	}

	const globalDefault = await getGlobalDefaultShareMode();
	const settings = toShareSettings(record, globalDefault);

	if (settings.mode !== ShareMode.PRIVATE_LINK || settings.shareToken) {
		return settings;
	}

	const generatedToken = generateShareToken();

	await db
		.update(shareSettings)
		.set({ shareToken: generatedToken })
		.where(
			and(
				eq(shareSettings.userId, record.userId),
				eq(shareSettings.year, record.year),
				isNull(shareSettings.shareToken)
			)
		);

	const refreshed = await db
		.select({ shareToken: shareSettings.shareToken })
		.from(shareSettings)
		.where(and(eq(shareSettings.userId, record.userId), eq(shareSettings.year, record.year)))
		.limit(1);

	return { ...settings, shareToken: refreshed[0]?.shareToken ?? generatedToken };
}

function toShareSettings(record: ShareSettingsRecord, globalDefault: ShareModeType): ShareSettings {
	const storedMode = record.mode as ShareModeType;
	const modeSource = (record.modeSource ?? ShareModeSource.EXPLICIT) as ShareModeSourceType;
	const mode = modeSource === ShareModeSource.DEFAULT ? globalDefault : storedMode;

	// Defense-in-depth: never expose a stored token unless the effective mode is
	// PRIVATE_LINK. This guards against capture-and-replay if a row still holds
	// a token after the effective mode was widened (e.g. global default changed).
	const shareToken = mode === ShareMode.PRIVATE_LINK ? record.shareToken : null;

	return {
		userId: record.userId,
		year: record.year,
		mode,
		storedMode,
		modeSource,
		shareToken,
		canUserControl: record.canUserControl ?? false
	};
}

export async function getOrCreateShareSettings(
	options: GetOrCreateShareSettingsOptions
): Promise<ShareSettings> {
	const { userId, year, createIfMissing = true } = options;

	const existing = await getShareSettings(userId, year);
	if (existing) {
		return existing;
	}

	if (!createIfMissing) {
		throw new ShareSettingsNotFoundError();
	}

	const defaultMode = await getGlobalDefaultShareMode();
	const allowUserControl = await getGlobalAllowUserControl();
	const shareToken = defaultMode === ShareMode.PRIVATE_LINK ? generateShareToken() : null;

	const result = await db
		.insert(shareSettings)
		.values({
			userId,
			year,
			mode: defaultMode,
			modeSource: ShareModeSource.DEFAULT,
			shareToken,
			canUserControl: allowUserControl
		})
		.returning();

	const record = result[0];
	if (!record) {
		throw new ShareError('Failed to create share settings', 'CREATE_FAILED');
	}

	return toShareSettings(record, defaultMode);
}

export async function updateShareSettings(
	userId: number,
	year: number,
	updates: UpdateShareSettings,
	isAdmin: boolean
): Promise<ShareSettings> {
	const existing = await getOrCreateShareSettings({ userId, year });

	if (!isAdmin) {
		if (!existing.canUserControl) {
			throw new PermissionExceededError('You do not have permission to change share settings.');
		}

		if (updates.mode !== undefined) {
			const globalFloor = await getGlobalDefaultShareMode();
			if (!meetsPrivacyFloor(updates.mode, globalFloor)) {
				throw new PermissionExceededError(
					`Cannot set share mode to "${updates.mode}". Server requires at least "${globalFloor}" privacy level.`
				);
			}
		}

		if (updates.canUserControl !== undefined) {
			throw new PermissionExceededError('Only admins can change user control permissions.');
		}
	}

	const updateValues: Record<string, unknown> = {};

	if (updates.mode !== undefined) {
		updateValues.mode = updates.mode;
		updateValues.modeSource = ShareModeSource.EXPLICIT;

		if (updates.mode === ShareMode.PRIVATE_LINK && !existing.shareToken) {
			updateValues.shareToken = generateShareToken();
		}

		if (updates.mode !== ShareMode.PRIVATE_LINK) {
			updateValues.shareToken = null;
		}
	}

	if (updates.canUserControl !== undefined && isAdmin) {
		updateValues.canUserControl = updates.canUserControl;
	}

	if (Object.keys(updateValues).length > 0) {
		await db
			.update(shareSettings)
			.set(updateValues)
			.where(and(eq(shareSettings.userId, userId), eq(shareSettings.year, year)));
	}

	const updated = await getShareSettings(userId, year);
	if (!updated) {
		throw new ShareError('Failed to retrieve updated settings', 'UPDATE_FAILED');
	}

	return updated;
}

export async function regenerateShareToken(userId: number, year: number): Promise<string> {
	const settings = await getShareSettings(userId, year);

	if (!settings) {
		throw new ShareSettingsNotFoundError();
	}

	if (settings.mode !== ShareMode.PRIVATE_LINK) {
		throw new ShareError('Can only regenerate token for private-link mode', 'INVALID_MODE', 400);
	}

	const newToken = generateShareToken();

	await db
		.update(shareSettings)
		.set({ shareToken: newToken })
		.where(and(eq(shareSettings.userId, userId), eq(shareSettings.year, year)));

	return newToken;
}

export async function ensureShareToken(userId: number, year: number): Promise<string> {
	const settings = await getShareSettings(userId, year);

	if (!settings) {
		throw new ShareSettingsNotFoundError();
	}

	if (settings.shareToken) {
		return settings.shareToken;
	}

	const newToken = generateShareToken();

	await db
		.update(shareSettings)
		.set({ shareToken: newToken })
		.where(and(eq(shareSettings.userId, userId), eq(shareSettings.year, year)));

	return newToken;
}

export async function getShareSettingsByToken(token: string): Promise<ShareSettings | null> {
	if (!isValidTokenFormat(token)) {
		return null;
	}

	const result = await db
		.select()
		.from(shareSettings)
		.where(eq(shareSettings.shareToken, token))
		.limit(1);

	const record = result[0];
	if (!record) {
		return null;
	}

	return toShareSettings(record, await getGlobalDefaultShareMode());
}

export async function deleteShareSettings(userId: number, year: number): Promise<void> {
	await db
		.delete(shareSettings)
		.where(and(eq(shareSettings.userId, userId), eq(shareSettings.year, year)));
}

export async function getAllUserShareSettings(userId: number): Promise<ShareSettings[]> {
	const results = await db.select().from(shareSettings).where(eq(shareSettings.userId, userId));
	const globalDefault = await getGlobalDefaultShareMode();

	return results.map((record) => toShareSettings(record, globalDefault));
}

export async function updateUserLogoPreference(
	userId: number,
	year: number,
	showLogo: boolean | null
): Promise<void> {
	const existing = await getShareSettings(userId, year);

	if (existing) {
		await db
			.update(shareSettings)
			.set({ showLogo })
			.where(and(eq(shareSettings.userId, userId), eq(shareSettings.year, year)));
	} else {
		const defaultMode = await getGlobalDefaultShareMode();
		const allowUserControl = await getGlobalAllowUserControl();
		const shareToken = defaultMode === ShareMode.PRIVATE_LINK ? generateShareToken() : null;

		await db.insert(shareSettings).values({
			userId,
			year,
			mode: defaultMode,
			modeSource: ShareModeSource.DEFAULT,
			shareToken,
			canUserControl: allowUserControl,
			showLogo
		});
	}
}

export async function getUserLogoPreference(userId: number, year: number): Promise<boolean | null> {
	const result = await db
		.select({ showLogo: shareSettings.showLogo })
		.from(shareSettings)
		.where(and(eq(shareSettings.userId, userId), eq(shareSettings.year, year)))
		.limit(1);

	return result[0]?.showLogo ?? null;
}
