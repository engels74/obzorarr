import { db } from '$lib/server/db/client';
import { shareSettings, appSettings } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import {
	ShareMode,
	ShareSettingsKey,
	ShareError,
	ShareSettingsNotFoundError,
	PermissionExceededError,
	ShareModeSchema,
	meetsPrivacyFloor,
	type ShareModeType,
	type ShareSettings,
	type UpdateShareSettings,
	type GlobalShareDefaults,
	type GetOrCreateShareSettingsOptions
} from './types';

/**
 * Sharing Service
 *
 * Core service for managing share settings and tokens.
 *
 * Implements Requirements:
 * - 7.1: Public mode - accessible to anyone
 * - 7.2: Private OAuth mode - only authenticated server members
 * - 7.3: Private Link mode - unique share token required
 * - 7.4: Global default share mode
 * - 7.5: Admin grants user control permission
 * - 7.6: User settings cannot exceed admin permissions
 *
 * @module sharing/service
 */

// =============================================================================
// Token Generation
// =============================================================================

/**
 * Generate a unique share token
 *
 * Uses crypto.randomUUID() for cryptographically secure,
 * globally unique tokens.
 *
 * Implements Property 16: Share Token Uniqueness
 *
 * @returns A unique share token string
 */
export function generateShareToken(): string {
	return crypto.randomUUID();
}

/**
 * Validate token format (UUID v4)
 *
 * @param token - The token to validate
 * @returns True if the token is a valid UUID v4 format
 */
export function isValidTokenFormat(token: string): boolean {
	const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
	return uuidV4Regex.test(token);
}

// =============================================================================
// Global Defaults
// =============================================================================

/**
 * Get the global default share mode
 *
 * Implements Requirement 7.4
 *
 * @returns The global default share mode, defaults to 'public'
 */
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

/**
 * Get whether users are allowed to control their own share settings
 *
 * Implements Requirement 7.5
 *
 * @returns Whether user control is globally enabled
 */
export async function getGlobalAllowUserControl(): Promise<boolean> {
	const result = await db
		.select()
		.from(appSettings)
		.where(eq(appSettings.key, ShareSettingsKey.ALLOW_USER_CONTROL))
		.limit(1);

	const setting = result[0];
	if (!setting) {
		return false; // Default to admin-only control
	}

	return setting.value === 'true';
}

/**
 * Set global share defaults (admin only)
 *
 * Implements Requirements 7.4, 7.5
 *
 * @param defaults - The global defaults to set
 */
export async function setGlobalShareDefaults(defaults: GlobalShareDefaults): Promise<void> {
	// Upsert default share mode
	await db
		.insert(appSettings)
		.values({
			key: ShareSettingsKey.DEFAULT_SHARE_MODE,
			value: defaults.defaultShareMode
		})
		.onConflictDoUpdate({
			target: appSettings.key,
			set: { value: defaults.defaultShareMode }
		});

	// Upsert allow user control
	await db
		.insert(appSettings)
		.values({
			key: ShareSettingsKey.ALLOW_USER_CONTROL,
			value: String(defaults.allowUserControl)
		})
		.onConflictDoUpdate({
			target: appSettings.key,
			set: { value: String(defaults.allowUserControl) }
		});
}

// =============================================================================
// Server-Wide Wrapped Share Mode
// =============================================================================

/**
 * Get the server-wide wrapped share mode
 *
 * This is SEPARATE from the per-user global default.
 * Controls access to /wrapped/[year] (server-wide) pages.
 *
 * @returns The server wrapped share mode, defaults to 'public'
 */
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

/**
 * Set the server-wide wrapped share mode (admin only)
 *
 * @param mode - The share mode for server-wide wrapped pages
 */
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

// =============================================================================
// Share Settings CRUD
// =============================================================================

/**
 * Get share settings for a user and year
 *
 * @param userId - The user's database ID
 * @param year - The wrapped year
 * @returns Share settings or null if not found
 */
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

	return {
		userId: record.userId,
		year: record.year,
		mode: record.mode as ShareModeType,
		shareToken: record.shareToken,
		canUserControl: record.canUserControl ?? false
	};
}

/**
 * Get or create share settings with global defaults
 *
 * If no settings exist, creates them with global defaults.
 *
 * @param options - Options including userId, year, and createIfMissing
 * @returns Share settings (created with defaults if missing)
 */
