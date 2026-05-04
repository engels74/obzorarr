import { fail } from '@sveltejs/kit';
import { z } from 'zod';
import { env } from '$env/dynamic/private';
import {
	AnonymizationMode,
	type AnonymizationModeType,
	API_CONFIG_KEYS,
	AppSettingsKey,
	type ConfigSource,
	clearCachedServerMachineId,
	clearPlayHistory,
	clearStatsCache,
	countPlayHistory,
	countStatsCache,
	deleteAppSetting,
	getAnonymizationMode,
	getApiConfigWithSources,
	getAppSetting,
	getAppSettingsUpdatedAt,
	getCsrfConfigWithSource,
	getTrustProxyConfigWithSource,
	getUITheme,
	getWrappedLogoMode,
	getWrappedTheme,
	isCsrfWarningDismissed,
	resetCsrfWarningDismissal,
	SERVER_WRAPPED_SETTINGS_KEYS,
	setAnonymizationMode,
	setApiConfigAtomic,
	setAppSetting,
	setCachedServerName,
	setServerWrappedSettingsAtomic,
	setUITheme,
	setUserDefaultsAtomic,
	setWrappedLogoMode,
	setWrappedTheme,
	ThemePresets,
	type ThemePresetType,
	toSafeConfigValue,
	USER_DEFAULTS_SETTINGS_KEYS,
	WrappedLogoMode,
	type WrappedLogoModeType
} from '$lib/server/admin/settings.service';
import { getAvailableYears } from '$lib/server/admin/users.service';
import { optionalTrimmed } from '$lib/server/admin/zod-helpers';
import { requireAdminActions } from '$lib/server/auth/guards';
import { testOpenAIConnection } from '$lib/server/funfacts/test-connection';
import {
	getLogMaxCount,
	getLogRetentionDays,
	isDebugEnabled,
	logger,
	setDebugEnabled,
	setLogMaxCount,
	setLogRetentionDays
} from '$lib/server/logging';
import { getOriginFromRequest } from '$lib/server/security/csrf-handle';
import {
	bulkApplyShareDefaults,
	getGlobalAllowUserControl,
	getGlobalDefaultShareMode,
	getServerWrappedShareMode,
	setGlobalShareDefaults,
	setServerWrappedShareMode
} from '$lib/server/sharing/service';
import type { ShareModeType } from '$lib/server/sharing/types';
import type { Actions, PageServerLoad } from './$types';

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
const BooleanStringSchema = z.enum(['true', 'false']).transform((value) => value === 'true');
const GlobalDefaultsSchema = z.object({
	defaultShareMode: ShareModeSchema,
	allowUserControl: BooleanStringSchema
});
// Server-wide wrapped only supports public and private-oauth (not private-link)
const ServerWrappedModeSchema = z.enum(['public', 'private-oauth']);

const ServerWrappedSettingsSchema = z.object({
	anonymizationMode: AnonymizationSchema,
	serverWrappedShareMode: ServerWrappedModeSchema,
	settingsVersion: z.string()
});

const UserDefaultsSettingsSchema = z.object({
	defaultShareMode: ShareModeSchema,
	allowUserControl: BooleanStringSchema,
	settingsVersion: z.string()
});

// Each value field is `string | undefined`:
//   undefined = field absent from this submission (e.g. the OpenAI panel saved
//               and didn't include Plex inputs) → service treats as no-op.
//   ''        = field present but blank → service either clears (echoed-back
//               keys) or no-ops (secret keys).
//   non-empty = write.
// The URL-validated fields accept `''` via the literal union so a cleared input
// passes validation and reaches the service as the clear signal.
//
// Whitespace handling:
//   - Secret keys (plexToken, openaiApiKey) use `optionalTrimmed(...)`: empty,
//     whitespace-only, and absent all collapse to `undefined` (no-op). Prevents
//     a stray "  " press from being persisted as the secret.
//   - Echoed-back keys (openaiModel, openaiBaseUrl) get `.trim()` on the inner
//     string so whitespace-only inputs become the canonical clear signal `''`,
//     preserving the user's ability to clear by blanking the field.
// Trim before the union so whitespace-only inputs (e.g. '   ') collapse to ''
// and match the literal-empty branch — without preprocess, .trim() on the URL
// branch would still leave the original untrimmed string for the literal('')
// check, causing whitespace-only submissions to fail validation instead of
// being treated as the documented "clear" signal.
const trimmedUrlOrEmpty = z
	.preprocess(
		(v) => (typeof v === 'string' ? v.trim() : v),
		z.union([z.string().max(512).url('Invalid URL format'), z.literal('')])
	)
	.optional();

