import { arch as osArch, platform as osPlatform } from 'node:os';
import { fail } from '@sveltejs/kit';
import { z } from 'zod';
import { env } from '$env/dynamic/private';
import {
	AnonymizationMode,
	type AnonymizationModeType,
	API_CONFIG_KEYS,
	AppSettingsKey,
	type ConfigSource,
	CSRF_ORIGIN_SETTINGS_KEYS,
	clearApiConfigKey,
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
	isPlexInsecureLocalHttpAllowed,
	LOG_SETTINGS_KEYS,
	resetCsrfWarningDismissal,
	SERVER_WRAPPED_SETTINGS_KEYS,
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
	TRUST_PROXY_SETTINGS_KEYS,
	toSafeConfigValue,
	UI_THEME_SETTINGS_KEYS,
	USER_DEFAULTS_SETTINGS_KEYS,
	WRAPPED_LOGO_MODE_SETTINGS_KEYS,
	WRAPPED_THEME_SETTINGS_KEYS,
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
import {
	CredentialedUrlError,
	envAllowsInsecureLocalPlexHttp,
	normalizeOpenAIBaseUrl,
	normalizePlexServerUrl
} from '$lib/server/security/credentialed-url';
import { getOriginFromRequest } from '$lib/server/security/csrf-handle';
import { _resetTrustProxyCache } from '$lib/server/security/proxy-handle';
import {
	bulkApplyShareDefaults,
	getGlobalAllowUserControl,
	getGlobalDefaultShareMode,
	getServerWrappedShareMode
} from '$lib/server/sharing/service';
import { getAppVersion } from '$lib/server/version';
import type { Actions, PageServerLoad } from './$types';

/**
 * OCC strategy: EXTERNAL.
 * `ThemeSchema` is a top-level `z.enum()` whose payload would change shape if
 * wrapped in `z.object({...})` to carry an inline `settingsVersion`. The
 * action handler validates `formData.get('settingsVersion')` against the
 * current row BEFORE `safeParse`; on mismatch returns
 * `fail(409, { error: '__OCC_CONFLICT__', settingsVersion: current })`.
 * See v3 plan §A5 / Table D2.
 */
const ThemeSchema = z.enum([
	'modern-minimal',
	'supabase',
	'doom-64',
	'amber-minimal',
	'soviet-red'
]);

/**
 * OCC strategy: INHERITED FROM PARENT.
 * `AnonymizationSchema` is consumed as a field of `ServerWrappedSettingsSchema`
 * (a `z.object`), so OCC is enforced via that parent's inline `settingsVersion`.
 */
const AnonymizationSchema = z.enum(['real', 'anonymous', 'hybrid']);

/**
 * OCC strategy: EXTERNAL.
 * Top-level `z.enum` like `ThemeSchema`. Action validates `settingsVersion`
 * before `safeParse`; mismatch → `fail(409, ...)`.
 */
const WrappedLogoModeSchema = z.enum(['always_show', 'always_hide', 'user_choice']);

/**
 * OCC strategy: INHERITED FROM PARENT.
 * Consumed as a field of `UserDefaultsSettingsSchema` (a `z.object`).
 */
const ShareModeSchema = z.enum(['public', 'private-oauth', 'private-link']);

const BooleanStringSchema = z.enum(['true', 'false']).transform((value) => value === 'true');

/**
 * OCC strategy: INHERITED FROM PARENT.
 * Consumed as a field of `ServerWrappedSettingsSchema`. Server-wide wrapped
 * only supports public and private-oauth (not private-link).
 */
const ServerWrappedModeSchema = z.enum(['public', 'private-oauth']);

/**
 * OCC strategy: INLINE `settingsVersion`.
 * `z.object` schema: the version field rides alongside the data fields and
 * is validated in the same `safeParse` call.
 */
const ServerWrappedSettingsSchema = z.object({
	anonymizationMode: AnonymizationSchema,
	serverWrappedShareMode: ServerWrappedModeSchema,
	settingsVersion: z.string().min(1, 'Missing settings version (reload the page)')
});

/**
 * OCC strategy: INLINE `settingsVersion`.
 */
const UserDefaultsSettingsSchema = z.object({
	defaultShareMode: ShareModeSchema,
	allowUserControl: BooleanStringSchema,
	settingsVersion: z.string().min(1, 'Missing settings version (reload the page)')
});

// Each value field is `string | undefined`:
//   undefined = field absent from this submission (e.g. the OpenAI panel saved
//               and didn't include Plex inputs) → service treats as no-op.
//   ''        = field present but blank → service clears the echoed-back URL
//               field, or no-ops for secret keys.
//   non-empty = write.
// The URL-validated fields accept `''` via the literal union so a cleared input
// passes validation and reaches the service as the clear signal.
//
// Whitespace handling:
//   - Secret keys (plexToken, openaiApiKey) use `optionalTrimmed(...)`: empty,
//     whitespace-only, and absent all collapse to `undefined` (no-op). Prevents
//     a stray "  " press from being persisted as the secret.
//   - Echoed-back URL (openaiBaseUrl) gets `.trim()` on the inner string so
//     whitespace-only inputs become the canonical clear signal `''`, preserving
//     the user's ability to clear by blanking the field.
//   - `openaiModel` is the exception: it is also echoed back, but a blank or
//     whitespace-only submission now fails validation. Clearing must go through
//     the dedicated `?/clearOpenaiModel` action — see the schema note below.
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

/**
 * OCC strategy: INLINE `apiConfigVersion`.
 * Same inline-OCC pattern but uses a dedicated `apiConfigVersion` field name
 * (predates the `settingsVersion` convention; both fire the same 409 path
 * in the action handler).
 */
const ApiConfigSchema = z.object({
	plexServerUrl: trimmedUrlOrEmpty,
	plexToken: optionalTrimmed(512),
	plexAllowInsecureLocalHttp: z
		.enum(['true', 'false'])
		.optional()
		.transform((v) => v === 'true'),
	openaiApiKey: optionalTrimmed(512),
	openaiBaseUrl: trimmedUrlOrEmpty,
	// `openaiModel` is echoed back; submitting blank used to silently clear the row,
	// which made it possible to wipe the active model name from the OpenAI panel.
	// Require non-empty here. Explicit clearing is done via the dedicated
	// `?/clearOpenaiModel` action (mirrors `?/clearOpenaiKey`).
	openaiModel: z.string().trim().min(1, 'Model name is required').max(100).optional(),
	apiConfigVersion: z.string().min(1, 'Missing api config version (reload the page)')
});

/**
 * OCC strategy: INLINE `settingsVersion`.
 * Retrofitted in PR-2 (US-020 partial) — was NONE in PR-1. The version field
 * rides alongside the data fields and is validated in the same `safeParse`
 * call. The action handler promotes blank/missing/stale `settingsVersion` to
 * the same 409 path as the other inline-OCC actions.
 */
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
	debugEnabled: z.boolean(),
	settingsVersion: z.string().min(1, 'Missing settings version (reload the page)')
});

