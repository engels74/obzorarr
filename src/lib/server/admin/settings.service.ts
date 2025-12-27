import { db } from '$lib/server/db/client';
import { appSettings, cachedStats, playHistory } from '$lib/server/db/schema';
import { eq, and, sql, between } from 'drizzle-orm';
import { createYearFilter } from '$lib/server/stats/utils';
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
	UI_THEME: 'ui_theme',
	WRAPPED_THEME: 'wrapped_theme',
	/** @deprecated Use WRAPPED_THEME instead - kept for backward compatibility */
	CURRENT_THEME: 'current_theme',

	// Year/Archive
	DEFAULT_YEAR: 'default_year',
	ENABLED_YEARS: 'enabled_years',

	// Anonymization
	ANONYMIZATION_MODE: 'anonymization_mode',

	// Sync
	SYNC_CRON_EXPRESSION: 'sync_cron_expression',

	// Wrapped Page Logo
	WRAPPED_LOGO_MODE: 'wrapped_logo_mode',

	// Server Name (cached from Plex)
	SERVER_NAME: 'server_name',

	// Fun Fact Frequency
	FUN_FACT_FREQUENCY: 'fun_fact_frequency',
	FUN_FACT_CUSTOM_COUNT: 'fun_fact_custom_count',

	// Fun Facts AI Persona
	FUN_FACTS_AI_PERSONA: 'fun_facts_ai_persona',

	// Live Sync (automatic sync on page access)
	ENABLE_LIVE_SYNC: 'enable_live_sync',

	// Onboarding
	ONBOARDING_COMPLETED: 'onboarding_completed',
	ONBOARDING_CURRENT_STEP: 'onboarding_current_step'
} as const;

export type AppSettingsKeyType = (typeof AppSettingsKey)[keyof typeof AppSettingsKey];

/**
 * Available theme presets
 */
