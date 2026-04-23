import { fail } from '@sveltejs/kit';
import { z } from 'zod';
import { env } from '$env/dynamic/private';
import {
	AnonymizationMode,
	type AnonymizationModeType,
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
	getCsrfConfigWithSource,
	getUITheme,
	getWrappedLogoMode,
	getWrappedTheme,
	isCsrfWarningDismissed,
	resetCsrfWarningDismissal,
	setAnonymizationMode,
	setAppSetting,
	setCachedServerName,
	setUITheme,
	setWrappedLogoMode,
	setWrappedTheme,
	ThemePresets,
	type ThemePresetType,
	toSafeConfigValue,
	WrappedLogoMode,
	type WrappedLogoModeType
} from '$lib/server/admin/settings.service';
import { getAvailableYears } from '$lib/server/admin/users.service';
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
import {
	bulkApplyUserControl,
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
const GlobalDefaultsSchema = z.object({
	defaultShareMode: ShareModeSchema,
	allowUserControl: z.coerce.boolean()
});
const BulkUserControlSchema = z.object({
	canUserControl: z.enum(['true', 'false']).transform((v) => v === 'true')
});

// Server-wide wrapped only supports public and private-oauth (not private-link)
const ServerWrappedModeSchema = z.enum(['public', 'private-oauth']);

const PrivacySettingsSchema = z.object({
	anonymizationMode: AnonymizationSchema,
	serverWrappedShareMode: ServerWrappedModeSchema,
	defaultShareMode: ShareModeSchema,
	allowUserControl: z.coerce.boolean()
});

const ApiConfigSchema = z.object({
	plexServerUrl: z.string().max(512).url('Invalid URL format').optional().or(z.literal('')),
	plexToken: z.string().max(512).optional(),
	openaiApiKey: z.string().max(512).optional(),
	openaiBaseUrl: z.string().max(512).url('Invalid URL format').optional().or(z.literal('')),
	openaiModel: z.string().max(100).optional()
});

const LogSettingsSchema = z.object({
	retentionDays: z.number().min(1).max(365),
	maxCount: z.number().min(1000).max(1000000),
	debugEnabled: z.boolean()
});

const CsrfOriginSchema = z.object({
	csrfOrigin: z
		.string()
		.url('Invalid URL format')
		.refine((url) => url.startsWith('http://') || url.startsWith('https://'), {
			message: 'Origin must start with http:// or https://'
		})
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
		csrfOriginSkippedRaw
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
		getAppSetting(AppSettingsKey.CSRF_ORIGIN_SKIPPED)
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
		security: {
			originValue: csrfConfig.origin.value,
			csrfEnabled: !!csrfConfig.origin.value,
			originSource: csrfConfig.origin.source,
			originLocked: csrfConfig.origin.isLocked,
			warningDismissed: csrfWarningDismissed,
			// Flag is only effective when no origin is configured; mirror csrfHandle semantics
			csrfOriginSkipped: csrfOriginSkippedRaw === 'true' && !csrfConfig.origin.value
		}
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
			const apiConfig = await getApiConfigWithSources();

			// Save each setting (only if provided AND not locked by ENV).
			// Secret fields (plexToken, openaiApiKey) are blank on load to avoid
			// leaking via hydration; an empty submission means "no change".
			if (parsed.data.plexServerUrl && !apiConfig.plex.serverUrl.isLocked) {
				await setAppSetting(AppSettingsKey.PLEX_SERVER_URL, parsed.data.plexServerUrl);
				// URL changed — the cached machineId may be stale; next membership
				// check will re-fetch /identity against the new URL.
				await clearCachedServerMachineId();
			}
			if (parsed.data.plexToken && !apiConfig.plex.token.isLocked) {
				await setAppSetting(AppSettingsKey.PLEX_TOKEN, parsed.data.plexToken);
				// Token changed — the cached machineId was fetched with the old token;
				// drop it so /identity runs with the new credentials.
				await clearCachedServerMachineId();
			}
			if (parsed.data.openaiApiKey && !apiConfig.openai.apiKey.isLocked) {
				await setAppSetting(AppSettingsKey.OPENAI_API_KEY, parsed.data.openaiApiKey);
			}
			if (parsed.data.openaiBaseUrl && !apiConfig.openai.baseUrl.isLocked) {
				await setAppSetting(AppSettingsKey.OPENAI_BASE_URL, parsed.data.openaiBaseUrl);
			}
			if (parsed.data.openaiModel && !apiConfig.openai.model.isLocked) {
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

	bulkApplyUserControl: async ({ request }) => {
		const formData = await request.formData();

		const parsed = BulkUserControlSchema.safeParse({
			canUserControl: formData.get('canUserControl')
		});
		if (!parsed.success) {
			return fail(400, {
				error: 'Invalid input: canUserControl must be "true" or "false"'
			});
		}

		try {
			const count = await bulkApplyUserControl(parsed.data.canUserControl);
			return { success: true, message: `Updated ${count} user share records` };
		} catch (error) {
			const message =
				error instanceof Error ? error.message : 'Failed to apply default to existing users';
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

	updateCsrfOrigin: async ({ request }) => {
		const csrfConfig = await getCsrfConfigWithSource();
		if (csrfConfig.origin.isLocked) {
			return fail(400, {
				error: 'CSRF origin is set via environment variable and cannot be changed here'
			});
		}

		const formData = await request.formData();
		const csrfOrigin = formData.get('csrfOrigin')?.toString() ?? '';

		if (csrfOrigin) {
			const parsed = CsrfOriginSchema.safeParse({ csrfOrigin });
			if (!parsed.success) {
				return fail(400, {
					error: 'Invalid origin URL',
					fieldErrors: parsed.error.flatten().fieldErrors
				});
			}

			try {
				const normalizedOrigin = csrfOrigin.replace(/\/$/, '');
				const requestOrigin = new URL(request.url).origin;
				await setAppSetting(AppSettingsKey.CSRF_ORIGIN, normalizedOrigin);

				if (normalizedOrigin.toLowerCase() !== requestOrigin.toLowerCase()) {
					return {
						success: true,
						warning: true,
						message: `CSRF origin saved, but it does not match your current origin (${requestOrigin}). You may get locked out of the admin panel.`
					};
				}

				return { success: true, message: 'CSRF origin updated' };
			} catch (error) {
				const message = error instanceof Error ? error.message : 'Failed to update CSRF origin';
				return fail(500, { error: message });
			}
		} else {
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
	}
};