/**
 * OCC strategy: INLINE `settingsVersion` (validated outside the Zod schema).
 * Retrofitted in PR-2 (US-020 partial) — was NONE in PR-1. The
 * `updateCsrfOrigin` action extracts `settingsVersion` from `formData`
 * BEFORE the set/clear branching and returns `fail(409, ...)` on stale.
 * The version is intentionally NOT a field of `CsrfOriginSchema` because
 * the clear branch (`csrfOrigin === ''`) bypasses the schema entirely.
 */
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

/**
 * OCC strategy: INLINE `settingsVersion`.
 * Retrofitted in PR-2 (US-020 partial) — was NONE in PR-1. Single-key OCC
 * over `AppSettingsKey.TRUST_PROXY`; same blank/missing/stale → 409 pattern
 * as `LogSettingsSchema` / `UserDefaultsSettingsSchema`.
 */
const TrustProxySchema = z.object({
	enabled: z.enum(['true', 'false']).transform((v) => v === 'true'),
	confirmRisk: z.enum(['true']).optional(),
	settingsVersion: z.string().min(1, 'Missing settings version (reload the page)')
});

interface SettingValue {
	value: string;
	source: ConfigSource;
	isLocked: boolean;
}

type SafeSettingValue = Omit<SettingValue, 'value'> & { hasValue: boolean };