const ApiConfigSchema = z.object({
	plexServerUrl: trimmedUrlOrEmpty,
	plexToken: optionalTrimmed(512),
	openaiApiKey: optionalTrimmed(512),
	openaiBaseUrl: trimmedUrlOrEmpty,
	openaiModel: z.string().trim().max(100).optional(),
	apiConfigVersion: z.string()
});

const LogSettingsSchema = z.object({
	retentionDays: z.coerce
		.number({ error: 'Retention days must be a number' })
		.int('Retention days must be a whole number')
		.min(1, 'Retention days must be at least 1')
		.max(365, 'Retention days cannot exceed 365'),
	maxCount: z.coerce
		.number({ error: 'Max log count must be a number' })
		.int('Max log count must be a whole number')
		.min(1000, 'Max log count must be at least 1000')
		.max(1000000, 'Max log count cannot exceed 1,000,000'),
	debugEnabled: z.boolean()
});

const CsrfOriginSchema = z.object({
	csrfOrigin: z
		.string()
		.url('Invalid URL format')
		.refine((url) => url.startsWith('http://') || url.startsWith('https://'), {
			message: 'Origin must start with http:// or https://'
		})
		.transform((url) => {
			try {
				const parsed = new URL(url);
				return parsed.origin;
			} catch {
				return url;
			}
		})
});

const TrustProxySchema = z.object({
	enabled: z.enum(['true', 'false']).transform((v) => v === 'true')
});

interface SettingValue {
	value: string;
	source: ConfigSource;
	isLocked: boolean;
}

type SafeSettingValue = Omit<SettingValue, 'value'> & { hasValue: boolean };

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
		serverWrappedShareMode,
		csrfConfig,
		csrfWarningDismissed,
		csrfOriginSkippedRaw,
		trustProxyConfig,
		serverWrappedSettingsUpdatedAt,
		userDefaultsSettingsUpdatedAt,
		apiConfigUpdatedAt
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
		getServerWrappedShareMode(),
		getCsrfConfigWithSource(),
		isCsrfWarningDismissed(),
		getAppSetting(AppSettingsKey.CSRF_ORIGIN_SKIPPED),
		getTrustProxyConfigWithSource(),
		getAppSettingsUpdatedAt(SERVER_WRAPPED_SETTINGS_KEYS),
		getAppSettingsUpdatedAt(USER_DEFAULTS_SETTINGS_KEYS),
		getAppSettingsUpdatedAt(API_CONFIG_KEYS)
	]);

	const currentYear = new Date().getFullYear();

	return {
		settings: {
			plexServerUrl: apiConfig.plex.serverUrl as SettingValue,
			plexToken: toSafeConfigValue(apiConfig.plex.token) satisfies SafeSettingValue,
			openaiApiKey: toSafeConfigValue(apiConfig.openai.apiKey) satisfies SafeSettingValue,
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
		availableYears,
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
		serverWrappedShareMode,
		serverWrappedSettingsVersion: serverWrappedSettingsUpdatedAt?.toISOString() ?? '',
		userDefaultsSettingsVersion: userDefaultsSettingsUpdatedAt?.toISOString() ?? '',
		apiConfigVersion: apiConfigUpdatedAt?.toISOString() ?? '',
		security: {
			originValue: csrfConfig.origin.value,
			csrfEnabled: !!csrfConfig.origin.value,
			originSource: csrfConfig.origin.source,
			originLocked: csrfConfig.origin.isLocked,
			warningDismissed: csrfWarningDismissed,
			// Flag is only effective when no origin is configured; mirror csrfHandle semantics
			csrfOriginSkipped: csrfOriginSkippedRaw === 'true' && !csrfConfig.origin.value,
			trustProxyValue: trustProxyConfig.trustProxy.value === 'true',
			trustProxySource: trustProxyConfig.trustProxy.source,
			trustProxyLocked: trustProxyConfig.trustProxy.isLocked
		}
	};
};

