import { and, eq, isNull, ne } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { appSettings, shareSettings } from '$lib/server/db/schema';
import {
	type GetOrCreateShareSettingsOptions,
	type GlobalShareDefaults,
	getMoreRestrictiveMode,
	meetsPrivacyFloor,
	PermissionExceededError,
	ServerWrappedShareModeSchema,
	type ServerWrappedShareModeType,
	ShareError,
	ShareMode,
	ShareModeSchema,
	ShareModeSource,
	ShareModeSourceSchema,
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

export function isPureNumericId(value: string): boolean {
	return /^\d+$/.test(value);
}

function normalizeShareModeSource(value: string | null): ShareModeSourceType {
	const parsed = ShareModeSourceSchema.safeParse(value ?? ShareModeSource.EXPLICIT);
	return parsed.success ? parsed.data : ShareModeSource.EXPLICIT;
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

export async function getEffectiveShareMode(userId: number, year: number): Promise<ShareModeType> {
	const globalDefault = await getGlobalDefaultShareMode();
	const result = await db
		.select({
			mode: shareSettings.mode,
			modeSource: shareSettings.modeSource
		})
		.from(shareSettings)
		.where(and(eq(shareSettings.userId, userId), eq(shareSettings.year, year)))
		.limit(1);

	const record = result[0];
	if (!record) {
		return globalDefault;
	}

	const parsed = ShareModeSchema.safeParse(record.mode);
	const storedMode = parsed.success ? parsed.data : globalDefault;
	const source = normalizeShareModeSource(record.modeSource);
	const rowMode = source === ShareModeSource.DEFAULT ? globalDefault : storedMode;
	return getMoreRestrictiveMode(rowMode, globalDefault);
}

export async function setGlobalShareDefaults(defaults: GlobalShareDefaults): Promise<void> {
	const now = new Date();
	await db.transaction(async (tx) => {
		await tx
			.insert(appSettings)
			.values({
				key: ShareSettingsKey.DEFAULT_SHARE_MODE,
				value: defaults.defaultShareMode,
				updatedAt: now
			})
			.onConflictDoUpdate({
				target: appSettings.key,
				set: { value: defaults.defaultShareMode, updatedAt: now }
			});

		await tx
			.insert(appSettings)
			.values({
				key: ShareSettingsKey.ALLOW_USER_CONTROL,
				value: String(defaults.allowUserControl),
				updatedAt: now
			})
			.onConflictDoUpdate({
				target: appSettings.key,
				set: { value: String(defaults.allowUserControl), updatedAt: now }
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

export interface BulkApplyShareDefaultsResult {
	/** Rows whose mode was (re)set to the current default. */
	updated: number;
	/** Rows left untouched because they carry an explicit per-user override. */
	skipped: number;
}

/**
 * Apply the current global defaults to existing share rows WITHOUT clobbering
 * explicit per-user overrides (ISSUE-006). Only rows whose `modeSource` is NOT
 * `explicit` (i.e. default-sourced rows) are rewritten; rows a user/admin
 * explicitly set are skipped and counted separately. Token rotation for a
 * PRIVATE_LINK default only touches the updated (default-sourced) rows.
 */
export async function bulkApplyShareDefaults(): Promise<BulkApplyShareDefaultsResult> {
	return db.transaction(async (tx) => {
		const defaultsResult = await tx
			.select({ key: appSettings.key, value: appSettings.value })
			.from(appSettings)
			.where(eq(appSettings.key, ShareSettingsKey.DEFAULT_SHARE_MODE))
			.limit(1);

		const allowResult = await tx
			.select({ value: appSettings.value })
			.from(appSettings)
			.where(eq(appSettings.key, ShareSettingsKey.ALLOW_USER_CONTROL))
			.limit(1);

		const parsedDefault = ShareModeSchema.safeParse(defaultsResult[0]?.value);
		const defaultMode: ShareModeType = parsedDefault.success
			? parsedDefault.data
			: ShareMode.PUBLIC;
		const allowUserControl = allowResult[0]?.value === 'true';

		// Operators need to know explicit per-user overrides were preserved, not missed.
		const explicitRows = await tx
			.select({ id: shareSettings.id })
			.from(shareSettings)
			.where(eq(shareSettings.modeSource, ShareModeSource.EXPLICIT));
		const skipped = explicitRows.length;

		const baseUpdate: Record<string, unknown> = {
			mode: defaultMode,
			modeSource: ShareModeSource.DEFAULT,
			canUserControl: allowUserControl
		};

		if (defaultMode !== ShareMode.PRIVATE_LINK) {
			baseUpdate.shareToken = null;
		}

		// Bulk apply must never erase a user/admin override.
		const updated = await tx
			.update(shareSettings)
			.set(baseUpdate)
			.where(ne(shareSettings.modeSource, ShareModeSource.EXPLICIT))
			.returning({
				id: shareSettings.id,
				userId: shareSettings.userId,
				year: shareSettings.year,
				shareToken: shareSettings.shareToken
			});

		if (defaultMode === ShareMode.PRIVATE_LINK) {
			for (const row of updated) {
				if (!row.shareToken) {
					await tx
						.update(shareSettings)
						.set({ shareToken: generateShareToken() })
						.where(
							and(
								eq(shareSettings.userId, row.userId),
								eq(shareSettings.year, row.year),
								isNull(shareSettings.shareToken)
							)
						);
				}
			}
		}

		return { updated: updated.length, skipped };
	});
}

export async function getServerWrappedShareMode(): Promise<ServerWrappedShareModeType> {
	const result = await db
		.select()
		.from(appSettings)
		.where(eq(appSettings.key, ShareSettingsKey.SERVER_WRAPPED_SHARE_MODE))
		.limit(1);

	const setting = result[0];
	if (!setting) {
		// DF-004 (privacy-by-default): a fresh install with no stored row defaults
		// the server-wide /wrapped recap to PRIVATE_OAUTH (server-members-only),
		// not PUBLIC, so an anonymous visitor cannot see the aggregate recap before
		// an admin opts in. PRIVATE_OAUTH is the most-private value supported for
		// this surface (private-link is not supported server-wide). Fresh-install
		// default only — a stored row wins via the parse below, so existing installs
		// keep their saved mode. See docs/decisions/0002-anonymized-by-default.md.
		return ShareMode.PRIVATE_OAUTH;
	}

	// Parse against the server-wide subset (public | private-oauth) so a corrupt or
	// unsupported stored value (e.g. 'private-link', which is meaningless server-wide
	// and would lock out every non-admin member via checkAccess) degrades gracefully
	// to PRIVATE_OAUTH, matching the no-row and parse-failure branches above.
	const parsed = ServerWrappedShareModeSchema.safeParse(setting.value);
	return parsed.success ? parsed.data : ShareMode.PRIVATE_OAUTH;
}

export async function setServerWrappedShareMode(mode: ServerWrappedShareModeType): Promise<void> {
	const now = new Date();
	await db
		.insert(appSettings)
		.values({
			key: ShareSettingsKey.SERVER_WRAPPED_SHARE_MODE,
			value: mode,
			updatedAt: now
		})
		.onConflictDoUpdate({
			target: appSettings.key,
			set: { value: mode, updatedAt: now }
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

	const [globalDefault, globalAllowUserControl] = await Promise.all([
		getGlobalDefaultShareMode(),
		getGlobalAllowUserControl()
	]);
	const settings = toShareSettings(record, globalDefault, globalAllowUserControl);

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

export async function getShareSettingsReadOnly(
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

	const [globalDefault, globalAllowUserControl] = await Promise.all([
		getGlobalDefaultShareMode(),
		getGlobalAllowUserControl()
	]);
	return toShareSettings(record, globalDefault, globalAllowUserControl);
}

function toShareSettings(
	record: ShareSettingsRecord,
	globalDefault: ShareModeType,
	globalAllowUserControl: boolean
): ShareSettings {
	const parsedMode = ShareModeSchema.safeParse(record.mode);
	const storedMode = parsedMode.success ? parsedMode.data : globalDefault;
	const modeSource = normalizeShareModeSource(record.modeSource);
	const mode = modeSource === ShareModeSource.DEFAULT ? globalDefault : storedMode;

	// Defense-in-depth: never expose a stored token unless the effective mode is
	// PRIVATE_LINK. This guards against capture-and-replay if a row still holds
	// a token after the effective mode was widened (e.g. global default changed).
	const shareToken = mode === ShareMode.PRIVATE_LINK ? record.shareToken : null;

	// ISSUE-003: effective per-user control is the AND of the per-row flag and the
	// LIVE global "allow user control" setting — mirroring how `mode` already folds
	// in `globalDefault` above. The per-row `canUserControl` is only seeded at
	// row-creation, so reading it raw lets a user who predates an admin toggling
	// global control OFF keep editing indefinitely (policy bypass). Folding the
	// global flag in here — the single centralization point already on every read
	// path — closes the bypass without a stale read in any caller.
	const canUserControl = (record.canUserControl ?? false) && globalAllowUserControl;

	return {
		userId: record.userId,
		year: record.year,
		mode,
		storedMode,
		modeSource,
		shareToken,
		canUserControl
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

	return toShareSettings(record, defaultMode, allowUserControl);
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

		if (updates.canUserControl !== undefined) {
			throw new PermissionExceededError('Only admins can change user control permissions.');
		}
	}

	// The privacy floor is a server-wide minimum and applies to every caller —
	// admins included. Admins who legitimately need to drop below the floor must
	// raise the global floor first; this prevents silent per-row deviations.
	if (updates.mode !== undefined) {
		const globalFloor = await getGlobalDefaultShareMode();
		if (!meetsPrivacyFloor(updates.mode, globalFloor)) {
			throw new PermissionExceededError(
				`Cannot set share mode to "${updates.mode}". Server requires at least "${globalFloor}" privacy level.`
			);
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

	// Defense-in-depth: if the server-wide floor is more restrictive than
	// private-link (e.g. private-oauth), refuse to mint a new token even though
	// the row claims private-link. The row should never be in that state given
	// the floor check in updateShareSettings, but legacy rows or future code
	// paths could leave it; we never want to issue a usable share URL below the
	// current floor.
	const globalFloor = await getGlobalDefaultShareMode();
	if (!meetsPrivacyFloor(settings.mode, globalFloor)) {
		throw new PermissionExceededError(
			`Cannot regenerate token. Server requires at least "${globalFloor}" privacy level.`
		);
	}

	const newToken = generateShareToken();

	await db
		.update(shareSettings)
		.set({ shareToken: newToken })
		.where(and(eq(shareSettings.userId, userId), eq(shareSettings.year, year)));

	return newToken;
}

export async function ensureShareToken(userId: number, year: number): Promise<string> {
	// Read the raw DB row directly (bypassing toShareSettings sanitization) so
	// that we see any existing token even when the stored mode is not private-link
	// but the global floor has raised the effective mode to private-link. Using the
	// sanitized ShareSettings path would always return shareToken=null in that case,
	// causing a new token to be minted on every page load and breaking shared URLs.
	const raw = await db
		.select({ shareToken: shareSettings.shareToken })
		.from(shareSettings)
		.where(and(eq(shareSettings.userId, userId), eq(shareSettings.year, year)))
		.limit(1);

	const row = raw[0];
	if (!row) {
		throw new ShareSettingsNotFoundError();
	}

	if (row.shareToken) {
		return row.shareToken;
	}

	const newToken = generateShareToken();

	await db
		.update(shareSettings)
		.set({ shareToken: newToken })
		.where(
			and(
				eq(shareSettings.userId, userId),
				eq(shareSettings.year, year),
				isNull(shareSettings.shareToken)
			)
		);

	// Re-read to get the winner in case of a concurrent mint (same pattern as
	// getShareSettings uses for its own lazy-mint path).
	const refreshed = await db
		.select({ shareToken: shareSettings.shareToken })
		.from(shareSettings)
		.where(and(eq(shareSettings.userId, userId), eq(shareSettings.year, year)))
		.limit(1);

	return refreshed[0]?.shareToken ?? newToken;
}

export async function getOwnerWrappedHref(userId: number, year: number): Promise<string> {
	const settings = await getOrCreateShareSettings({ userId, year });
	const globalFloor = await getGlobalDefaultShareMode();
	const effectiveMode = getMoreRestrictiveMode(settings.mode, globalFloor);

	if (effectiveMode !== ShareMode.PRIVATE_LINK) {
		return `/wrapped/${year}/u/${userId}`;
	}

	const token = settings.shareToken ?? (await ensureShareToken(userId, year));
	return `/wrapped/${year}/u/${token}`;
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

	const [globalDefault, globalAllowUserControl] = await Promise.all([
		getGlobalDefaultShareMode(),
		getGlobalAllowUserControl()
	]);
	return toShareSettings(record, globalDefault, globalAllowUserControl);
}

export async function deleteShareSettings(userId: number, year: number): Promise<void> {
	await db
		.delete(shareSettings)
		.where(and(eq(shareSettings.userId, userId), eq(shareSettings.year, year)));
}

export async function getAllUserShareSettings(userId: number): Promise<ShareSettings[]> {
	const results = await db.select().from(shareSettings).where(eq(shareSettings.userId, userId));
	const [globalDefault, globalAllowUserControl] = await Promise.all([
		getGlobalDefaultShareMode(),
		getGlobalAllowUserControl()
	]);

	return results.map((record) => toShareSettings(record, globalDefault, globalAllowUserControl));
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