/**
 * External OCC check used by the top-level `z.enum` actions (`updateUITheme`,
 * `updateWrappedTheme`, `updateWrappedLogoMode`) where wrapping the schema
 * in `z.object({...})` to carry an inline `settingsVersion` would change
 * the payload shape. Per v3 plan §A5 Table D2.
 *
 * Returns `{ status: 'ok' }` to proceed, or
 * `{ status: 'conflict', current: <ISO> }` to short-circuit the action with
 * `fail(409, { error: '__OCC_CONFLICT__', settingsVersion: current })`.
 */
async function externalOccCheck(
	submittedVersion: string,
	keys: readonly string[]
): Promise<{ status: 'ok' } | { status: 'conflict'; current: string }> {
	if (!submittedVersion) {
		return { status: 'conflict', current: new Date(0).toISOString() };
	}
	const currentUpdatedAt = await getAppSettingsUpdatedAt(keys);
	const currentMs = currentUpdatedAt?.getTime() ?? 0;
	const submittedMs = Date.parse(submittedVersion);
	if (Number.isNaN(submittedMs) || submittedMs < currentMs) {
		return {
			status: 'conflict',
			current: currentUpdatedAt?.toISOString() ?? new Date(0).toISOString()
		};
	}
	return { status: 'ok' };
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
		serverWrappedShareMode,
		csrfConfig,
		csrfWarningDismissed,
		csrfOriginSkippedRaw,
		trustProxyConfig,
		plexAllowInsecureLocalHttp,
		serverWrappedSettingsUpdatedAt,
		userDefaultsSettingsUpdatedAt,
		apiConfigUpdatedAt,
		logSettingsUpdatedAt,
		trustProxySettingsUpdatedAt,
		csrfOriginSettingsUpdatedAt,
		uiThemeSettingsUpdatedAt,
		wrappedThemeSettingsUpdatedAt,
		wrappedLogoModeSettingsUpdatedAt,
		// Eager-load the total play-history count so the destructive Delete History
		// buttons can render with a known count from first paint, instead of needing
		// an on-click POST to ?/getPlayHistoryCount before they can show a
		// confirmation dialog. ISSUE-003 hit the no-count path and observed the
		// click navigating to /admin with no feedback.
		playHistoryTotalCount
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
		isPlexInsecureLocalHttpAllowed(),
		getAppSettingsUpdatedAt(SERVER_WRAPPED_SETTINGS_KEYS),
		getAppSettingsUpdatedAt(USER_DEFAULTS_SETTINGS_KEYS),
		getAppSettingsUpdatedAt(API_CONFIG_KEYS),
		getAppSettingsUpdatedAt(LOG_SETTINGS_KEYS),
		getAppSettingsUpdatedAt(TRUST_PROXY_SETTINGS_KEYS),
		getAppSettingsUpdatedAt(CSRF_ORIGIN_SETTINGS_KEYS),
		getAppSettingsUpdatedAt(UI_THEME_SETTINGS_KEYS),
		getAppSettingsUpdatedAt(WRAPPED_THEME_SETTINGS_KEYS),
		getAppSettingsUpdatedAt(WRAPPED_LOGO_MODE_SETTINGS_KEYS),
		countPlayHistory()
	]);

	const currentYear = new Date().getFullYear();

	return {
		settings: {
			plexServerUrl: apiConfig.plex.serverUrl as SettingValue,
			plexToken: toSafeConfigValue(apiConfig.plex.token) satisfies SafeSettingValue,
			plexAllowInsecureLocalHttp,
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
		playHistoryTotalCount,
		// Returned explicitly here so the System tab's "App version" row renders
		// even if the root layout data merge ever changes shape — the System tab
		// reads `data.appVersion.display` directly.
		appVersion: getAppVersion(),
		// System info panel (ISSUE-006) — exposed as plain primitives so the
		// SSR JSON is small and the client doesn't need to import node:os.
		systemInfo: {
			uptimeSeconds: Math.floor(process.uptime()),
			osPlatform: osPlatform(),
			osArch: osArch(),
			bunVersion: typeof Bun !== 'undefined' ? Bun.version : null
		},
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
		// Fall back to the epoch when no rows yet exist (fresh install / all-cleared).
		// The atomic services accept any parseable timestamp on rows.length === 0 and
		// the Zod `.min(1)` gate requires non-empty — emitting `''` would lock the
		// admin out of the first save with an irrecoverable 409. The epoch is the
		// canonical "older than anything" sentinel for OCC purposes.
		serverWrappedSettingsVersion:
			serverWrappedSettingsUpdatedAt?.toISOString() ?? new Date(0).toISOString(),
		userDefaultsSettingsVersion:
			userDefaultsSettingsUpdatedAt?.toISOString() ?? new Date(0).toISOString(),
		apiConfigVersion: apiConfigUpdatedAt?.toISOString() ?? new Date(0).toISOString(),
		logSettingsVersion: logSettingsUpdatedAt?.toISOString() ?? new Date(0).toISOString(),
		trustProxyVersion: trustProxySettingsUpdatedAt?.toISOString() ?? new Date(0).toISOString(),
		csrfOriginVersion: csrfOriginSettingsUpdatedAt?.toISOString() ?? new Date(0).toISOString(),
		uiThemeVersion: uiThemeSettingsUpdatedAt?.toISOString() ?? new Date(0).toISOString(),
		wrappedThemeVersion: wrappedThemeSettingsUpdatedAt?.toISOString() ?? new Date(0).toISOString(),
		wrappedLogoModeVersion:
			wrappedLogoModeSettingsUpdatedAt?.toISOString() ?? new Date(0).toISOString(),
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
			plexAllowInsecureLocalHttp: field('plexAllowInsecureLocalHttp'),
			openaiApiKey: field('openaiApiKey'),
			openaiBaseUrl: field('openaiBaseUrl'),
			openaiModel: field('openaiModel'),
			apiConfigVersion: formData.get('apiConfigVersion')?.toString() ?? ''
		};

		const parsed = ApiConfigSchema.safeParse(data);
		if (!parsed.success) {
			const fieldErrors = parsed.error.flatten().fieldErrors;
			// Treat a missing/blank apiConfigVersion as a stale tab — recovery is the
			// same as a real OCC conflict (reload the page).
			if (fieldErrors.apiConfigVersion?.length) {
				return fail(409, {
					conflict: true,
					error: 'Settings changed in another tab. Reload and try again.'
				});
			}
			return fail(400, {
				error: 'Invalid input',
				fieldErrors
			});
		}

		try {
			const apiConfig = await getApiConfigWithSources();
			const values = {
				plexServerUrl: parsed.data.plexServerUrl,
				plexToken: parsed.data.plexToken,
				plexAllowInsecureLocalHttp: parsed.data.plexAllowInsecureLocalHttp,
				openaiApiKey: parsed.data.openaiApiKey,
				openaiBaseUrl: parsed.data.openaiBaseUrl,
				openaiModel: parsed.data.openaiModel
			};

			if (values.plexServerUrl && !apiConfig.plex.serverUrl.isLocked) {
				try {
					values.plexServerUrl = normalizePlexServerUrl(values.plexServerUrl, {
						allowInsecureLocalHttp:
							values.plexAllowInsecureLocalHttp || envAllowsInsecureLocalPlexHttp()
					});
				} catch (err) {
					return fail(400, {
						error: err instanceof CredentialedUrlError ? err.message : 'Invalid Plex server URL'
					});
				}
			}

			if (values.openaiBaseUrl && !apiConfig.openai.baseUrl.isLocked) {
				try {
					values.openaiBaseUrl = normalizeOpenAIBaseUrl(values.openaiBaseUrl);
				} catch (err) {
					return fail(400, {
						error: err instanceof CredentialedUrlError ? err.message : 'Invalid OpenAI base URL'
					});
				}
			}

			const result = await setApiConfigAtomic({
				values,
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
		const allowInsecureLocalHttp = formData.get('plexAllowInsecureLocalHttp') === 'true';

		// The client never echoes the stored token back (to avoid hydration leaks),
		// so a missing token field is the normal case. We fall back to the stored
		// token ONLY when the submitted URL also matches the stored URL — this
		// prevents the stored token from being forwarded to an attacker-controlled
		// host (SSRF / secret exfil).
		const apiConfig = await getApiConfigWithSources();
		const storedUrl = apiConfig.plex.serverUrl.value;
		let plexServerUrl = submittedUrl || storedUrl;

		// Normalise both URLs for comparison (strip trailing slashes).
		const normalise = (u: string) => u.replace(/\/+$/, '');
		const urlMatchesStored =
			Boolean(plexServerUrl && storedUrl) && normalise(plexServerUrl) === normalise(storedUrl);

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
			plexServerUrl = normalizePlexServerUrl(plexServerUrl, {
				allowInsecureLocalHttp:
					allowInsecureLocalHttp || (urlMatchesStored && (await isPlexInsecureLocalHttpAllowed()))
			});
		} catch (err) {
			return fail(400, {
				error: err instanceof CredentialedUrlError ? err.message : 'Invalid Plex server URL'
			});
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

		const occ = await externalOccCheck(
			formData.get('settingsVersion')?.toString() ?? '',
			UI_THEME_SETTINGS_KEYS
		);
		if (occ.status === 'conflict') {
			return fail(409, { error: '__OCC_CONFLICT__', settingsVersion: occ.current });
		}

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

		const occ = await externalOccCheck(
			formData.get('settingsVersion')?.toString() ?? '',
			WRAPPED_THEME_SETTINGS_KEYS
		);
		if (occ.status === 'conflict') {
			return fail(409, { error: '__OCC_CONFLICT__', settingsVersion: occ.current });
		}

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

	updateWrappedLogoMode: async ({ request }) => {
		const formData = await request.formData();

		const occ = await externalOccCheck(
			formData.get('settingsVersion')?.toString() ?? '',
			WRAPPED_LOGO_MODE_SETTINGS_KEYS
		);
		if (occ.status === 'conflict') {
			return fail(409, { error: '__OCC_CONFLICT__', settingsVersion: occ.current });
		}

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
			debugEnabled: formData.get('debugEnabled')?.toString() === 'true',
			settingsVersion: formData.get('settingsVersion')?.toString() ?? ''
		};

		const parsed = LogSettingsSchema.safeParse(data);
		if (!parsed.success) {
			const fieldErrors = parsed.error.flatten().fieldErrors;
			// Promote blank/missing settingsVersion to a 409 conflict — matches the
			// inline-OCC pattern used by `updateUserDefaults` and
			// `updateServerWrappedSettings`. Recovery is reload the page.
			if (fieldErrors.settingsVersion?.length) {
				return fail(409, {
					conflict: true,
					error: 'Settings changed in another tab. Please reload.'
				});
			}
			logger.warn('updateLogSettings rejected: validation failed', 'Settings', { fieldErrors });
			return fail(400, {
				error: 'Invalid input',
				fieldErrors
			});
		}

		// OCC: refuse the write when the submitted version is older than the row's
		// current `max(updatedAt)` across LOG_SETTINGS_KEYS. We compare the parsed
		// ms timestamps so an empty row table (fresh install) compares 0 against
		// the epoch fallback the load sends — both round to 0 and the write
		// proceeds without a false-409.
		const currentUpdatedAt = await getAppSettingsUpdatedAt(LOG_SETTINGS_KEYS);
		const currentMs = currentUpdatedAt?.getTime() ?? 0;
		const submittedMs = Date.parse(parsed.data.settingsVersion);
		if (Number.isNaN(submittedMs) || submittedMs < currentMs) {
			return fail(409, {
				conflict: true,
				error: 'Settings changed in another tab. Please reload.'
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

	updateServerWrappedSettings: async ({ request }) => {
		const formData = await request.formData();

		const data = {
			anonymizationMode: formData.get('anonymizationMode'),
			serverWrappedShareMode: formData.get('serverWrappedShareMode'),
			settingsVersion: formData.get('settingsVersion')?.toString() ?? ''
		};

		const parsed = ServerWrappedSettingsSchema.safeParse(data);
		if (!parsed.success) {
			const fieldErrors = parsed.error.flatten().fieldErrors;
			if (fieldErrors.settingsVersion?.length) {
				return fail(409, {
					conflict: true,
					error: 'Settings changed in another tab. Please reload.'
				});
			}
			logger.warn('updateServerWrappedSettings rejected: validation failed', 'Settings', {
				fieldErrors
			});
			return fail(400, {
				error: 'Invalid input',
				fieldErrors
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
			const fieldErrors = parsed.error.flatten().fieldErrors;
			if (fieldErrors.settingsVersion?.length) {
				return fail(409, {
					conflict: true,
					error: 'Settings changed in another tab. Please reload.'
				});
			}
			logger.warn('updateUserDefaults rejected: validation failed', 'Settings', { fieldErrors });
			return fail(400, {
				error: 'Invalid input',
				fieldErrors
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
		const submittedVersion = formData.get('settingsVersion')?.toString() ?? '';

		// Inline OCC, validated outside the schema so both the set (csrfOrigin
		// non-empty) and clear (csrfOrigin === '') branches share the same check.
		// Promotes blank/missing/stale `settingsVersion` to the same 409 path the
		// other inline-OCC actions use.
		if (!submittedVersion) {
			return fail(409, {
				conflict: true,
				error: 'Settings changed in another tab. Please reload.'
			});
		}
		const currentUpdatedAt = await getAppSettingsUpdatedAt(CSRF_ORIGIN_SETTINGS_KEYS);
		const currentMs = currentUpdatedAt?.getTime() ?? 0;
		const submittedMs = Date.parse(submittedVersion);
		if (Number.isNaN(submittedMs) || submittedMs < currentMs) {
			return fail(409, {
				conflict: true,
				error: 'Settings changed in another tab. Please reload.'
			});
		}

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
			// Use clearApiConfigKey (not deleteAppSetting) so API_CONFIG_VERSION is
			// bumped in the same transaction. Without the bump, max(updatedAt) over
			// API_CONFIG_KEYS would not advance, letting a stale tab whose
			// apiConfigVersion equals that timestamp pass OCC and resurrect the
			// cleared key via updateApiConfig.
			await clearApiConfigKey(AppSettingsKey.OPENAI_API_KEY);
			return { success: true, message: 'OpenAI API key cleared' };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to clear OpenAI API key';
			return fail(500, { error: message });
		}
	},

	clearOpenaiModel: async () => {
		const apiConfig = await getApiConfigWithSources();
		if (apiConfig.openai.model.isLocked) {
			return fail(400, {
				error: 'OpenAI model is set via environment variable and cannot be cleared here'
			});
		}

		try {
			// See clearOpenaiKey above — clearApiConfigKey bumps API_CONFIG_VERSION
			// so a stale tab cannot resurrect the cleared model name through OCC.
			await clearApiConfigKey(AppSettingsKey.OPENAI_MODEL);
			return { success: true, message: 'OpenAI model cleared (will fall back to default)' };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to clear OpenAI model';
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
		const parsed = TrustProxySchema.safeParse({
			enabled: formData.get('enabled'),
			confirmRisk: formData.get('confirmRisk') ?? undefined,
			settingsVersion: formData.get('settingsVersion')?.toString() ?? ''
		});
		if (!parsed.success) {
			const fieldErrors = parsed.error.flatten().fieldErrors;
			if (fieldErrors.settingsVersion?.length) {
				return fail(409, {
					conflict: true,
					error: 'Settings changed in another tab. Please reload.'
				});
			}
			return fail(400, {
				error:
					'Invalid input: enabled must be "true" or "false"; confirmRisk must be "true" when provided'
			});
		}
		const enabled = parsed.data.enabled;
		if (enabled && parsed.data.confirmRisk !== 'true') {
			return fail(400, {
				error: 'Confirm the reverse-proxy header trust risk before enabling TRUST_PROXY.'
			});
		}

		// OCC: refuse the write when the submitted version is older than the row's
		// current `updatedAt`. Same shape as `updateLogSettings`.
		const currentUpdatedAt = await getAppSettingsUpdatedAt(TRUST_PROXY_SETTINGS_KEYS);
		const currentMs = currentUpdatedAt?.getTime() ?? 0;
		const submittedMs = Date.parse(parsed.data.settingsVersion);
		if (Number.isNaN(submittedMs) || submittedMs < currentMs) {
			return fail(409, {
				conflict: true,
				error: 'Settings changed in another tab. Please reload.'
			});
		}

		try {
			await setAppSetting(AppSettingsKey.TRUST_PROXY, enabled ? 'true' : 'false');
			// Invalidate the in-process cache AFTER the DB write so subsequent
			// requests re-resolve the new value.
			_resetTrustProxyCache();
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
