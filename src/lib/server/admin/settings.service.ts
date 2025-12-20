import { db } from '$lib/server/db/client';
import { appSettings, cachedStats } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { env } from '$env/dynamic/private';

/**
 * Admin Settings Service
 *
 * Provides app settings management for the admin panel.
 * Uses the appSettings key-value table for configuration storage.
 *
 * Implements Requirements:
 * - 11.4: Theme configuration
 * - 11.5: API configuration (Plex, OpenAI)
 * - 11.6: Year and archive settings
 */

// =============================================================================
// Constants
// =============================================================================

/**
 * App settings keys
 */
export const AppSettingsKey = {
	// API Configuration
	PLEX_SERVER_URL: 'plex_server_url',
	PLEX_TOKEN: 'plex_token',
	OPENAI_API_KEY: 'openai_api_key',
	OPENAI_BASE_URL: 'openai_base_url',
	OPENAI_MODEL: 'openai_model',

	// Theme
	CURRENT_THEME: 'current_theme',

	// Year/Archive
	DEFAULT_YEAR: 'default_year',
	ENABLED_YEARS: 'enabled_years',

	// Anonymization
	ANONYMIZATION_MODE: 'anonymization_mode',

	// Sync
	SYNC_CRON_EXPRESSION: 'sync_cron_expression'
} as const;

export type AppSettingsKeyType = (typeof AppSettingsKey)[keyof typeof AppSettingsKey];

/**
 * Available theme presets
 */
export const ThemePresets = {
	SOVIET_RED: 'soviet-red',
	MIDNIGHT_BLUE: 'midnight-blue',
	FOREST_GREEN: 'forest-green',
	ROYAL_PURPLE: 'royal-purple'
} as const;

export type ThemePresetType = (typeof ThemePresets)[keyof typeof ThemePresets];

/**
 * Anonymization modes
 */
export const AnonymizationMode = {
	REAL: 'real',
	ANONYMOUS: 'anonymous',
	HYBRID: 'hybrid'
} as const;

export type AnonymizationModeType = (typeof AnonymizationMode)[keyof typeof AnonymizationMode];

// =============================================================================
// App Settings CRUD
// =============================================================================

/**
 * Get a single app setting by key
 *
 * @param key - The setting key
 * @returns The setting value or null if not found
 */
export async function getAppSetting(key: AppSettingsKeyType): Promise<string | null> {
	const result = await db.select().from(appSettings).where(eq(appSettings.key, key)).limit(1);

	return result[0]?.value ?? null;
}

/**
 * Set an app setting (upsert)
 *
 * @param key - The setting key
 * @param value - The setting value
 */
export async function setAppSetting(key: AppSettingsKeyType, value: string): Promise<void> {
	await db.insert(appSettings).values({ key, value }).onConflictDoUpdate({
		target: appSettings.key,
		set: { value }
	});
}

/**
 * Delete an app setting
 *
 * @param key - The setting key to delete
 */
export async function deleteAppSetting(key: AppSettingsKeyType): Promise<void> {
	await db.delete(appSettings).where(eq(appSettings.key, key));
}

/**
 * Get all app settings as a key-value object
 *
 * @returns Object with all settings
 */
export async function getAllAppSettings(): Promise<Record<string, string>> {
	const result = await db.select().from(appSettings);

	const settings: Record<string, string> = {};
	for (const row of result) {
		settings[row.key] = row.value;
	}

	return settings;
}

// =============================================================================
// Specific Settings Helpers
// =============================================================================

/**
 * Get the current theme preset
 *
 * @returns The current theme or default (soviet-red)
 */
export async function getCurrentTheme(): Promise<ThemePresetType> {
	const theme = await getAppSetting(AppSettingsKey.CURRENT_THEME);
	if (theme && Object.values(ThemePresets).includes(theme as ThemePresetType)) {
		return theme as ThemePresetType;
	}
	return ThemePresets.SOVIET_RED;
}

/**
 * Set the current theme preset
 *
 * @param theme - The theme preset to set
 */
export async function setCurrentTheme(theme: ThemePresetType): Promise<void> {
	await setAppSetting(AppSettingsKey.CURRENT_THEME, theme);
}

/**
 * Get the anonymization mode
 *
 * @returns The current anonymization mode or default (real)
 */
export async function getAnonymizationMode(): Promise<AnonymizationModeType> {
	const mode = await getAppSetting(AppSettingsKey.ANONYMIZATION_MODE);
	if (mode && Object.values(AnonymizationMode).includes(mode as AnonymizationModeType)) {
		return mode as AnonymizationModeType;
	}
	return AnonymizationMode.REAL;
}

/**
 * Set the anonymization mode
 *
 * @param mode - The anonymization mode to set
 */
export async function setAnonymizationMode(mode: AnonymizationModeType): Promise<void> {
	await setAppSetting(AppSettingsKey.ANONYMIZATION_MODE, mode);
}

/**
 * Get the default year for wrapped pages
 *
 * @returns The default year or current year
 */
