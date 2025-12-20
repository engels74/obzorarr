import { db } from '$lib/server/db/client';
import { appSettings } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import {
	AnonymizationMode,
	AnonymizationSettingsKey,
	AnonymizationModeSchema,
	PerStatAnonymizationSettingsSchema,
	type AnonymizationModeType,
	type PerStatAnonymizationSettings,
	type AnonymizableUser
} from './types';

/**
 * Anonymization Service
 *
 * Core service for managing anonymization settings and applying
 * anonymization transformations to user data in statistics.
 *
 * Implements Requirements:
 * - 8.1: Real names mode - display actual Plex usernames
 * - 8.2: Anonymous mode - display generic identifiers like "User #1"
 * - 8.3: Hybrid mode - show viewing user their name, anonymize others
 * - 8.4: Per-stat anonymization configuration
 *
 * Property 18: Anonymization Mode Display
 * For any anonymization mode M and viewing user V:
 * - If M = 'real': all usernames SHALL be displayed as-is
 * - If M = 'anonymous': all usernames SHALL be replaced with generic identifiers
 * - If M = 'hybrid': only V's username SHALL be displayed, others anonymized
 *
 * @module anonymization/service
 */

// =============================================================================
// Pure Anonymization Functions
// =============================================================================

/**
 * Apply anonymization to an array of users based on mode
 *
 * This is a pure function that transforms user data based on the
 * anonymization mode. It is designed for property-based testing.
 *
 * Implements Property 18: Anonymization Mode Display
 *
 * @param users - Array of users to anonymize
 * @param mode - The anonymization mode to apply
 * @param viewingUserId - The ID of the viewing user (null if unauthenticated)
 * @returns Array of users with usernames potentially anonymized
 */
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
			// Requirement 8.1: Display actual usernames
			return users;

		case AnonymizationMode.ANONYMOUS:
			// Requirement 8.2: Replace with generic identifiers
			return users.map((user, index) => ({
				...user,
				username: generateAnonymousIdentifier(index)
			}));

		case AnonymizationMode.HYBRID:
			// Requirement 8.3: Show viewing user's name, anonymize others
			return users.map((user, index) => ({
				...user,
				username:
					user.userId === viewingUserId ? user.username : generateAnonymousIdentifier(index)
			}));
	}
}

/**
 * Generate an anonymous identifier for a user
 *
 * Creates "User #1", "User #2", etc. style identifiers.
 *
 * @param index - Zero-based index of the user
 * @returns Anonymous identifier string
 */
export function generateAnonymousIdentifier(index: number): string {
	return `User #${index + 1}`;
}

// =============================================================================
// Global Settings
// =============================================================================

/**
 * Get the global default anonymization mode
 *
 * @returns The global default anonymization mode, defaults to 'real'
 */
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

/**
 * Set the global default anonymization mode (admin only)
 *
 * @param mode - The anonymization mode to set as default
 */
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

// =============================================================================
// Per-Stat Settings (Requirement 8.4)
// =============================================================================

/**
 * Get per-stat anonymization overrides
 *
 * Implements Requirement 8.4: Per-stat anonymization configuration.
 *
 * @returns Per-stat anonymization settings
 */
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

/**
 * Set per-stat anonymization overrides (admin only)
 *
 * Implements Requirement 8.4: Per-stat anonymization configuration.
 *
 * @param settings - The per-stat settings to save
 */
export async function setPerStatAnonymization(settings: PerStatAnonymizationSettings): Promise<void> {
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

/**
 * Get the effective anonymization mode for a specific stat
 *
 * Checks per-stat overrides first, falls back to global default.
 *
 * @param statName - The name of the stat (e.g., 'topViewers')
 * @returns The effective anonymization mode for this stat
 */
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
