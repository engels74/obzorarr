import { db } from '$lib/server/db/client';
import { appSettings, cachedStats, playHistory } from '$lib/server/db/schema';
import { eq, and, sql, between } from 'drizzle-orm';
import { createYearFilter } from '$lib/server/stats/utils';
import { env } from '$env/dynamic/private';

export const AppSettingsKey = {
	PLEX_SERVER_URL: 'plex_server_url',
	PLEX_TOKEN: 'plex_token',
	OPENAI_API_KEY: 'openai_api_key',
	OPENAI_BASE_URL: 'openai_base_url',
	OPENAI_MODEL: 'openai_model',
	UI_THEME: 'ui_theme',
	WRAPPED_THEME: 'wrapped_theme',
	/** @deprecated Use WRAPPED_THEME instead - kept for backward compatibility */
	CURRENT_THEME: 'current_theme',
	DEFAULT_YEAR: 'default_year',
	ENABLED_YEARS: 'enabled_years',
	ANONYMIZATION_MODE: 'anonymization_mode',
	SYNC_CRON_EXPRESSION: 'sync_cron_expression',
	WRAPPED_LOGO_MODE: 'wrapped_logo_mode',
	SERVER_NAME: 'server_name',
	FUN_FACT_FREQUENCY: 'fun_fact_frequency',
	FUN_FACT_CUSTOM_COUNT: 'fun_fact_custom_count',
	FUN_FACTS_AI_PERSONA: 'fun_facts_ai_persona',
	ENABLE_LIVE_SYNC: 'enable_live_sync',
	ONBOARDING_COMPLETED: 'onboarding_completed',
	ONBOARDING_CURRENT_STEP: 'onboarding_current_step',
	CSRF_ORIGIN: 'csrf_origin'
} as const;

export type AppSettingsKeyType = (typeof AppSettingsKey)[keyof typeof AppSettingsKey];

export const ThemePresets = {
	MODERN_MINIMAL: 'modern-minimal',
	SUPABASE: 'supabase',
	DOOM_64: 'doom-64',
	AMBER_MINIMAL: 'amber-minimal',
	SOVIET_RED: 'soviet-red'
} as const;

export type ThemePresetType = (typeof ThemePresets)[keyof typeof ThemePresets];

export const AnonymizationMode = {
	REAL: 'real',
	ANONYMOUS: 'anonymous',
	HYBRID: 'hybrid'
} as const;

export type AnonymizationModeType = (typeof AnonymizationMode)[keyof typeof AnonymizationMode];

export const WrappedLogoMode = {
	ALWAYS_SHOW: 'always_show',
	ALWAYS_HIDE: 'always_hide',
	USER_CHOICE: 'user_choice'
} as const;

export type WrappedLogoModeType = (typeof WrappedLogoMode)[keyof typeof WrappedLogoMode];

export const FunFactFrequency = {
	FEW: 'few',
	NORMAL: 'normal',
	MANY: 'many',
	CUSTOM: 'custom'
} as const;

export type FunFactFrequencyType = (typeof FunFactFrequency)[keyof typeof FunFactFrequency];

export interface FunFactFrequencyConfig {
	mode: FunFactFrequencyType;
	count: number;
}

export async function getAppSetting(key: AppSettingsKeyType): Promise<string | null> {
	const result = await db.select().from(appSettings).where(eq(appSettings.key, key)).limit(1);

	return result[0]?.value ?? null;
}

export async function setAppSetting(key: AppSettingsKeyType, value: string): Promise<void> {
	await db.insert(appSettings).values({ key, value }).onConflictDoUpdate({
		target: appSettings.key,
		set: { value }
	});
}

export async function deleteAppSetting(key: AppSettingsKeyType): Promise<void> {
	await db.delete(appSettings).where(eq(appSettings.key, key));
}

export async function getAllAppSettings(): Promise<Record<string, string>> {
	const result = await db.select().from(appSettings);

	const settings: Record<string, string> = {};
	for (const row of result) {
		settings[row.key] = row.value;
	}

	return settings;
}

export async function getUITheme(): Promise<ThemePresetType> {
	const theme = await getAppSetting(AppSettingsKey.UI_THEME);
	if (theme && Object.values(ThemePresets).includes(theme as ThemePresetType)) {
		return theme as ThemePresetType;
	}
	return ThemePresets.MODERN_MINIMAL;
}

export async function setUITheme(theme: ThemePresetType): Promise<void> {
	await setAppSetting(AppSettingsKey.UI_THEME, theme);
}