export async function getOrCreateShareSettings(
	options: GetOrCreateShareSettingsOptions
): Promise<ShareSettings> {
	const { userId, year, createIfMissing = true } = options;

	// Always get current global setting for canUserControl
	// This ensures admin toggle has immediate effect for all users
	const allowUserControl = await getGlobalAllowUserControl();

	// Try to get existing settings
	const existing = await getShareSettings(userId, year);
	if (existing) {
		// Merge with current global setting (fixes stale canUserControl issue)
		return {
			...existing,
			canUserControl: allowUserControl
		};
	}

	if (!createIfMissing) {
		throw new ShareSettingsNotFoundError();
	}

	// Create with global defaults
	const defaultMode = await getGlobalDefaultShareMode();

	// Generate token if mode is private-link
	const shareToken = defaultMode === ShareMode.PRIVATE_LINK ? generateShareToken() : null;

	const result = await db
		.insert(shareSettings)
		.values({
			userId,
			year,
			mode: defaultMode,
			shareToken,
			canUserControl: allowUserControl
		})
		.returning();

	const record = result[0];
	if (!record) {
		throw new ShareError('Failed to create share settings', 'CREATE_FAILED');
	}

	return {
		userId: record.userId,
		year: record.year,
		mode: record.mode as ShareModeType,
		shareToken: record.shareToken,
		canUserControl: record.canUserControl ?? false
	};
}

/**
 * Update share settings for a user
 *
 * Implements Requirement 7.6: User settings cannot exceed admin permissions.
 *
 * @param userId - The user's database ID
 * @param year - The wrapped year
 * @param updates - The fields to update
 * @param isAdmin - Whether the requester is an admin
 * @returns Updated share settings
 */
export async function updateShareSettings(
	userId: number,
	year: number,
	updates: UpdateShareSettings,
	isAdmin: boolean
): Promise<ShareSettings> {
	// Get existing settings or create defaults
	const existing = await getOrCreateShareSettings({ userId, year });

	// Check permission for non-admins
	if (!isAdmin) {
		// Check if user is allowed to control their settings
		if (!existing.canUserControl) {
			throw new PermissionExceededError('You do not have permission to change share settings.');
		}

		// Floor enforcement: user cannot set mode less restrictive than global floor
		if (updates.mode !== undefined) {
			const globalFloor = await getGlobalDefaultShareMode();
			if (!meetsPrivacyFloor(updates.mode, globalFloor)) {
				throw new PermissionExceededError(
					`Cannot set share mode to "${updates.mode}". Server requires at least "${globalFloor}" privacy level.`
				);
			}
		}

		// Users cannot change canUserControl
		if (updates.canUserControl !== undefined) {
			throw new PermissionExceededError('Only admins can change user control permissions.');
		}
	}

	// Prepare update values
	const updateValues: Record<string, unknown> = {};

	if (updates.mode !== undefined) {
		updateValues.mode = updates.mode;

		// Generate new token when switching to private-link mode
		if (updates.mode === ShareMode.PRIVATE_LINK && !existing.shareToken) {
			updateValues.shareToken = generateShareToken();
		}

		// Clear token when switching away from private-link mode
		if (updates.mode !== ShareMode.PRIVATE_LINK) {
			updateValues.shareToken = null;
		}
	}

	if (updates.canUserControl !== undefined && isAdmin) {
		updateValues.canUserControl = updates.canUserControl;
	}

	// Only update if there are changes
	if (Object.keys(updateValues).length > 0) {
		await db
			.update(shareSettings)
			.set(updateValues)
			.where(and(eq(shareSettings.userId, userId), eq(shareSettings.year, year)));
	}

	// Return updated settings
	const updated = await getShareSettings(userId, year);
	if (!updated) {
		throw new ShareError('Failed to retrieve updated settings', 'UPDATE_FAILED');
	}

	return updated;
}

/**
 * Regenerate share token for a user
 *
 * Only valid when mode is private-link.
 *
 * @param userId - The user's database ID
 * @param year - The wrapped year
 * @returns The new share token
 */
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

/**
 * Find share settings by share token
 *
 * Used for validating private-link access.
 *
 * @param token - The share token from URL
 * @returns Share settings or null if token not found
 */
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

	return {
		userId: record.userId,
		year: record.year,
		mode: record.mode as ShareModeType,
		shareToken: record.shareToken,
		canUserControl: record.canUserControl ?? false
	};
}

/**
 * Delete share settings for a user and year
 *
 * @param userId - The user's database ID
 * @param year - The wrapped year
 */
export async function deleteShareSettings(userId: number, year: number): Promise<void> {
	await db
		.delete(shareSettings)
		.where(and(eq(shareSettings.userId, userId), eq(shareSettings.year, year)));
}

/**
 * Get all share settings for a user (all years)
 *
 * @param userId - The user's database ID
 * @returns Array of share settings
 */
export async function getAllUserShareSettings(userId: number): Promise<ShareSettings[]> {
	const results = await db.select().from(shareSettings).where(eq(shareSettings.userId, userId));

	return results.map((record) => ({
		userId: record.userId,
		year: record.year,
		mode: record.mode as ShareModeType,
		shareToken: record.shareToken,
		canUserControl: record.canUserControl ?? false
	}));
}