export async function getDefaultYear(): Promise<number> {
	const year = await getAppSetting(AppSettingsKey.DEFAULT_YEAR);
	if (year) {
		const parsed = parseInt(year, 10);
		if (!isNaN(parsed)) {
			return parsed;
		}
	}
	return new Date().getFullYear();
}

/**
 * Set the default year for wrapped pages
 *
 * @param year - The year to set as default
 */
export async function setDefaultYear(year: number): Promise<void> {
	await setAppSetting(AppSettingsKey.DEFAULT_YEAR, year.toString());
}

// =============================================================================
// Cache Management
// =============================================================================

/**
 * Clear cached stats for a specific year (or all years)
 *
 * @param year - Optional year to clear cache for (null = all years)
 * @returns Number of cache entries deleted
 */
export async function clearStatsCache(year?: number): Promise<number> {
	if (year !== undefined) {
		const result = await db.delete(cachedStats).where(eq(cachedStats.year, year)).returning();
		return result.length;
	} else {
		const result = await db.delete(cachedStats).returning();
		return result.length;
	}
}

/**
 * Clear cached stats for a specific user
 *
 * @param userId - The user ID to clear cache for
 * @param year - Optional year filter
 * @returns Number of cache entries deleted
 */
export async function clearUserStatsCache(userId: number, year?: number): Promise<number> {
	if (year !== undefined) {
		const result = await db
			.delete(cachedStats)
			.where(and(eq(cachedStats.userId, userId), eq(cachedStats.year, year)))
			.returning();
		return result.length;
	} else {
		const result = await db.delete(cachedStats).where(eq(cachedStats.userId, userId)).returning();
		return result.length;
	}
}

// =============================================================================
// Environment Variable Configuration
// =============================================================================

/**
 * Source of a configuration value
 */
export type ConfigSource = 'env' | 'db' | 'default';

/**
 * Configuration value with its source
 */
export interface ConfigValue<T> {
	value: T;
	source: ConfigSource;
}

/**
 * API configuration with source information
 */
export interface ApiConfigWithSources {
	plex: {
		serverUrl: ConfigValue<string>;
		token: ConfigValue<string>;
	};
	openai: {
		apiKey: ConfigValue<string>;
		baseUrl: ConfigValue<string>;
		model: ConfigValue<string>;
	};
}

/**
 * Get environment variable values for Plex configuration
 */
function getPlexEnvConfig() {
	return {
		serverUrl: env.PLEX_SERVER_URL ?? '',
		token: env.PLEX_TOKEN ?? ''
	};
}

/**
 * Get environment variable values for OpenAI configuration
 */
function getOpenAIEnvConfig() {
	return {
		apiKey: env.OPENAI_API_KEY ?? '',
		baseUrl: env.OPENAI_API_URL ?? '',
		model: env.OPENAI_MODEL ?? 'gpt-4o-mini'
	};
}

/**
 * Get API configuration with source information
 *
 * Priority order:
 * 1. Database settings (user-configured via UI)
 * 2. Environment variables (from .env or Docker)
 * 3. Default values
 *
 * @returns API configuration with source information for each value
 */
export async function getApiConfigWithSources(): Promise<ApiConfigWithSources> {
	const dbSettings = await getAllAppSettings();
	const plexEnv = getPlexEnvConfig();
	const openaiEnv = getOpenAIEnvConfig();

	// Helper to determine value and source
	function getConfigValue(
		dbKey: string,
		envValue: string,
		defaultValue: string = ''
	): ConfigValue<string> {
		const dbValue = dbSettings[dbKey];
		if (dbValue) {
			return { value: dbValue, source: 'db' };
		}
		if (envValue) {
			return { value: envValue, source: 'env' };
		}
		return { value: defaultValue, source: 'default' };
	}

	return {
		plex: {
			serverUrl: getConfigValue(AppSettingsKey.PLEX_SERVER_URL, plexEnv.serverUrl),
			token: getConfigValue(AppSettingsKey.PLEX_TOKEN, plexEnv.token)
		},
		openai: {
			apiKey: getConfigValue(AppSettingsKey.OPENAI_API_KEY, openaiEnv.apiKey),
			baseUrl: getConfigValue(
				AppSettingsKey.OPENAI_BASE_URL,
				openaiEnv.baseUrl,
				'https://api.openai.com/v1'
			),
			model: getConfigValue(AppSettingsKey.OPENAI_MODEL, openaiEnv.model, 'gpt-4o-mini')
		}
	};
}

/**
 * Check if environment variables are configured for Plex
 */
export function hasPlexEnvConfig(): boolean {
	return Boolean(env.PLEX_SERVER_URL || env.PLEX_TOKEN);
}

/**
 * Check if environment variables are configured for OpenAI
 */
export function hasOpenAIEnvConfig(): boolean {
	return Boolean(env.OPENAI_API_KEY || env.OPENAI_API_URL || env.OPENAI_MODEL);
}