export async function getWrappedTheme(): Promise<ThemePresetType> {
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

export async function setWrappedTheme(theme: ThemePresetType): Promise<void> {
	await setAppSetting(AppSettingsKey.WRAPPED_THEME, theme);
}

/** @deprecated Use getWrappedTheme() instead */
export async function getCurrentTheme(): Promise<ThemePresetType> {
	return getWrappedTheme();
}

/** @deprecated Use setWrappedTheme() instead */
export async function setCurrentTheme(theme: ThemePresetType): Promise<void> {
	await setWrappedTheme(theme);
}

export async function getAnonymizationMode(): Promise<AnonymizationModeType> {
	const mode = await getAppSetting(AppSettingsKey.ANONYMIZATION_MODE);
	if (mode && Object.values(AnonymizationMode).includes(mode as AnonymizationModeType)) {
		return mode as AnonymizationModeType;
	}
	return AnonymizationMode.REAL;
}

export async function setAnonymizationMode(mode: AnonymizationModeType): Promise<void> {
	await setAppSetting(AppSettingsKey.ANONYMIZATION_MODE, mode);
}

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

export async function setDefaultYear(year: number): Promise<void> {
	await setAppSetting(AppSettingsKey.DEFAULT_YEAR, year.toString());
}

export async function getWrappedLogoMode(): Promise<WrappedLogoModeType> {
	const mode = await getAppSetting(AppSettingsKey.WRAPPED_LOGO_MODE);
	if (mode && Object.values(WrappedLogoMode).includes(mode as WrappedLogoModeType)) {
		return mode as WrappedLogoModeType;
	}
	return WrappedLogoMode.ALWAYS_SHOW;
}

export async function setWrappedLogoMode(mode: WrappedLogoModeType): Promise<void> {
	await setAppSetting(AppSettingsKey.WRAPPED_LOGO_MODE, mode);
}

export async function getCachedServerName(): Promise<string | null> {
	return getAppSetting(AppSettingsKey.SERVER_NAME);
}

export async function setCachedServerName(name: string): Promise<void> {
	await setAppSetting(AppSettingsKey.SERVER_NAME, name);
}

export async function getFunFactFrequency(): Promise<FunFactFrequencyConfig> {
	const mode = await getAppSetting(AppSettingsKey.FUN_FACT_FREQUENCY);
	const customCountStr = await getAppSetting(AppSettingsKey.FUN_FACT_CUSTOM_COUNT);

	const validMode =
		mode && Object.values(FunFactFrequency).includes(mode as FunFactFrequencyType)
			? (mode as FunFactFrequencyType)
			: FunFactFrequency.NORMAL;

	let count: number;
	switch (validMode) {
		case FunFactFrequency.FEW:
			count = 2;
			break;
		case FunFactFrequency.NORMAL:
			count = 4;
			break;
		case FunFactFrequency.MANY:
			count = 8;
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

export async function setFunFactFrequency(
	mode: FunFactFrequencyType,
	customCount?: number
): Promise<void> {
	await setAppSetting(AppSettingsKey.FUN_FACT_FREQUENCY, mode);

	if (mode === FunFactFrequency.CUSTOM && customCount !== undefined) {
		const clampedCount = Math.max(1, Math.min(15, customCount));
		await setAppSetting(AppSettingsKey.FUN_FACT_CUSTOM_COUNT, clampedCount.toString());
	}
}

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

export async function clearStatsCache(year?: number): Promise<number> {
	if (year !== undefined) {
		const result = await db.delete(cachedStats).where(eq(cachedStats.year, year)).returning();
		return result.length;
	} else {
		const result = await db.delete(cachedStats).returning();
		return result.length;
	}
}

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

export async function clearPlayHistory(year?: number): Promise<number> {
	if (year !== undefined) {
		const { startTimestamp, endTimestamp } = createYearFilter(year);
		const result = await db
			.delete(playHistory)
			.where(between(playHistory.viewedAt, startTimestamp, endTimestamp))
			.returning();

		// Invalidate cached stats since they're now stale
		await clearStatsCache(year);

		return result.length;
	} else {
		const result = await db.delete(playHistory).returning();

		await clearStatsCache();

		return result.length;
	}
}

export type ConfigSource = 'env' | 'db' | 'default';

export interface ConfigValue<T> {
	value: T;
	source: ConfigSource;
}

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

function getPlexEnvConfig() {
	return {
		serverUrl: env.PLEX_SERVER_URL ?? '',
		token: env.PLEX_TOKEN ?? ''
	};
}

function getOpenAIEnvConfig() {
	return {
		apiKey: env.OPENAI_API_KEY ?? '',
		baseUrl: env.OPENAI_API_URL ?? '',
		model: env.OPENAI_MODEL ?? 'gpt-4o-mini'
	};
}

export async function getApiConfigWithSources(): Promise<ApiConfigWithSources> {
	const dbSettings = await getAllAppSettings();
	const plexEnv = getPlexEnvConfig();
	const openaiEnv = getOpenAIEnvConfig();

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

export function hasPlexEnvConfig(): boolean {
	return Boolean(env.PLEX_SERVER_URL || env.PLEX_TOKEN);
}

export function hasOpenAIEnvConfig(): boolean {
	return Boolean(env.OPENAI_API_KEY || env.OPENAI_API_URL || env.OPENAI_MODEL);
}

export interface PlexConfig {
	serverUrl: string;
	token: string;
}

/**
 * Get the merged Plex configuration (database takes priority over environment).
 * This should be used by all Plex-related services to ensure they use
 * settings configured during onboarding.
 */
export async function getPlexConfig(): Promise<PlexConfig> {
	const config = await getApiConfigWithSources();
	return {
		serverUrl: config.plex.serverUrl.value,
		token: config.plex.token.value
	};
}

/** Check if Plex is configured (either via database or environment variables). */
export async function isPlexConfigured(): Promise<boolean> {
	const config = await getPlexConfig();
	return Boolean(config.serverUrl && config.token);
}

export interface CsrfConfigWithSource {
	origin: ConfigValue<string>;
}

export async function getCsrfConfigWithSource(): Promise<CsrfConfigWithSource> {
	const dbSettings = await getAllAppSettings();
	const envOrigin = env.ORIGIN ?? '';

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
		origin: getConfigValue(AppSettingsKey.CSRF_ORIGIN, envOrigin)
	};
}

export async function getCsrfOrigin(): Promise<string | null> {
	const config = await getCsrfConfigWithSource();
	return config.origin.value || null;
}
