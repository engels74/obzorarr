import { fail } from '@sveltejs/kit';
import { z } from 'zod';
import type { PageServerLoad, Actions } from './$types';
import {
	setAppSetting,
	getUITheme,
	setUITheme,
	getWrappedTheme,
	setWrappedTheme,
	getAnonymizationMode,
	setAnonymizationMode,
	getWrappedLogoMode,
	setWrappedLogoMode,
	countStatsCache,
	clearStatsCache,
	countPlayHistory,
	clearPlayHistory,
	getApiConfigWithSources,
	setCachedServerName,
	AppSettingsKey,
	ThemePresets,
	AnonymizationMode,
	WrappedLogoMode,
	type ThemePresetType,
	type AnonymizationModeType,
	type WrappedLogoModeType,
	type ConfigSource
} from '$lib/server/admin/settings.service';
import { getAvailableYears } from '$lib/server/admin/users.service';
import {
	getLogRetentionDays,
	getLogMaxCount,
	isDebugEnabled,
	setLogRetentionDays,
	setLogMaxCount,
	setDebugEnabled,
	logger
} from '$lib/server/logging';
import {
	getGlobalDefaultShareMode,
	getGlobalAllowUserControl,
	setGlobalShareDefaults,
	getServerWrappedShareMode,
	setServerWrappedShareMode
} from '$lib/server/sharing/service';
import type { ShareModeType } from '$lib/server/sharing/types';

const ThemeSchema = z.enum([
	'modern-minimal',
	'supabase',
	'doom-64',
	'amber-minimal',
	'soviet-red'
]);
const AnonymizationSchema = z.enum(['real', 'anonymous', 'hybrid']);
const WrappedLogoModeSchema = z.enum(['always_show', 'always_hide', 'user_choice']);

const ShareModeSchema = z.enum(['public', 'private-oauth', 'private-link']);
const GlobalDefaultsSchema = z.object({
	defaultShareMode: ShareModeSchema,
	allowUserControl: z.coerce.boolean()
});
// Server-wide wrapped only supports public and private-oauth (not private-link)
const ServerWrappedModeSchema = z.enum(['public', 'private-oauth']);

const PrivacySettingsSchema = z.object({
	anonymizationMode: AnonymizationSchema,
	logoMode: WrappedLogoModeSchema,
	serverWrappedShareMode: ServerWrappedModeSchema,
	defaultShareMode: ShareModeSchema,
	allowUserControl: z.coerce.boolean()
});

const ApiConfigSchema = z.object({
	plexServerUrl: z.string().url('Invalid URL format').optional().or(z.literal('')),
	plexToken: z.string().optional(),
	openaiApiKey: z.string().optional(),
	openaiBaseUrl: z.string().url('Invalid URL format').optional().or(z.literal('')),
	openaiModel: z.string().optional()
});

const LogSettingsSchema = z.object({
	retentionDays: z.number().min(1).max(365),
	maxCount: z.number().min(1000).max(1000000),
	debugEnabled: z.boolean()
});

interface SettingValue {
	value: string;
	source: ConfigSource;
}

