import { fail } from '@sveltejs/kit';
import { z } from 'zod';
import {
	API_CONFIG_KEYS,
	AppSettingsKey,
	type ConfigSource,
	clearApiConfigKey,
	clearCachedServerMachineId,
	getApiConfigWithSources,
	getAppSettingsUpdatedAt,
	isPlexInsecureLocalHttpAllowed,
	setApiConfigAtomic,
	setCachedServerName,
	toSafeConfigValue
} from '$lib/server/admin/settings.service';
import { optionalTrimmed } from '$lib/server/admin/zod-helpers';
import { requireAdminActions } from '$lib/server/auth/guards';
import { testOpenAIConnection } from '$lib/server/funfacts/test-connection';
import {
	CredentialedUrlError,
	envAllowsInsecureLocalPlexHttp,
	normalizeOpenAIBaseUrl,
	normalizePlexServerUrl
} from '$lib/server/security/credentialed-url';
import type { Actions, PageServerLoad } from './$types';

interface SettingValue {
	value: string;
	source: ConfigSource;
	isLocked: boolean;
}

type SafeSettingValue = Omit<SettingValue, 'value'> & { hasValue: boolean };

// Trim before the union so whitespace-only inputs collapse to '' and match the
// literal-empty branch (mirrors the monolith's trimmedUrlOrEmpty pattern).
const trimmedUrlOrEmpty = z
	.preprocess(
		(v) => (typeof v === 'string' ? v.trim() : v),
		z.union([z.string().max(512).url('Invalid URL format'), z.literal('')])
	)
	.optional();

/**
 * 409 error message for the `apiConfigVersion` OCC conflict path. Worded
 * slightly differently from `OCC_CONFLICT_MESSAGE` ('Please reload.') in
 * `$lib/server/admin/occ-helpers` — connections predates the
 * settingsVersion convention and uses the `apiConfigVersion` field name,
 * so its message inherits the legacy 'Reload and try again.' wording. Both
 * messages are functionally identical; the wording is not unified because
 * (a) several tests pin the literal string content and (b) operators
 * comparing the two messages can use the difference to tell which OCC path
 * fired.
 */
const API_CONFIG_OCC_MESSAGE = 'Settings changed in another tab. Reload and try again.';

const ApiConfigSchema = z.object({
	plexServerUrl: trimmedUrlOrEmpty,
	plexToken: optionalTrimmed(512),
	plexAllowInsecureLocalHttp: z
		.enum(['true', 'false'])
		.optional()
		.transform((v) => v === 'true'),
	openaiApiKey: optionalTrimmed(512),
	openaiBaseUrl: trimmedUrlOrEmpty,
	openaiModel: z.string().trim().min(1, 'Model name is required').max(100).optional(),
	apiConfigVersion: z.string().min(1, 'Missing api config version (reload the page)')
});

export const load: PageServerLoad = async () => {
	const [apiConfig, plexAllowInsecureLocalHttp, apiConfigUpdatedAt] = await Promise.all([
		getApiConfigWithSources(),
		isPlexInsecureLocalHttpAllowed(),
		getAppSettingsUpdatedAt(API_CONFIG_KEYS)
	]);

	return {
		settings: {
			plexServerUrl: apiConfig.plex.serverUrl as SettingValue,
			plexToken: toSafeConfigValue(apiConfig.plex.token) satisfies SafeSettingValue,
			plexAllowInsecureLocalHttp,
			openaiApiKey: toSafeConfigValue(apiConfig.openai.apiKey) satisfies SafeSettingValue,
			openaiBaseUrl: apiConfig.openai.baseUrl as SettingValue,
			openaiModel: apiConfig.openai.model as SettingValue
		},
		apiConfigVersion: apiConfigUpdatedAt?.toISOString() ?? new Date(0).toISOString()
	};
};

export const actions: Actions = requireAdminActions({
	updateApiConfig: async ({ request }) => {
		const formData = await request.formData();

		// Distinguish "field absent from this submission" from "field submitted
		// blank": the connections page has two separate forms (Plex panel,
		// OpenAI panel) both targeting ?/updateApiConfig. Saving one panel does
		// NOT include the other panel's inputs; treating absent fields as ''
		// would wipe the other panel's stored values via the echoed-back-key
		// clear path.
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
			if (fieldErrors.apiConfigVersion?.length) {
				return fail(409, {
					conflict: true,
					error: API_CONFIG_OCC_MESSAGE
				});
			}
			return fail(400, { error: 'Invalid input', fieldErrors });
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
					error: API_CONFIG_OCC_MESSAGE
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

		// SSRF safeguard: client never echoes the stored token, so missing token
		// is the normal case. Fall back to stored only when submitted URL matches
		// stored URL — prevents forwarding the stored token to an attacker-
		// controlled host.
		const apiConfig = await getApiConfigWithSources();
		const storedUrl = apiConfig.plex.serverUrl.value;
		let plexServerUrl = submittedUrl || storedUrl;

		const normalise = (u: string) => u.replace(/\/+$/, '');
		const urlMatchesStored =
			Boolean(plexServerUrl && storedUrl) && normalise(plexServerUrl) === normalise(storedUrl);

		const plexToken = submittedToken || (urlMatchesStored ? apiConfig.plex.token.value : '');

		if (!plexServerUrl && !plexToken) {
			return fail(400, { error: 'Plex server URL and token are required' });
		}
		if (!plexServerUrl) return fail(400, { error: 'Plex server URL is required' });
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
			const response = await fetch(`${plexServerUrl}/`, {
				headers: { Accept: 'application/json', 'X-Plex-Token': plexToken }
			});
			if (!response.ok) {
				return fail(400, { error: `Connection failed: ${response.status} ${response.statusText}` });
			}
			const data = (await response.json()) as { MediaContainer?: { friendlyName?: string } };
			const serverName = data?.MediaContainer?.friendlyName ?? 'Unknown';
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

		// Same SSRF / secret-exfil safeguard as testPlexConnection.
		const normalise = (u: string) => u.replace(/\/+$/, '');
		const baseUrlMatchesStored =
			!!baseUrl && !!storedBaseUrl && normalise(baseUrl) === normalise(storedBaseUrl);
		const modelMatchesStored = model === storedModel;
		const apiKey = submittedKey || (baseUrlMatchesStored && modelMatchesStored ? storedKey : '');

		const result = await testOpenAIConnection(apiKey, baseUrl, model);
		if (!result.success) return fail(400, { error: result.error });
		return { success: true, message: result.message };
	},

	clearOpenaiKey: async () => {
		const apiConfig = await getApiConfigWithSources();
		if (apiConfig.openai.apiKey.isLocked) {
			return fail(400, {
				error: 'OpenAI API key is set via environment variable and cannot be cleared here'
			});
		}
		try {
			// clearApiConfigKey bumps API_CONFIG_VERSION in the same transaction so
			// a stale tab can't resurrect the cleared key through OCC.
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
			await clearApiConfigKey(AppSettingsKey.OPENAI_MODEL);
			return { success: true, message: 'OpenAI model cleared (will fall back to default)' };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to clear OpenAI model';
			return fail(500, { error: message });
		}
	}
});
