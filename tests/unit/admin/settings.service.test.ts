import { describe, expect, it, beforeEach, mock } from 'bun:test';
import { db } from '$lib/server/db/client';
import { appSettings, cachedStats, users } from '$lib/server/db/schema';
import {
	AppSettingsKey,
	ThemePresets,
	AnonymizationMode,
	WrappedLogoMode,
	getAppSetting,
	setAppSetting,
	deleteAppSetting,
	getAllAppSettings,
	getCurrentTheme,
	setCurrentTheme,
	getAnonymizationMode,
	setAnonymizationMode,
	getDefaultYear,
	setDefaultYear,
	getWrappedLogoMode,
	setWrappedLogoMode,
	getCachedServerName,
	setCachedServerName,
	clearStatsCache,
	clearUserStatsCache,
	getApiConfigWithSources,
	hasPlexEnvConfig,
	hasOpenAIEnvConfig
} from '$lib/server/admin/settings.service';

/**
 * Unit tests for Admin Settings Service
 *
 * Tests app settings management and cache operations.
 * Uses in-memory SQLite from test setup.
 */

describe('Admin Settings Service', () => {
	// Clean up tables before each test
	beforeEach(async () => {
		await db.delete(appSettings);
		await db.delete(cachedStats);
	});

	// =========================================================================
	// App Settings CRUD
	// =========================================================================

	describe('App Settings CRUD', () => {
		describe('getAppSetting', () => {
			it('returns null when setting does not exist', async () => {
				const value = await getAppSetting(AppSettingsKey.CURRENT_THEME);
				expect(value).toBeNull();
			});

			it('returns value when setting exists', async () => {
				await db.insert(appSettings).values({
					key: AppSettingsKey.CURRENT_THEME,
					value: ThemePresets.MIDNIGHT_BLUE
				});

				const value = await getAppSetting(AppSettingsKey.CURRENT_THEME);
				expect(value).toBe(ThemePresets.MIDNIGHT_BLUE);
			});
		});

		describe('setAppSetting', () => {
			it('inserts new setting', async () => {
				await setAppSetting(AppSettingsKey.CURRENT_THEME, ThemePresets.FOREST_GREEN);

				const value = await getAppSetting(AppSettingsKey.CURRENT_THEME);
				expect(value).toBe(ThemePresets.FOREST_GREEN);
			});

			it('updates existing setting', async () => {
				await setAppSetting(AppSettingsKey.CURRENT_THEME, ThemePresets.SOVIET_RED);
				await setAppSetting(AppSettingsKey.CURRENT_THEME, ThemePresets.ROYAL_PURPLE);

				const value = await getAppSetting(AppSettingsKey.CURRENT_THEME);
				expect(value).toBe(ThemePresets.ROYAL_PURPLE);
			});
		});

		describe('deleteAppSetting', () => {
			it('deletes existing setting', async () => {
				await setAppSetting(AppSettingsKey.CURRENT_THEME, ThemePresets.SOVIET_RED);
				await deleteAppSetting(AppSettingsKey.CURRENT_THEME);

				const value = await getAppSetting(AppSettingsKey.CURRENT_THEME);
				expect(value).toBeNull();
			});

			it('does nothing for non-existent setting', async () => {
				// Should not throw
				await deleteAppSetting(AppSettingsKey.CURRENT_THEME);
			});
		});

		describe('getAllAppSettings', () => {
			it('returns empty object when no settings exist', async () => {
				const settings = await getAllAppSettings();
				expect(settings).toEqual({});
			});

			it('returns all settings as key-value object', async () => {
				await setAppSetting(AppSettingsKey.CURRENT_THEME, ThemePresets.SOVIET_RED);
				await setAppSetting(AppSettingsKey.DEFAULT_YEAR, '2024');

				const settings = await getAllAppSettings();
				expect(settings[AppSettingsKey.CURRENT_THEME]).toBe(ThemePresets.SOVIET_RED);
				expect(settings[AppSettingsKey.DEFAULT_YEAR]).toBe('2024');
			});
		});
	});

	// =========================================================================
	// Specific Settings Helpers
	// =========================================================================

	describe('Theme Settings', () => {
		describe('getCurrentTheme', () => {
			it('returns default theme when no setting exists', async () => {
				const theme = await getCurrentTheme();
				expect(theme).toBe(ThemePresets.SOVIET_RED);
			});

			it('returns stored theme when valid', async () => {
				await setAppSetting(AppSettingsKey.CURRENT_THEME, ThemePresets.MIDNIGHT_BLUE);

				const theme = await getCurrentTheme();
				expect(theme).toBe(ThemePresets.MIDNIGHT_BLUE);
			});

			it('returns default for invalid stored value', async () => {
				await setAppSetting(AppSettingsKey.CURRENT_THEME, 'invalid-theme');

				const theme = await getCurrentTheme();
				expect(theme).toBe(ThemePresets.SOVIET_RED);
			});
		});

		describe('setCurrentTheme', () => {
			it('sets theme correctly', async () => {
				await setCurrentTheme(ThemePresets.FOREST_GREEN);

				const theme = await getCurrentTheme();
				expect(theme).toBe(ThemePresets.FOREST_GREEN);
			});
		});
	});

	describe('Anonymization Settings', () => {
		describe('getAnonymizationMode', () => {
			it('returns default mode when no setting exists', async () => {
				const mode = await getAnonymizationMode();
				expect(mode).toBe(AnonymizationMode.REAL);
			});

			it('returns stored mode when valid', async () => {
				await setAppSetting(AppSettingsKey.ANONYMIZATION_MODE, AnonymizationMode.ANONYMOUS);

				const mode = await getAnonymizationMode();
				expect(mode).toBe(AnonymizationMode.ANONYMOUS);
			});

			it('returns default for invalid stored value', async () => {
				await setAppSetting(AppSettingsKey.ANONYMIZATION_MODE, 'invalid-mode');

				const mode = await getAnonymizationMode();
				expect(mode).toBe(AnonymizationMode.REAL);
			});
		});

		describe('setAnonymizationMode', () => {
			it('sets mode correctly', async () => {
				await setAnonymizationMode(AnonymizationMode.HYBRID);

				const mode = await getAnonymizationMode();
				expect(mode).toBe(AnonymizationMode.HYBRID);
			});
		});
	});

	describe('Year Settings', () => {
		describe('getDefaultYear', () => {
			it('returns current year when no setting exists', async () => {
				const year = await getDefaultYear();
				expect(year).toBe(new Date().getFullYear());
			});

			it('returns stored year when valid', async () => {
				await setAppSetting(AppSettingsKey.DEFAULT_YEAR, '2023');

				const year = await getDefaultYear();
				expect(year).toBe(2023);
			});

			it('returns current year for invalid stored value', async () => {
				await setAppSetting(AppSettingsKey.DEFAULT_YEAR, 'not-a-year');

				const year = await getDefaultYear();
				expect(year).toBe(new Date().getFullYear());
			});
		});

		describe('setDefaultYear', () => {
			it('sets year correctly', async () => {
				await setDefaultYear(2022);

				const year = await getDefaultYear();
				expect(year).toBe(2022);
			});
		});
	});

	describe('Logo Mode Settings', () => {
		describe('getWrappedLogoMode', () => {
			it('returns default mode when no setting exists', async () => {
				const mode = await getWrappedLogoMode();
				expect(mode).toBe(WrappedLogoMode.ALWAYS_SHOW);
			});

			it('returns stored mode when valid', async () => {
				await setAppSetting(AppSettingsKey.WRAPPED_LOGO_MODE, WrappedLogoMode.ALWAYS_HIDE);

				const mode = await getWrappedLogoMode();
				expect(mode).toBe(WrappedLogoMode.ALWAYS_HIDE);
			});

			it('returns default for invalid stored value', async () => {
				await setAppSetting(AppSettingsKey.WRAPPED_LOGO_MODE, 'invalid');

				const mode = await getWrappedLogoMode();
				expect(mode).toBe(WrappedLogoMode.ALWAYS_SHOW);
			});
		});

		describe('setWrappedLogoMode', () => {
			it('sets mode correctly', async () => {
				await setWrappedLogoMode(WrappedLogoMode.USER_CHOICE);

				const mode = await getWrappedLogoMode();
				expect(mode).toBe(WrappedLogoMode.USER_CHOICE);
			});
		});
	});

	describe('Server Name Cache', () => {
		describe('getCachedServerName', () => {
			it('returns null when no name cached', async () => {
				const name = await getCachedServerName();
				expect(name).toBeNull();
			});

			it('returns cached name when exists', async () => {
				await setAppSetting(AppSettingsKey.SERVER_NAME, 'My Plex Server');

				const name = await getCachedServerName();
				expect(name).toBe('My Plex Server');
			});
		});

		describe('setCachedServerName', () => {
			it('caches server name', async () => {
				await setCachedServerName('Test Server');

				const name = await getCachedServerName();
				expect(name).toBe('Test Server');
			});
		});
	});

	// =========================================================================
	// Cache Management
	// =========================================================================

	describe('Cache Management', () => {
		beforeEach(async () => {
			// Insert test cached stats
			await db.insert(cachedStats).values([
				{ userId: 1, year: 2023, statsType: 'user', statsJson: '{}' },
				{ userId: 1, year: 2024, statsType: 'user', statsJson: '{}' },
				{ userId: 2, year: 2024, statsType: 'user', statsJson: '{}' },
				{ userId: null, year: 2024, statsType: 'server', statsJson: '{}' }
			]);
		});

		describe('clearStatsCache', () => {
			it('clears all cache when no year specified', async () => {
				const deleted = await clearStatsCache();

				expect(deleted).toBe(4);
			});

			it('clears cache for specific year only', async () => {
				const deleted = await clearStatsCache(2024);

				expect(deleted).toBe(3);
			});

			it('returns 0 when no cache for year', async () => {
				const deleted = await clearStatsCache(2022);

				expect(deleted).toBe(0);
			});
		});

		describe('clearUserStatsCache', () => {
			it('clears all cache for user when no year specified', async () => {
				const deleted = await clearUserStatsCache(1);

				expect(deleted).toBe(2);
			});

			it('clears cache for user and specific year', async () => {
				const deleted = await clearUserStatsCache(1, 2024);

				expect(deleted).toBe(1);
			});

			it('returns 0 when no cache for user', async () => {
				const deleted = await clearUserStatsCache(999);

				expect(deleted).toBe(0);
			});
		});
	});

	// =========================================================================
	// API Configuration
	// =========================================================================

	describe('API Configuration', () => {
		describe('getApiConfigWithSources', () => {
			it('returns default values when nothing configured', async () => {
				const config = await getApiConfigWithSources();

				// Plex values should be empty (no DB, env from test setup is empty strings)
				expect(config.plex.serverUrl.value).toBe('');
				expect(config.plex.serverUrl.source).toBe('default');

				// OpenAI should have defaults
				expect(config.openai.baseUrl.value).toBe('https://api.openai.com/v1');
				expect(config.openai.baseUrl.source).toBe('default');
				expect(config.openai.model.value).toBe('gpt-4o-mini');
				expect(config.openai.model.source).toBe('default');
			});

			it('prioritizes DB values over defaults', async () => {
				await setAppSetting(AppSettingsKey.PLEX_SERVER_URL, 'http://db-plex:32400');
				await setAppSetting(AppSettingsKey.OPENAI_MODEL, 'gpt-4');

				const config = await getApiConfigWithSources();

				expect(config.plex.serverUrl.value).toBe('http://db-plex:32400');
				expect(config.plex.serverUrl.source).toBe('db');
				expect(config.openai.model.value).toBe('gpt-4');
				expect(config.openai.model.source).toBe('db');
			});
		});

		describe('hasPlexEnvConfig', () => {
			it('returns false when no Plex env vars set', () => {
				// Test setup mocks env vars as empty strings
				const hasConfig = hasPlexEnvConfig();
				expect(hasConfig).toBe(false);
			});
		});

		describe('hasOpenAIEnvConfig', () => {
			it('returns false when no OpenAI env vars set', () => {
				// Test setup mocks env vars as empty strings
				const hasConfig = hasOpenAIEnvConfig();
				expect(hasConfig).toBe(false);
			});
		});
	});
});