export const load: PageServerLoad = async () => {
	const [
		apiConfig,
		uiTheme,
		wrappedTheme,
		anonymizationMode,
		wrappedLogoMode,
		availableYears,
		logRetentionDays,
		logMaxCount,
		logDebugEnabled,
		defaultShareMode,
		allowUserControl,
		serverWrappedShareMode
	] = await Promise.all([
		getApiConfigWithSources(),
		getUITheme(),
		getWrappedTheme(),
		getAnonymizationMode(),
		getWrappedLogoMode(),
		getAvailableYears(),
		getLogRetentionDays(),
		getLogMaxCount(),
		isDebugEnabled(),
		getGlobalDefaultShareMode(),
		getGlobalAllowUserControl(),
		getServerWrappedShareMode()
	]);

	const currentYear = new Date().getFullYear();

	return {
		settings: {
			plexServerUrl: apiConfig.plex.serverUrl as SettingValue,
			plexToken: apiConfig.plex.token as SettingValue,
			openaiApiKey: apiConfig.openai.apiKey as SettingValue,
			openaiBaseUrl: apiConfig.openai.baseUrl as SettingValue,
			openaiModel: apiConfig.openai.model as SettingValue
		},
		uiTheme,
		wrappedTheme,
		anonymizationMode,
		wrappedLogoMode,
		themeOptions: Object.entries(ThemePresets).map(([key, value]) => ({
			value,
			label: key
				.replace(/_/g, ' ')
				.toLowerCase()
				.replace(/\b\w/g, (c) => c.toUpperCase())
		})),
		anonymizationOptions: Object.entries(AnonymizationMode).map(([key, value]) => ({
			value,
			label: key.charAt(0).toUpperCase() + key.slice(1).toLowerCase()
		})),
		wrappedLogoOptions: Object.entries(WrappedLogoMode).map(([key, value]) => ({
			value,
			label: key
				.replace(/_/g, ' ')
				.toLowerCase()
				.replace(/\b\w/g, (c) => c.toUpperCase())
		})),
		availableYears: availableYears.length > 0 ? availableYears : [currentYear],
		currentYear,
		logSettings: {
			retentionDays: logRetentionDays,
			maxCount: logMaxCount,
			debugEnabled: logDebugEnabled
		},
		globalDefaults: {
			defaultShareMode,
			allowUserControl
		},
		serverWrappedShareMode
	};
};