export const actions: Actions = requireAdminActions({
	updateApiConfig: async ({ request }) => {
		const formData = await request.formData();

		// Distinguish "field absent from this submission" from "field submitted blank":
		// the API config UI has two separate <form> elements (Plex panel, OpenAI panel)
		// both targeting `?/updateApiConfig`. Saving one panel does NOT include the
		// other panel's inputs; treating those absent fields as `''` would wipe the
		// other panel's stored values via the echoed-back-key clear path.
		const field = (name: string): string | undefined =>
			formData.has(name) ? (formData.get(name)?.toString() ?? '') : undefined;

		const data = {
			plexServerUrl: field('plexServerUrl'),
			plexToken: field('plexToken'),
			openaiApiKey: field('openaiApiKey'),
			openaiBaseUrl: field('openaiBaseUrl'),
			openaiModel: field('openaiModel'),
			apiConfigVersion: formData.get('apiConfigVersion')?.toString() ?? ''
		};

		const parsed = ApiConfigSchema.safeParse(data);
		if (!parsed.success) {
			return fail(400, {
				error: 'Invalid input',
				fieldErrors: parsed.error.flatten().fieldErrors
			});
		}

		try {
			const apiConfig = await getApiConfigWithSources();

			const result = await setApiConfigAtomic({
				values: {
					plexServerUrl: parsed.data.plexServerUrl,
					plexToken: parsed.data.plexToken,
					openaiApiKey: parsed.data.openaiApiKey,
					openaiBaseUrl: parsed.data.openaiBaseUrl,
					openaiModel: parsed.data.openaiModel
				},
				locks: {
					plexServerUrl: apiConfig.plex.serverUrl.isLocked,
					plexToken: apiConfig.plex.token.isLocked,
					openaiApiKey: apiConfig.openai.apiKey.isLocked,
					openaiBaseUrl: apiConfig.openai.baseUrl.isLocked,
					openaiModel: apiConfig.openai.model.isLocked
				},
				submittedVersion: parsed.data.apiConfigVersion
			});

			if (result.status === 'conflict') {
				return fail(409, {
					conflict: true,
					error: 'Settings changed in another tab. Reload and try again.'
				});
			}

			if (result.plexCredentialsChanged) {
				await clearCachedServerMachineId();
			}

			return { success: true, message: 'API configuration updated' };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to update settings';
			return fail(500, { error: message });
		}
	},

	testPlexConnection: async ({ request }) => {
		const formData = await request.formData();
		const submittedUrl = formData.get('plexServerUrl')?.toString() ?? '';
		const submittedToken = formData.get('plexToken')?.toString() ?? '';

		// The client never echoes the stored token back (to avoid hydration leaks),
		// so a missing token field is the normal case. We fall back to the stored
		// token ONLY when the submitted URL also matches the stored URL — this
		// prevents the stored token from being forwarded to an attacker-controlled
		// host (SSRF / secret exfil).
		const apiConfig = await getApiConfigWithSources();
		const storedUrl = apiConfig.plex.serverUrl.value;
		const plexServerUrl = submittedUrl || storedUrl;

		// Normalise both URLs for comparison (strip trailing slashes).
		const normalise = (u: string) => u.replace(/\/+$/, '');
		const urlMatchesStored =
			plexServerUrl && storedUrl && normalise(plexServerUrl) === normalise(storedUrl);

		// Allow token fallback only when the URL hasn't changed from what is stored.
		const plexToken = submittedToken || (urlMatchesStored ? apiConfig.plex.token.value : '');

		if (!plexServerUrl && !plexToken) {
			return fail(400, { error: 'Plex server URL and token are required' });
		}
		if (!plexServerUrl) {
			return fail(400, { error: 'Plex server URL is required' });
		}
		if (!plexToken) {
			return fail(400, { error: 'A Plex token is required to test the server connection' });
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

	testAIConnection: async ({ request }) => {
		const formData = await request.formData();
		const submittedKey = (formData.get('openaiApiKey')?.toString() ?? '').trim();
		const submittedBaseUrl = (formData.get('openaiBaseUrl')?.toString() ?? '').trim();
		const submittedModel = (formData.get('openaiModel')?.toString() ?? '').trim();

		const apiConfig = await getApiConfigWithSources();
		const storedKey = apiConfig.openai.apiKey.value;
		const storedBaseUrl = apiConfig.openai.baseUrl.value.trim();
		const storedModel = apiConfig.openai.model.value.trim();

		const baseUrl = submittedBaseUrl || storedBaseUrl;
		const model = submittedModel || storedModel;

		// The client never echoes the stored API key back (to avoid hydration leaks),
		// so a missing key field is the normal case. Fall back to the stored key
		// ONLY when the submitted base URL and model also match what's stored —
		// prevents the stored key being forwarded to an attacker-controlled
		// endpoint (same safeguard as testPlexConnection).
		const normalise = (u: string) => u.replace(/\/+$/, '');
		const baseUrlMatchesStored =
			!!baseUrl && !!storedBaseUrl && normalise(baseUrl) === normalise(storedBaseUrl);
		const modelMatchesStored = model === storedModel;
		const apiKey = submittedKey || (baseUrlMatchesStored && modelMatchesStored ? storedKey : '');

		const result = await testOpenAIConnection(apiKey, baseUrl, model);
		if (!result.success) {
			return fail(400, { error: result.error });
		}
		return { success: true, message: result.message };
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
		const theme = formData.get('wrappedTheme') ?? formData.get('theme');

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
			if (Number.isNaN(year)) {
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
			if (Number.isNaN(year)) {
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
			if (Number.isNaN(year)) {
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
			if (Number.isNaN(year)) {
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

		const data = {
			retentionDays: formData.get('retentionDays')?.toString(),
			maxCount: formData.get('maxCount')?.toString(),
			debugEnabled: formData.get('debugEnabled')?.toString() === 'true'
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
			allowUserControl: formData.get('allowUserControl')
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

	bulkApplyShareDefaults: async () => {
		try {
			const count = await bulkApplyShareDefaults();
			return { success: true, message: `Updated ${count} user share records` };
		} catch (error) {
			const message =
				error instanceof Error ? error.message : 'Failed to apply defaults to existing users';
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

	updateServerWrappedSettings: async ({ request }) => {
		const formData = await request.formData();

		const data = {
			anonymizationMode: formData.get('anonymizationMode'),
			serverWrappedShareMode: formData.get('serverWrappedShareMode'),
			settingsVersion: formData.get('settingsVersion')?.toString() ?? ''
		};

		const parsed = ServerWrappedSettingsSchema.safeParse(data);
		if (!parsed.success) {
			return fail(400, {
				error: 'Invalid input',
				fieldErrors: parsed.error.flatten().fieldErrors
			});
		}

		try {
			const result = await setServerWrappedSettingsAtomic({
				anonymizationMode: parsed.data.anonymizationMode as AnonymizationModeType,
				serverWrappedShareMode: parsed.data.serverWrappedShareMode,
				submittedVersion: parsed.data.settingsVersion
			});

			if (result === 'conflict') {
				return fail(409, {
					error: 'Settings changed in another tab. Please reload.'
				});
			}

			return { success: true, message: 'Server-wide wrapped settings updated' };
		} catch (error) {
			const message =
				error instanceof Error ? error.message : 'Failed to update server-wide wrapped settings';
			return fail(500, { error: message });
		}
	},

	updateUserDefaults: async ({ request }) => {
		const formData = await request.formData();

		const data = {
			defaultShareMode: formData.get('defaultShareMode'),
			allowUserControl: formData.get('allowUserControl'),
			settingsVersion: formData.get('settingsVersion')?.toString() ?? ''
		};

		const parsed = UserDefaultsSettingsSchema.safeParse(data);
		if (!parsed.success) {
			return fail(400, {
				error: 'Invalid input',
				fieldErrors: parsed.error.flatten().fieldErrors
			});
		}

		try {
			const result = await setUserDefaultsAtomic({
				defaultShareMode: parsed.data.defaultShareMode,
				allowUserControl: parsed.data.allowUserControl,
				submittedVersion: parsed.data.settingsVersion
			});

			if (result === 'conflict') {
				return fail(409, {
					error: 'Settings changed in another tab. Please reload.'
				});
			}

			return { success: true, message: 'User sharing defaults updated' };
		} catch (error) {
			const message =
				error instanceof Error ? error.message : 'Failed to update user sharing defaults';
			return fail(500, { error: message });
		}
	},

	testCsrfProtection: async () => {
		const csrfConfig = await getCsrfConfigWithSource();
		const originValue = csrfConfig.origin.value;

		if (!originValue) {
			return fail(400, {
				error:
					'CSRF ORIGIN is not configured. Set it via the field above or the ORIGIN environment variable.'
			});
		}

		const sourceLabel = csrfConfig.origin.source === 'db' ? 'database' : 'environment variable';
		return {
			success: true,
			message: `CSRF protection is active. Origin: ${originValue} (from ${sourceLabel})`
		};
	},

	updateCsrfOrigin: async ({ request, url }) => {
		const csrfConfig = await getCsrfConfigWithSource();
		if (csrfConfig.origin.isLocked) {
			return fail(400, {
				error: 'CSRF origin is set via environment variable and cannot be changed here'
			});
		}

		const formData = await request.formData();
		// Trim once at extraction so whitespace-only inputs (e.g. '   ') route to the
		// clear branch alongside literal '' rather than failing schema validation with
		// a confusing "Invalid origin URL" 400 — mirrors the trimmedUrlOrEmpty pattern
		// used for ApiConfigSchema URL fields above.
		const csrfOrigin = (formData.get('csrfOrigin')?.toString() ?? '').trim();
		const confirmMismatch = formData.get('confirmMismatch')?.toString() === 'true';

		if (csrfOrigin) {
			const parsed = CsrfOriginSchema.safeParse({ csrfOrigin });
			if (!parsed.success) {
				return fail(400, {
					error: 'Invalid origin URL',
					fieldErrors: parsed.error.flatten().fieldErrors
				});
			}

			// `URL.origin` returns canonical scheme://host[:port] with no trailing slash,
			// path, query, or fragment — exactly what the CSRF middleware compares against
			// the browser's Origin header.
			const normalizedOrigin = parsed.data.csrfOrigin;
			// Use the same source-of-truth that csrfHandle compares against (Origin
			// header, falling back to Referer). Behind a reverse proxy `request.url`
			// is the immutable raw internal URL — comparing against that would
			// trigger a spurious mismatch warning even when the operator correctly
			// matches the public-facing origin. Fall back to `event.url.origin`
			// (proxy-rewritten by `proxyHandle`) when neither header is present.
			const requestOrigin = getOriginFromRequest(request) ?? url.origin;
			const isMismatch = normalizedOrigin.toLowerCase() !== requestOrigin.toLowerCase();

			// Refuse to write a mismatched origin without explicit confirmation: silently
			// persisting a mismatch would lock this browser out of all admin POSTs with
			// no in-UI recovery path (would require env override or direct DB surgery).
			if (isMismatch && !confirmMismatch) {
				return fail(409, {
					requireConfirmation: true,
					attemptedOrigin: normalizedOrigin,
					requestOrigin,
					csrfMismatchMessage: `Saving "${normalizedOrigin}" while loaded from "${requestOrigin}" will lock this browser out of all admin POST operations. Recovery would require restarting the server with ORIGIN=<correct> env or editing the app_settings table directly. Confirm to proceed anyway.`
				});
			}

			try {
				await setAppSetting(AppSettingsKey.CSRF_ORIGIN, normalizedOrigin);

				if (isMismatch) {
					return {
						success: true,
						warning: true,
						message: `CSRF origin saved to "${normalizedOrigin}". Your current browser origin is "${requestOrigin}" — you may now be locked out.`
					};
				}

				return { success: true, message: 'CSRF origin updated' };
			} catch (error) {
				const message = error instanceof Error ? error.message : 'Failed to update CSRF origin';
				return fail(500, { error: message });
			}
		} else {
			const csrfSkipFlag = await getAppSetting(AppSettingsKey.CSRF_ORIGIN_SKIPPED);
			if (!env.ORIGIN && csrfSkipFlag !== 'true') {
				return fail(400, {
					error:
						'Cannot clear CSRF origin: no ORIGIN environment variable is set and the CSRF skip flag is not enabled. ' +
						'Clearing would lock all admin POST requests (403). Set ORIGIN in your environment or enable the CSRF skip flag first.'
				});
			}

			try {
				await deleteAppSetting(AppSettingsKey.CSRF_ORIGIN);
				const message = env.ORIGIN
					? 'CSRF origin cleared. Application now uses environment variable.'
					: 'CSRF origin cleared. CSRF protection is currently disabled — set ORIGIN env or re-add an origin.';
				return { success: true, message };
			} catch (error) {
				const message = error instanceof Error ? error.message : 'Failed to clear CSRF origin';
				return fail(500, { error: message });
			}
		}
	},

	clearCsrfOrigin: async () => {
		const csrfConfig = await getCsrfConfigWithSource();
		if (csrfConfig.origin.isLocked) {
			return fail(400, {
				error: 'CSRF origin is set via environment variable and cannot be cleared here'
			});
		}

		const csrfSkipFlag = await getAppSetting(AppSettingsKey.CSRF_ORIGIN_SKIPPED);
		if (!env.ORIGIN && csrfSkipFlag !== 'true') {
			return fail(400, {
				error:
					'Cannot clear CSRF origin: no ORIGIN environment variable is set and the CSRF skip flag is not enabled. ' +
					'Clearing would lock all admin POST requests (403). Set ORIGIN in your environment or enable the CSRF skip flag first.'
			});
		}

		try {
			await deleteAppSetting(AppSettingsKey.CSRF_ORIGIN);
			const message = env.ORIGIN
				? 'CSRF origin cleared. Application now uses environment variable.'
				: 'CSRF origin cleared. CSRF protection is currently disabled — set ORIGIN env or re-add an origin.';
			return { success: true, message };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to clear CSRF origin';
			return fail(500, { error: message });
		}
	},

	toggleCsrfSkip: async ({ request }) => {
		const formData = await request.formData();
		const enabled = formData.get('enabled') === 'true';
		try {
			if (enabled) {
				// Refuse to set the skip flag when an origin is already configured: the flag
				// has no effect in that state (csrfHandle only consults it when expectedOrigin
				// is unset), so setting it would be misleading and create a latent footgun.
				const csrfConfig = await getCsrfConfigWithSource();
				if (csrfConfig.origin.value) {
					return fail(400, {
						error:
							'CSRF is already enforced by the configured origin; skipping is not needed. Remove the origin first if you truly intend to skip.'
					});
				}
				await setAppSetting(AppSettingsKey.CSRF_ORIGIN_SKIPPED, 'true');
				logger.warn('CSRF origin-skip flag enabled by admin', 'Security');
				return {
					success: true,
					message:
						'CSRF origin skip enabled. CSRF origin validation is now relaxed — set a proper ORIGIN when possible.'
				};
			} else {
				// Refuse to clear the skip flag when no origin is configured: doing so
				// would immediately 403 all subsequent state-changing requests (including
				// the POST to re-enable this flag), locking the operator out of the UI.
				const csrfConfig = await getCsrfConfigWithSource();
				if (!csrfConfig.origin.value) {
					return fail(400, {
						error:
							'Cannot disable CSRF skip while no ORIGIN is configured. Set a CSRF origin first, then disable the skip.'
					});
				}
				await deleteAppSetting(AppSettingsKey.CSRF_ORIGIN_SKIPPED);
				logger.info('CSRF origin-skip flag disabled by admin', 'Security');
				return {
					success: true,
					message: 'CSRF origin skip disabled. Normal origin validation is restored.'
				};
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to update CSRF skip setting';
			logger.error(`Failed to toggle CSRF skip: ${message}`, 'Security');
			return fail(500, { error: message });
		}
	},

	clearOpenaiKey: async () => {
		const apiConfig = await getApiConfigWithSources();
		if (apiConfig.openai.apiKey.isLocked) {
			return fail(400, {
				error: 'OpenAI API key is set via environment variable and cannot be cleared here'
			});
		}

		try {
			await deleteAppSetting(AppSettingsKey.OPENAI_API_KEY);
			return { success: true, message: 'OpenAI API key cleared' };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to clear OpenAI API key';
			return fail(500, { error: message });
		}
	},

	resetCsrfWarning: async () => {
		try {
			await resetCsrfWarningDismissal();
			logger.info('CSRF warning re-enabled by admin', 'Security');
			return { success: true, message: 'CSRF warning re-enabled for this user' };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to reset CSRF warning';
			logger.error(`Failed to reset CSRF warning: ${message}`, 'Security');
			return fail(500, { error: message });
		}
	},

	updateTrustProxy: async ({ request }) => {
		const trustProxyConfig = await getTrustProxyConfigWithSource();
		if (trustProxyConfig.trustProxy.isLocked) {
			return fail(400, {
				error: 'TRUST_PROXY is set via environment variable and cannot be changed here'
			});
		}

		const formData = await request.formData();
		const parsed = TrustProxySchema.safeParse({ enabled: formData.get('enabled') });
		if (!parsed.success) {
			return fail(400, { error: 'Invalid input: enabled must be "true" or "false"' });
		}
		const enabled = parsed.data.enabled;

		try {
			await setAppSetting(AppSettingsKey.TRUST_PROXY, enabled ? 'true' : 'false');
			if (enabled) {
				logger.warn(
					'Reverse-proxy header trust enabled by admin. Verify your upstream proxy strips inbound x-forwarded-* headers.',
					'Security'
				);
			} else {
				logger.info('Reverse-proxy header trust disabled by admin', 'Security');
			}
			return {
				success: true,
				message: enabled
					? 'Reverse-proxy header trust enabled.'
					: 'Reverse-proxy header trust disabled.'
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to update TRUST_PROXY';
			logger.error(`Failed to update TRUST_PROXY: ${message}`, 'Security');
			return fail(500, { error: message });
		}
	}
});