export const ThemePresets = {
	MODERN_MINIMAL: 'modern-minimal',
	SUPABASE: 'supabase',
	DOOM_64: 'doom-64',
	AMBER_MINIMAL: 'amber-minimal',
	SOVIET_RED: 'soviet-red'
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

/**
 * Wrapped page logo visibility modes
 */
export const WrappedLogoMode = {
	ALWAYS_SHOW: 'always_show',
	ALWAYS_HIDE: 'always_hide',
	USER_CHOICE: 'user_choice'
} as const;

export type WrappedLogoModeType = (typeof WrappedLogoMode)[keyof typeof WrappedLogoMode];

/**
 * Fun fact frequency modes
 */
export const FunFactFrequency = {
	FEW: 'few',
	NORMAL: 'normal',
	MANY: 'many',
	CUSTOM: 'custom'
} as const;

export type FunFactFrequencyType = (typeof FunFactFrequency)[keyof typeof FunFactFrequency];

/**
 * Fun fact frequency configuration
 */
export interface FunFactFrequencyConfig {
	mode: FunFactFrequencyType;
	count: number;
}

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
 * Get the UI theme preset (for dashboard, admin, and all non-wrapped pages)
 *
 * @returns The UI theme or default (modern-minimal)
 */
export async function getUITheme(): Promise<ThemePresetType> {
	const theme = await getAppSetting(AppSettingsKey.UI_THEME);
	if (theme && Object.values(ThemePresets).includes(theme as ThemePresetType)) {
		return theme as ThemePresetType;
	}
	return ThemePresets.MODERN_MINIMAL;
}

/**
 * Set the UI theme preset
 *
 * @param theme - The theme preset to set
 */
export async function setUITheme(theme: ThemePresetType): Promise<void> {
	await setAppSetting(AppSettingsKey.UI_THEME, theme);
}

/**
 * Get the wrapped theme preset (for /wrapped/* slideshow pages)
 *
 * Falls back to legacy CURRENT_THEME for backward compatibility.
 *
 * @returns The wrapped theme or default (modern-minimal)
 */
export async function getWrappedTheme(): Promise<ThemePresetType> {
	// First try the new WRAPPED_THEME key
	const theme = await getAppSetting(AppSettingsKey.WRAPPED_THEME);
	if (theme && Object.values(ThemePresets).includes(theme as ThemePresetType)) {
		return theme as ThemePresetType;
	}

	// Fall back to legacy CURRENT_THEME for backward compatibility
	const legacyTheme = await getAppSetting(AppSettingsKey.CURRENT_THEME);
	if (legacyTheme && Object.values(ThemePresets).includes(legacyTheme as ThemePresetType)) {
		return legacyTheme as ThemePresetType;
	}

	return ThemePresets.MODERN_MINIMAL;
}

/**
 * Set the wrapped theme preset
 *
 * @param theme - The theme preset to set
 */
export async function setWrappedTheme(theme: ThemePresetType): Promise<void> {
	await setAppSetting(AppSettingsKey.WRAPPED_THEME, theme);
}

/**
 * Get the current theme preset
 *
 * @deprecated Use getWrappedTheme() instead
 * @returns The current theme or default (soviet-red)
 */
export async function getCurrentTheme(): Promise<ThemePresetType> {
	return getWrappedTheme();
}

/**
 * Set the current theme preset
 *
 * @deprecated Use setWrappedTheme() instead
 * @param theme - The theme preset to set
 */
export async function setCurrentTheme(theme: ThemePresetType): Promise<void> {
	await setWrappedTheme(theme);
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

/**
 * Get the wrapped page logo visibility mode
 *
 * @returns The current logo mode or default (always_show)
 */
export async function getWrappedLogoMode(): Promise<WrappedLogoModeType> {
	const mode = await getAppSetting(AppSettingsKey.WRAPPED_LOGO_MODE);
	if (mode && Object.values(WrappedLogoMode).includes(mode as WrappedLogoModeType)) {
		return mode as WrappedLogoModeType;
	}
	return WrappedLogoMode.ALWAYS_SHOW;
}

/**
 * Set the wrapped page logo visibility mode
 *
 * @param mode - The logo visibility mode to set
 */
export async function setWrappedLogoMode(mode: WrappedLogoModeType): Promise<void> {
	await setAppSetting(AppSettingsKey.WRAPPED_LOGO_MODE, mode);
}

/**
 * Get the cached server name
 *
 * @returns The server name or null if not cached
 */
export async function getCachedServerName(): Promise<string | null> {
	return getAppSetting(AppSettingsKey.SERVER_NAME);
}

/**
 * Set the cached server name
 *
 * @param name - The server name to cache
 */
export async function setCachedServerName(name: string): Promise<void> {
	await setAppSetting(AppSettingsKey.SERVER_NAME, name);
}

/**
 * Get the fun fact frequency configuration
 *
 * Returns the mode and calculated count based on the mode.
 * For 'custom' mode, returns the stored custom count.
 *
 * @returns The frequency configuration with mode and count
 */
export async function getFunFactFrequency(): Promise<FunFactFrequencyConfig> {
	const mode = await getAppSetting(AppSettingsKey.FUN_FACT_FREQUENCY);
	const customCountStr = await getAppSetting(AppSettingsKey.FUN_FACT_CUSTOM_COUNT);

	// Validate mode or default to 'normal'
	const validMode =
		mode && Object.values(FunFactFrequency).includes(mode as FunFactFrequencyType)
			? (mode as FunFactFrequencyType)
			: FunFactFrequency.NORMAL;

	// Calculate count based on mode
	let count: number;
	switch (validMode) {
		case FunFactFrequency.FEW:
			count = 2; // 1-2, we use 2 as the target
			break;
		case FunFactFrequency.NORMAL:
			count = 4; // 3-5, we use 4 as the target
			break;
		case FunFactFrequency.MANY:
			count = 8; // 6-10, we use 8 as the target
			break;
		case FunFactFrequency.CUSTOM:
			count = customCountStr ? parseInt(customCountStr, 10) : 4;
			if (isNaN(count) || count < 1) count = 1;
			if (count > 15) count = 15;
			break;
		default:
			count = 4;
	}

	return { mode: validMode, count };
}

/**
 * Set the fun fact frequency
 *
 * @param mode - The frequency mode (few, normal, many, custom)
 * @param customCount - The custom count (only used when mode is 'custom')
 */
export async function setFunFactFrequency(
	mode: FunFactFrequencyType,
	customCount?: number
): Promise<void> {
	await setAppSetting(AppSettingsKey.FUN_FACT_FREQUENCY, mode);

	if (mode === FunFactFrequency.CUSTOM && customCount !== undefined) {
		// Clamp custom count to valid range
		const clampedCount = Math.max(1, Math.min(15, customCount));
		await setAppSetting(AppSettingsKey.FUN_FACT_CUSTOM_COUNT, clampedCount.toString());
	}
}

// =============================================================================
// Cache Management
// =============================================================================

/**
 * Count cached stats entries for a specific year (or all years)
 *
 * Used for confirmation dialogs before cache clearing.
 *
 * @param year - Optional year to count cache for (undefined = all years)
 * @returns Number of cache entries
 */
export async function countStatsCache(year?: number): Promise<number> {
	if (year !== undefined) {
		const result = await db
			.select({ count: sql<number>`count(*)` })
			.from(cachedStats)
			.where(eq(cachedStats.year, year));
		return result[0]?.count ?? 0;
	} else {
		const result = await db.select({ count: sql<number>`count(*)` }).from(cachedStats);
		return result[0]?.count ?? 0;
	}
}

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
// Play History Management
// =============================================================================

/**
 * Count play history records for a specific year (or all years)
 *
 * Used for confirmation dialogs before history clearing.
 *
 * @param year - Optional year to count history for (undefined = all years)
 * @returns Number of play history records
 */
export async function countPlayHistory(year?: number): Promise<number> {
	if (year !== undefined) {
		const { startTimestamp, endTimestamp } = createYearFilter(year);
		const result = await db
			.select({ count: sql<number>`count(*)` })
			.from(playHistory)
			.where(between(playHistory.viewedAt, startTimestamp, endTimestamp));
		return Number(result[0]?.count ?? 0);
	} else {
		const result = await db.select({ count: sql<number>`count(*)` }).from(playHistory);
		return Number(result[0]?.count ?? 0);
	}
}

/**
 * Clear play history records for a specific year (or all years)
 *
 * Also clears the cached stats for affected years since they become invalid.
 *
 * @param year - Optional year to clear history for (undefined = all years)
 * @returns Number of play history records deleted
 */
export async function clearPlayHistory(year?: number): Promise<number> {
	if (year !== undefined) {
		const { startTimestamp, endTimestamp } = createYearFilter(year);
		const result = await db
			.delete(playHistory)
			.where(between(playHistory.viewedAt, startTimestamp, endTimestamp))
			.returning();

		// Invalidate cached stats for this year since they're now stale
		await clearStatsCache(year);

		return result.length;
	} else {
		const result = await db.delete(playHistory).returning();

		// Invalidate all cached stats since they're now stale
		await clearStatsCache();

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