export const actions: Actions = {
	updateApiConfig: async ({ request }) => {
		const formData = await request.formData();

		const data = {
			plexServerUrl: formData.get('plexServerUrl')?.toString() ?? '',
			plexToken: formData.get('plexToken')?.toString() ?? '',
			openaiApiKey: formData.get('openaiApiKey')?.toString() ?? '',
			openaiBaseUrl: formData.get('openaiBaseUrl')?.toString() ?? '',
			openaiModel: formData.get('openaiModel')?.toString() ?? ''
		};

		const parsed = ApiConfigSchema.safeParse(data);
		if (!parsed.success) {
			return fail(400, {
				error: 'Invalid input',
				fieldErrors: parsed.error.flatten().fieldErrors
			});
		}

		try {
			// Save each setting (only if provided)
			if (parsed.data.plexServerUrl) {
				await setAppSetting(AppSettingsKey.PLEX_SERVER_URL, parsed.data.plexServerUrl);
			}
			if (parsed.data.plexToken) {
				await setAppSetting(AppSettingsKey.PLEX_TOKEN, parsed.data.plexToken);
			}
			if (parsed.data.openaiApiKey) {
				await setAppSetting(AppSettingsKey.OPENAI_API_KEY, parsed.data.openaiApiKey);
			}
			if (parsed.data.openaiBaseUrl) {
				await setAppSetting(AppSettingsKey.OPENAI_BASE_URL, parsed.data.openaiBaseUrl);
			}
			if (parsed.data.openaiModel) {
				await setAppSetting(AppSettingsKey.OPENAI_MODEL, parsed.data.openaiModel);
			}

			return { success: true, message: 'API configuration updated' };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to update settings';
			return fail(500, { error: message });
		}
	},

	testPlexConnection: async ({ request }) => {
		const formData = await request.formData();
		const plexServerUrl = formData.get('plexServerUrl')?.toString();
		const plexToken = formData.get('plexToken')?.toString();

		if (!plexServerUrl || !plexToken) {
			return fail(400, { error: 'Plex server URL and token are required' });
		}

		try {
			// Try to fetch server capabilities (includes friendlyName)
			const response = await fetch(`${plexServerUrl}/`, {
				headers: {
					Accept: 'application/json',
					'X-Plex-Token': plexToken
				}
			});

			if (!response.ok) {
				return fail(400, { error: `Connection failed: ${response.status} ${response.statusText}` });
			}

			const data = (await response.json()) as { MediaContainer?: { friendlyName?: string } };
			const serverName = data?.MediaContainer?.friendlyName ?? 'Unknown';

			// Cache the server name for use in wrapped presentations
			if (serverName !== 'Unknown') {
				await setCachedServerName(serverName);
			}

			return { success: true, message: `Connected to: ${serverName}` };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Connection failed';
			return fail(500, { error: message });
		}
	},

	updateUITheme: async ({ request }) => {
		const formData = await request.formData();
		const theme = formData.get('theme');

		const parsed = ThemeSchema.safeParse(theme);
		if (!parsed.success) {
			return fail(400, { error: 'Invalid theme selection' });
		}

		try {
			await setUITheme(parsed.data as ThemePresetType);
			return { success: true, message: 'UI theme updated' };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to update UI theme';
			return fail(500, { error: message });
		}
	},

	updateWrappedTheme: async ({ request }) => {
		const formData = await request.formData();
		const theme = formData.get('theme');

		const parsed = ThemeSchema.safeParse(theme);
		if (!parsed.success) {
			return fail(400, { error: 'Invalid theme selection' });
		}

		try {
			await setWrappedTheme(parsed.data as ThemePresetType);
			return { success: true, message: 'Wrapped theme updated' };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to update wrapped theme';
			return fail(500, { error: message });
		}
	},

	updateAnonymization: async ({ request }) => {
		const formData = await request.formData();
		const mode = formData.get('anonymizationMode');

		const parsed = AnonymizationSchema.safeParse(mode);
		if (!parsed.success) {
			return fail(400, { error: 'Invalid anonymization mode' });
		}

		try {
			await setAnonymizationMode(parsed.data as AnonymizationModeType);
			return { success: true, message: 'Anonymization mode updated' };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to update mode';
			return fail(500, { error: message });
		}
	},

	updateWrappedLogoMode: async ({ request }) => {
		const formData = await request.formData();
		const mode = formData.get('logoMode');

		const parsed = WrappedLogoModeSchema.safeParse(mode);
		if (!parsed.success) {
			return fail(400, { error: 'Invalid logo mode' });
		}

		try {
			await setWrappedLogoMode(parsed.data as WrappedLogoModeType);
			return { success: true, message: 'Logo visibility mode updated' };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to update mode';
			return fail(500, { error: message });
		}
	},

	getCacheCount: async ({ request }) => {
		const formData = await request.formData();
		const yearStr = formData.get('year')?.toString();

		let year: number | undefined;
		if (yearStr) {
			year = parseInt(yearStr, 10);
			if (isNaN(year)) {
				return fail(400, { error: 'Invalid year' });
			}
		}

		try {
			const count = await countStatsCache(year);
			return { success: true, count, year };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to get cache count';
			return fail(500, { error: message });
		}
	},

	clearCache: async ({ request }) => {
		const formData = await request.formData();
		const yearStr = formData.get('year')?.toString();

		let year: number | undefined;
		if (yearStr) {
			year = parseInt(yearStr, 10);
			if (isNaN(year)) {
				return fail(400, { error: 'Invalid year' });
			}
		}

		try {
			const deleted = await clearStatsCache(year);
			const message = year
				? `Cleared ${deleted} cache entries for ${year}`
				: `Cleared ${deleted} cache entries`;

			return { success: true, message };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to clear cache';
			return fail(500, { error: message });
		}
	},

	getPlayHistoryCount: async ({ request }) => {
		const formData = await request.formData();
		const yearStr = formData.get('year')?.toString();

		let year: number | undefined;
		if (yearStr) {
			year = parseInt(yearStr, 10);
			if (isNaN(year)) {
				return fail(400, { error: 'Invalid year' });
			}
		}

		try {
			const count = await countPlayHistory(year);
			return { success: true, count, year };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to get history count';
			return fail(500, { error: message });
		}
	},

	clearPlayHistory: async ({ request }) => {
		const formData = await request.formData();
		const yearStr = formData.get('year')?.toString();

		let year: number | undefined;
		if (yearStr) {
			year = parseInt(yearStr, 10);
			if (isNaN(year)) {
				return fail(400, { error: 'Invalid year' });
			}
		}

		try {
			const deleted = await clearPlayHistory(year);
			const message = year
				? `Deleted ${deleted} play history records for ${year}`
				: `Deleted ${deleted} play history records`;

			logger.info(message, 'Settings', { year, deleted });

			return { success: true, message };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to clear play history';
			logger.error(`Failed to clear play history: ${message}`, 'Settings', { year });
			return fail(500, { error: message });
		}
	},

	updateLogSettings: async ({ request }) => {
		const formData = await request.formData();

		const retentionDaysStr = formData.get('retentionDays')?.toString();
		const maxCountStr = formData.get('maxCount')?.toString();
		const debugEnabledStr = formData.get('debugEnabled')?.toString();

		const data = {
			retentionDays: retentionDaysStr ? parseInt(retentionDaysStr, 10) : 7,
			maxCount: maxCountStr ? parseInt(maxCountStr, 10) : 50000,
			debugEnabled: debugEnabledStr === 'true'
		};

		const parsed = LogSettingsSchema.safeParse(data);
		if (!parsed.success) {
			return fail(400, {
				error: 'Invalid input',
				fieldErrors: parsed.error.flatten().fieldErrors
			});
		}

		try {
			await Promise.all([
				setLogRetentionDays(parsed.data.retentionDays),
				setLogMaxCount(parsed.data.maxCount),
				setDebugEnabled(parsed.data.debugEnabled)
			]);

			logger.clearDebugCache();

			return { success: true, message: 'Logging settings updated' };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to update settings';
			return fail(500, { error: message });
		}
	},

	updateGlobalDefaults: async ({ request }) => {
		const formData = await request.formData();

		const data = {
			defaultShareMode: formData.get('defaultShareMode'),
			allowUserControl: formData.get('allowUserControl') === 'true'
		};

		const parsed = GlobalDefaultsSchema.safeParse(data);
		if (!parsed.success) {
			return fail(400, { error: 'Invalid input', fieldErrors: parsed.error.flatten().fieldErrors });
		}

		try {
			await setGlobalShareDefaults({
				defaultShareMode: parsed.data.defaultShareMode as ShareModeType,
				allowUserControl: parsed.data.allowUserControl
			});

			return { success: true, message: 'Sharing defaults updated' };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to update defaults';
			return fail(500, { error: message });
		}
	},

	updateServerWrappedMode: async ({ request }) => {
		const formData = await request.formData();
		const mode = formData.get('serverWrappedShareMode');

		const parsed = ServerWrappedModeSchema.safeParse(mode);
		if (!parsed.success) {
			return fail(400, {
				error: 'Invalid share mode. Server wrapped only supports public or private-oauth.'
			});
		}

		try {
			await setServerWrappedShareMode(parsed.data as ShareModeType);
			return { success: true, message: 'Server wrapped share mode updated' };
		} catch (error) {
			const message =
				error instanceof Error ? error.message : 'Failed to update server wrapped mode';
			return fail(500, { error: message });
		}
	},

	updatePrivacySettings: async ({ request }) => {
		const formData = await request.formData();

		const data = {
			anonymizationMode: formData.get('anonymizationMode'),
			logoMode: formData.get('logoMode'),
			serverWrappedShareMode: formData.get('serverWrappedShareMode'),
			defaultShareMode: formData.get('defaultShareMode'),
			allowUserControl: formData.get('allowUserControl') === 'true'
		};

		const parsed = PrivacySettingsSchema.safeParse(data);
		if (!parsed.success) {
			return fail(400, {
				error: 'Invalid input',
				fieldErrors: parsed.error.flatten().fieldErrors
			});
		}

		try {
			await Promise.all([
				setAnonymizationMode(parsed.data.anonymizationMode as AnonymizationModeType),
				setWrappedLogoMode(parsed.data.logoMode as WrappedLogoModeType),
				setServerWrappedShareMode(parsed.data.serverWrappedShareMode as ShareModeType),
				setGlobalShareDefaults({
					defaultShareMode: parsed.data.defaultShareMode as ShareModeType,
					allowUserControl: parsed.data.allowUserControl
				})
			]);

			return { success: true, message: 'Privacy settings updated' };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to update privacy settings';
			return fail(500, { error: message });
		}
	}
};
