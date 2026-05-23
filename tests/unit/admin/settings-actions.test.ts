import { beforeEach, describe, expect, it } from 'bun:test';
import { env } from '$env/dynamic/private';
import {
	AppSettingsKey,
	getAnonymizationMode,
	getAppSetting,
	getAppSettingsUpdatedAt,
	getWrappedLogoMode,
	SERVER_WRAPPED_SETTINGS_KEYS,
	setAppSetting,
	USER_DEFAULTS_SETTINGS_KEYS,
	WrappedLogoMode
} from '$lib/server/admin/settings.service';
import { db } from '$lib/server/db/client';
import { appSettings } from '$lib/server/db/schema';
import { getLogMaxCount, getLogRetentionDays, isDebugEnabled } from '$lib/server/logging';
import {
	getGlobalAllowUserControl,
	getGlobalDefaultShareMode,
	getServerWrappedShareMode
} from '$lib/server/sharing/service';
// Post-US-022 (cf958fa): the monolith /admin/settings/+page.server.ts UI was
// deleted, but its action handlers remain as orphans for legacy-URL POSTs
// (and originally for this test file). This file re-points to each nested
// route — `connections/security/appearance/privacy/system` — so the
// monolith action handlers can be deleted in a follow-up. The action
// contracts are byte-identical between monolith and nested-route copies
// (the nested route handlers were verbatim copies in commits 97152be,
// 853561f, a46279c, 3c32486, b9dc5ac, 220f6ad, fd526aa, e8ebcab); the
// Superforms-driven handlers in privacy + system return responses with
// an extra `form` field that `toMatchObject` ignores by design.
import { actions as appearanceActions } from '../../../src/routes/admin/settings/appearance/+page.server';
import { actions as connectionsActions } from '../../../src/routes/admin/settings/connections/+page.server';
import { actions as privacyActions } from '../../../src/routes/admin/settings/privacy/+page.server';
import { actions as securityActions } from '../../../src/routes/admin/settings/security/+page.server';
import { actions as systemActions } from '../../../src/routes/admin/settings/system/+page.server';

type UpdateUserDefaultsAction = NonNullable<typeof privacyActions.updateUserDefaults>;
type UpdateApiConfigAction = NonNullable<typeof connectionsActions.updateApiConfig>;
type ClearOpenaiModelAction = NonNullable<typeof connectionsActions.clearOpenaiModel>;
type UpdateTrustProxyAction = NonNullable<typeof securityActions.updateTrustProxy>;
type UpdateWrappedLogoModeAction = NonNullable<typeof appearanceActions.updateWrappedLogoMode>;
type UpdateServerWrappedSettingsAction = NonNullable<
	typeof privacyActions.updateServerWrappedSettings
>;
type UpdateLogSettingsAction = NonNullable<typeof systemActions.updateLogSettings>;

const adminLocals = {
	user: { id: 1, plexId: 1, username: 'admin', isAdmin: true }
} as unknown as App.Locals;

function createUserDefaultsRequest(overrides: Record<string, string> = {}): Request {
	const formData = new FormData();
	formData.set('defaultShareMode', 'private-oauth');
	formData.set('allowUserControl', 'false');
	// Use a far-past timestamp so OCC succeeds when the keys don't yet exist
	// in the DB (no rows → maxMs is 0). Empty/missing is now rejected as 409.
	formData.set('settingsVersion', new Date(0).toISOString());

	for (const [key, value] of Object.entries(overrides)) {
		formData.set(key, value);
	}

	return new Request('http://localhost/admin/settings?/updateUserDefaults', {
		method: 'POST',
		body: formData
	});
}

async function runUpdateUserDefaults(request: Request) {
	const updateUserDefaults = privacyActions.updateUserDefaults as UpdateUserDefaultsAction;
	return updateUserDefaults({
		request,
		locals: adminLocals
	} as Parameters<UpdateUserDefaultsAction>[0]);
}

describe('admin settings actions', () => {
	beforeEach(async () => {
		await db.delete(appSettings);
	});

	it('persists explicit false and true allowUserControl values', async () => {
		await expect(runUpdateUserDefaults(createUserDefaultsRequest())).resolves.toMatchObject({
			success: true
		});
		expect(await getGlobalDefaultShareMode()).toBe('private-oauth');
		expect(await getGlobalAllowUserControl()).toBe(false);

		const updatedAt = await getAppSettingsUpdatedAt(USER_DEFAULTS_SETTINGS_KEYS);
		expect(updatedAt).not.toBeNull();

		await expect(
			runUpdateUserDefaults(
				createUserDefaultsRequest({
					defaultShareMode: 'public',
					allowUserControl: 'true',
					settingsVersion: (updatedAt as Date).toISOString()
				})
			)
		).resolves.toMatchObject({ success: true });

		expect(await getGlobalDefaultShareMode()).toBe('public');
		expect(await getGlobalAllowUserControl()).toBe(true);
	});

	it('rejects checkbox-style boolean values instead of silently coercing them', async () => {
		const result = await runUpdateUserDefaults(
			createUserDefaultsRequest({ allowUserControl: 'on' })
		);

		expect(result).toMatchObject({
			status: 400,
			data: {
				error: 'Invalid input'
			}
		});
	});

	it('rejects updateUserDefaults with blank settingsVersion as 409 conflict', async () => {
		const result = await runUpdateUserDefaults(createUserDefaultsRequest({ settingsVersion: '' }));

		expect(result).toMatchObject({
			status: 409,
			data: {
				conflict: true,
				error: 'Settings changed in another tab. Please reload.'
			}
		});
	});
});

describe('admin updateApiConfig schema hardening', () => {
	beforeEach(async () => {
		await db.delete(appSettings);
	});

	function createApiConfigRequest(overrides: Record<string, string> = {}): Request {
		const formData = new FormData();
		formData.set('apiConfigVersion', new Date(0).toISOString());
		for (const [k, v] of Object.entries(overrides)) {
			formData.set(k, v);
		}
		return new Request('http://localhost/admin/settings?/updateApiConfig', {
			method: 'POST',
			body: formData
		});
	}

	async function runUpdateApiConfig(request: Request) {
		const handler = connectionsActions.updateApiConfig as UpdateApiConfigAction;
		return handler({ request, locals: adminLocals } as Parameters<UpdateApiConfigAction>[0]);
	}

	it('rejects blank openaiModel as 400 with fieldErrors.openaiModel', async () => {
		const result = await runUpdateApiConfig(createApiConfigRequest({ openaiModel: '' }));
		expect(result).toMatchObject({
			status: 400,
			data: {
				error: 'Invalid input',
				fieldErrors: { openaiModel: ['Model name is required'] }
			}
		});
	});

	it('rejects whitespace-only openaiModel as 400 with fieldErrors.openaiModel', async () => {
		const result = await runUpdateApiConfig(createApiConfigRequest({ openaiModel: '   ' }));
		expect(result).toMatchObject({
			status: 400,
			data: {
				fieldErrors: { openaiModel: ['Model name is required'] }
			}
		});
	});

	it('promotes blank apiConfigVersion to 409 conflict', async () => {
		const formData = new FormData();
		formData.set('apiConfigVersion', '');
		const request = new Request('http://localhost/admin/settings?/updateApiConfig', {
			method: 'POST',
			body: formData
		});
		const result = await runUpdateApiConfig(request);
		expect(result).toMatchObject({
			status: 409,
			data: { conflict: true, error: 'Settings changed in another tab. Reload and try again.' }
		});
	});

	it('promotes missing apiConfigVersion to 409 conflict on a fresh DB', async () => {
		const formData = new FormData();
		// no apiConfigVersion at all
		const request = new Request('http://localhost/admin/settings?/updateApiConfig', {
			method: 'POST',
			body: formData
		});
		const result = await runUpdateApiConfig(request);
		expect(result).toMatchObject({
			status: 409,
			data: { conflict: true }
		});
	});

	it.each([
		['http://api.openai.example/v1', 'OpenAI base URL must use HTTPS.'],
		[
			'https://user:pass@api.openai.example/v1',
			'Configured base URLs must not include credentials.'
		],
		[
			'https://api.openai.example/v1?token=abc',
			'Configured base URLs must not include query strings or fragments.'
		],
		[
			'https://api.openai.example/v1#models',
			'Configured base URLs must not include query strings or fragments.'
		]
	])('rejects unsafe OpenAI base URL %s with no API key submitted', async (openaiBaseUrl, error) => {
		const result = await runUpdateApiConfig(createApiConfigRequest({ openaiBaseUrl }));

		expect(result).toMatchObject({
			status: 400,
			data: { error }
		});
		expect(await getAppSetting(AppSettingsKey.OPENAI_BASE_URL)).toBeNull();
	});

	it('rejects unchecked local HTTP Plex URL instead of relying on stored opt-in', async () => {
		const dynamicEnv = env as Record<string, string | undefined>;
		const previousPlexServerUrl = dynamicEnv.PLEX_SERVER_URL;
		const previousAllowInsecure = dynamicEnv.PLEX_ALLOW_INSECURE_LOCAL_HTTP;
		dynamicEnv.PLEX_SERVER_URL = '';
		dynamicEnv.PLEX_ALLOW_INSECURE_LOCAL_HTTP = undefined;

		try {
			await setAppSetting(AppSettingsKey.PLEX_SERVER_URL, 'http://192.168.1.10:32400');
			await setAppSetting(AppSettingsKey.PLEX_ALLOW_INSECURE_LOCAL_HTTP, 'true');

			const result = await runUpdateApiConfig(
				createApiConfigRequest({
					plexServerUrl: 'http://192.168.1.10:32400',
					apiConfigVersion: new Date(Date.now() + 60_000).toISOString()
				})
			);

			expect(result).toMatchObject({
				status: 400,
				data: {
					error: 'HTTP Plex URLs require a local/private host and explicit local HTTP opt-in.'
				}
			});
			expect(await getAppSetting(AppSettingsKey.PLEX_ALLOW_INSECURE_LOCAL_HTTP)).toBe('true');
		} finally {
			dynamicEnv.PLEX_SERVER_URL = previousPlexServerUrl;
			dynamicEnv.PLEX_ALLOW_INSECURE_LOCAL_HTTP = previousAllowInsecure;
		}
	});
});

describe('admin clearOpenaiModel action', () => {
	beforeEach(async () => {
		await db.delete(appSettings);
	});

	async function runClearOpenaiModel() {
		const handler = connectionsActions.clearOpenaiModel as ClearOpenaiModelAction;
		const request = new Request('http://localhost/admin/settings?/clearOpenaiModel', {
			method: 'POST',
			body: new FormData()
		});
		return handler({ request, locals: adminLocals } as Parameters<ClearOpenaiModelAction>[0]);
	}

	it('clears OPENAI_MODEL when set in DB', async () => {
		await setAppSetting(AppSettingsKey.OPENAI_MODEL, 'gpt-test-model');
		expect(await getAppSetting(AppSettingsKey.OPENAI_MODEL)).toBe('gpt-test-model');

		const result = await runClearOpenaiModel();
		expect(result).toMatchObject({
			success: true,
			message: 'OpenAI model cleared (will fall back to default)'
		});
		expect(await getAppSetting(AppSettingsKey.OPENAI_MODEL)).toBeNull();
	});

	it('returns 400 when model is locked via env', async () => {
		// $env/dynamic/private is mock.module()-ed at setup time and the underlying
		// `env` object reference is shared across importers — mutate it in place,
		// then restore. Replacing the factory via mock.module() does not rebind the
		// live ESM import already held by settings.service.ts.
		const dynamicEnv = env as Record<string, string | undefined>;
		const previous = dynamicEnv.OPENAI_MODEL;
		dynamicEnv.OPENAI_MODEL = 'env-locked-model';
		try {
			const result = await runClearOpenaiModel();
			expect(result).toMatchObject({
				status: 400,
				data: {
					error: 'OpenAI model is set via environment variable and cannot be cleared here'
				}
			});
		} finally {
			if (previous === undefined) delete dynamicEnv.OPENAI_MODEL;
			else dynamicEnv.OPENAI_MODEL = previous;
		}
	});
});

describe('admin updateTrustProxy action', () => {
	let previousTrustProxyEnv: string | undefined;

	beforeEach(async () => {
		await db.delete(appSettings);
		const dynamicEnv = env as Record<string, string | undefined>;
		previousTrustProxyEnv = dynamicEnv.TRUST_PROXY;
		delete dynamicEnv.TRUST_PROXY;
	});

	function restoreTrustProxyEnv() {
		const dynamicEnv = env as Record<string, string | undefined>;
		if (previousTrustProxyEnv === undefined) delete dynamicEnv.TRUST_PROXY;
		else dynamicEnv.TRUST_PROXY = previousTrustProxyEnv;
	}

	// Match the diagnostic's "enable" recommendation shape: the raw app URL is
	// internal, the forwarded proto+host pair is usable and matches the browser
	// origin. Without this the new diagnostic gate in updateTrustProxy rejects
	// every enable attempt regardless of confirmRisk.
	const TRUST_PROXY_BROWSER_ORIGIN = 'https://obzorarr.example.com';
	const TRUST_PROXY_FORWARDED_HOST = 'obzorarr.example.com';
	const TRUST_PROXY_APP_URL = 'http://internal.local/admin/settings?/updateTrustProxy';

	function createTrustProxyRequest(
		enabled: boolean,
		confirmRisk?: boolean,
		settingsVersion: string = new Date(0).toISOString()
	): Request {
		const formData = new FormData();
		formData.set('enabled', enabled ? 'true' : 'false');
		if (confirmRisk) formData.set('confirmRisk', 'true');
		// Far-past timestamp wins OCC for the no-rows-yet case; explicit override
		// available for the stale-version test.
		formData.set('settingsVersion', settingsVersion);
		formData.set('browserOrigin', TRUST_PROXY_BROWSER_ORIGIN);

		return new Request(TRUST_PROXY_APP_URL, {
			method: 'POST',
			body: formData,
			headers: {
				'x-forwarded-proto': 'https',
				'x-forwarded-host': TRUST_PROXY_FORWARDED_HOST
			}
		});
	}

	async function runUpdateTrustProxy(request: Request) {
		const handler = securityActions.updateTrustProxy as UpdateTrustProxyAction;
		return handler({
			request,
			url: new URL(TRUST_PROXY_APP_URL),
			getClientAddress: () => '203.0.113.1',
			locals: adminLocals
		} as Parameters<UpdateTrustProxyAction>[0]);
	}

	it('rejects enabling TRUST_PROXY without explicit risk confirmation', async () => {
		try {
			const result = await runUpdateTrustProxy(createTrustProxyRequest(true));

			expect(result).toMatchObject({
				status: 400,
				data: {
					error: 'Confirm the reverse-proxy header trust risk before enabling TRUST_PROXY.'
				}
			});
			expect(await getAppSetting(AppSettingsKey.TRUST_PROXY)).toBeNull();
		} finally {
			restoreTrustProxyEnv();
		}
	});

	it('rejects malformed risk confirmation with a specific validation message', async () => {
		try {
			const formData = new FormData();
			formData.set('enabled', 'true');
			formData.set('confirmRisk', 'false');
			formData.set('settingsVersion', new Date(0).toISOString());

			const result = await runUpdateTrustProxy(
				new Request('http://localhost/admin/settings?/updateTrustProxy', {
					method: 'POST',
					body: formData
				})
			);

			expect(result).toMatchObject({
				status: 400,
				data: {
					error:
						'Invalid input: enabled must be "true" or "false"; confirmRisk must be "true" when provided'
				}
			});
			expect(await getAppSetting(AppSettingsKey.TRUST_PROXY)).toBeNull();
		} finally {
			restoreTrustProxyEnv();
		}
	});

	it('rejects updateTrustProxy with blank settingsVersion as 409 conflict', async () => {
		try {
			const result = await runUpdateTrustProxy(createTrustProxyRequest(true, true, ''));
			expect(result).toMatchObject({
				status: 409,
				data: {
					conflict: true,
					error: 'Settings changed in another tab. Please reload.'
				}
			});
			expect(await getAppSetting(AppSettingsKey.TRUST_PROXY)).toBeNull();
		} finally {
			restoreTrustProxyEnv();
		}
	});

	it('rejects updateTrustProxy with stale settingsVersion as 409 conflict', async () => {
		try {
			// First write succeeds + advances the row's updatedAt.
			await runUpdateTrustProxy(createTrustProxyRequest(true, true));
			expect(await getAppSetting(AppSettingsKey.TRUST_PROXY)).toBe('true');
			// Stale tab tries to disable using the original epoch timestamp.
			const result = await runUpdateTrustProxy(
				createTrustProxyRequest(false, undefined, new Date(0).toISOString())
			);
			expect(result).toMatchObject({
				status: 409,
				data: { conflict: true }
			});
			// First write's value still in place — stale tab did not flip it.
			expect(await getAppSetting(AppSettingsKey.TRUST_PROXY)).toBe('true');
		} finally {
			restoreTrustProxyEnv();
		}
	});

	it('persists trust_proxy=true when enabling with risk confirmation', async () => {
		try {
			const result = await runUpdateTrustProxy(createTrustProxyRequest(true, true));

			expect(result).toMatchObject({
				success: true,
				message: 'Reverse-proxy header trust enabled.'
			});
			expect(await getAppSetting(AppSettingsKey.TRUST_PROXY)).toBe('true');
		} finally {
			restoreTrustProxyEnv();
		}
	});

	it('allows disabling TRUST_PROXY without risk confirmation', async () => {
		try {
			await setAppSetting(AppSettingsKey.TRUST_PROXY, 'true');

			// setAppSetting just wrote the row at ~Date.now(); use a future timestamp
			// so the inline-OCC check sees the submitted version as fresh-enough.
			const result = await runUpdateTrustProxy(
				createTrustProxyRequest(false, undefined, new Date(Date.now() + 60_000).toISOString())
			);

			expect(result).toMatchObject({
				success: true,
				message: 'Reverse-proxy header trust disabled.'
			});
			expect(await getAppSetting(AppSettingsKey.TRUST_PROXY)).toBe('false');
		} finally {
			restoreTrustProxyEnv();
		}
	});
});

describe('admin updateWrappedLogoMode action', () => {
	beforeEach(async () => {
		await db.delete(appSettings);
	});

	function createWrappedLogoModeRequest(
		logoMode?: string,
		settingsVersion: string = new Date(0).toISOString()
	): Request {
		const formData = new FormData();
		if (logoMode !== undefined) formData.set('logoMode', logoMode);
		// External-OCC enum action: defaults to epoch (wins for no-rows-yet);
		// tests that pre-seed the row must override.
		formData.set('settingsVersion', settingsVersion);

		return new Request('http://localhost/admin/settings?/updateWrappedLogoMode', {
			method: 'POST',
			body: formData
		});
	}

	async function runUpdateWrappedLogoMode(request: Request) {
		const handler = appearanceActions.updateWrappedLogoMode as UpdateWrappedLogoModeAction;
		return handler({ request, locals: adminLocals } as Parameters<UpdateWrappedLogoModeAction>[0]);
	}

	for (const logoMode of [
		WrappedLogoMode.ALWAYS_SHOW,
		WrappedLogoMode.ALWAYS_HIDE,
		WrappedLogoMode.USER_CHOICE
	]) {
		it(`persists logo mode ${logoMode}`, async () => {
			await expect(
				runUpdateWrappedLogoMode(createWrappedLogoModeRequest(logoMode))
			).resolves.toMatchObject({
				success: true,
				message: 'Logo visibility mode updated'
			});

			expect(await getWrappedLogoMode()).toBe(logoMode);
		});
	}

	it('rejects invalid logo mode without persisting a change', async () => {
		await setAppSetting(AppSettingsKey.WRAPPED_LOGO_MODE, WrappedLogoMode.ALWAYS_HIDE);

		// Pre-seed bumps updatedAt to ~Date.now(); pass a future timestamp so the
		// external-OCC check sees the version as fresh-enough and the test
		// exercises the schema validation rather than 409.
		const futureVersion = new Date(Date.now() + 60_000).toISOString();
		const result = await runUpdateWrappedLogoMode(
			createWrappedLogoModeRequest('invalid', futureVersion)
		);

		expect(result).toMatchObject({
			status: 400,
			data: {
				error: 'Invalid logo mode'
			}
		});
		expect(await getWrappedLogoMode()).toBe(WrappedLogoMode.ALWAYS_HIDE);
	});

	it('rejects missing logo mode without persisting a change', async () => {
		await setAppSetting(AppSettingsKey.WRAPPED_LOGO_MODE, WrappedLogoMode.ALWAYS_HIDE);

		const futureVersion = new Date(Date.now() + 60_000).toISOString();
		const result = await runUpdateWrappedLogoMode(
			createWrappedLogoModeRequest(undefined, futureVersion)
		);

		expect(result).toMatchObject({
			status: 400,
			data: {
				error: 'Invalid logo mode'
			}
		});
		expect(await getWrappedLogoMode()).toBe(WrappedLogoMode.ALWAYS_HIDE);
	});

	it('rejects updateWrappedLogoMode with blank settingsVersion as 409 (__OCC_CONFLICT__)', async () => {
		// Pre-seed to ALWAYS_HIDE so the assertion below distinguishes "OCC blocked
		// the write" from "default value happens to match".
		await setAppSetting(AppSettingsKey.WRAPPED_LOGO_MODE, WrappedLogoMode.ALWAYS_HIDE);

		const result = await runUpdateWrappedLogoMode(
			createWrappedLogoModeRequest(WrappedLogoMode.ALWAYS_SHOW, '')
		);
		expect(result).toMatchObject({
			status: 409,
			data: {
				error: '__OCC_CONFLICT__'
			}
		});
		// Conflict response includes the current version so the client can refresh.
		expect(typeof (result as { data: { settingsVersion: unknown } }).data.settingsVersion).toBe(
			'string'
		);
		// Row left intact — OCC blocked the write before any service call.
		expect(await getWrappedLogoMode()).toBe(WrappedLogoMode.ALWAYS_HIDE);
	});

	it('rejects updateWrappedLogoMode with stale settingsVersion as 409', async () => {
		// First write succeeds and advances updatedAt.
		await runUpdateWrappedLogoMode(createWrappedLogoModeRequest(WrappedLogoMode.ALWAYS_SHOW));
		expect(await getWrappedLogoMode()).toBe(WrappedLogoMode.ALWAYS_SHOW);

		// Stale tab tries to flip back using the epoch timestamp.
		const result = await runUpdateWrappedLogoMode(
			createWrappedLogoModeRequest(WrappedLogoMode.ALWAYS_HIDE, new Date(0).toISOString())
		);
		expect(result).toMatchObject({
			status: 409,
			data: { error: '__OCC_CONFLICT__' }
		});
		// First write's value still in place.
		expect(await getWrappedLogoMode()).toBe(WrappedLogoMode.ALWAYS_SHOW);
	});
});

// Round-trip persistence for the Server-wide Wrapped privacy form.
// Mirrors the dogfood ISSUE-002 repro: change anonymizationMode + serverWrappedShareMode,
// save, then read back through the same getters the load function uses.
describe('admin updateServerWrappedSettings action — round-trip', () => {
	beforeEach(async () => {
		await db.delete(appSettings);
	});

	function createRequest(overrides: Record<string, string> = {}): Request {
		const formData = new FormData();
		formData.set('anonymizationMode', 'anonymous');
		formData.set('serverWrappedShareMode', 'private-oauth');
		formData.set('settingsVersion', new Date(0).toISOString());
		for (const [k, v] of Object.entries(overrides)) formData.set(k, v);
		return new Request('http://localhost/admin/settings?/updateServerWrappedSettings', {
			method: 'POST',
			body: formData
		});
	}

	async function run(request: Request) {
		const handler = privacyActions.updateServerWrappedSettings as UpdateServerWrappedSettingsAction;
		return handler({
			request,
			locals: adminLocals
		} as Parameters<UpdateServerWrappedSettingsAction>[0]);
	}

	it('persists both anonymizationMode and serverWrappedShareMode and exposes them via load-time getters', async () => {
		await expect(run(createRequest())).resolves.toMatchObject({ success: true });
		expect(await getAnonymizationMode()).toBe('anonymous');
		expect(await getServerWrappedShareMode()).toBe('private-oauth');
	});

	it('allows a follow-up save with the bumped settingsVersion (no spurious 409)', async () => {
		await expect(run(createRequest())).resolves.toMatchObject({ success: true });
		const updatedAt = await getAppSettingsUpdatedAt(SERVER_WRAPPED_SETTINGS_KEYS);
		expect(updatedAt).not.toBeNull();

		await expect(
			run(
				createRequest({
					anonymizationMode: 'hybrid',
					serverWrappedShareMode: 'public',
					settingsVersion: (updatedAt as Date).toISOString()
				})
			)
		).resolves.toMatchObject({ success: true });
		expect(await getAnonymizationMode()).toBe('hybrid');
		expect(await getServerWrappedShareMode()).toBe('public');
	});

	it('rejects a stale settingsVersion as 409 without overwriting current values', async () => {
		await expect(run(createRequest())).resolves.toMatchObject({ success: true });
		// Submit again with the original epoch — now stale.
		const result = await run(createRequest({ anonymizationMode: 'real' }));
		expect(result).toMatchObject({ status: 409 });
		expect(await getAnonymizationMode()).toBe('anonymous');
	});

	it('rejects private-link for serverWrappedShareMode and surfaces fieldErrors', async () => {
		const result = await run(createRequest({ serverWrappedShareMode: 'private-link' }));
		expect(result).toMatchObject({ status: 400, data: { error: 'Invalid input' } });
		expect(await getServerWrappedShareMode()).toBe('public');
	});
});

// Round-trip persistence for the System tab Logging form (ISSUE-002 system section).
describe('admin updateLogSettings action — round-trip', () => {
	beforeEach(async () => {
		await db.delete(appSettings);
	});

	function createRequest(overrides: Record<string, string> = {}): Request {
		const formData = new FormData();
		formData.set('retentionDays', '14');
		formData.set('maxCount', '2000');
		formData.set('debugEnabled', 'true');
		// Use a far-past timestamp so OCC succeeds when the keys don't yet exist
		// in the DB (no rows → maxMs is 0). Empty/missing is rejected as 409.
		formData.set('settingsVersion', new Date(0).toISOString());
		for (const [k, v] of Object.entries(overrides)) formData.set(k, v);
		return new Request('http://localhost/admin/settings?/updateLogSettings', {
			method: 'POST',
			body: formData
		});
	}

	async function run(request: Request) {
		const handler = systemActions.updateLogSettings as UpdateLogSettingsAction;
		return handler({ request, locals: adminLocals } as Parameters<UpdateLogSettingsAction>[0]);
	}

	it('persists retentionDays, maxCount, and debugEnabled together', async () => {
		await expect(run(createRequest())).resolves.toMatchObject({ success: true });
		expect(await getLogRetentionDays()).toBe(14);
		expect(await getLogMaxCount()).toBe(2000);
		expect(await isDebugEnabled()).toBe(true);
	});

	it('rejects retentionDays out of range without persisting any field', async () => {
		const result = await run(createRequest({ retentionDays: '999' }));
		expect(result).toMatchObject({ status: 400 });
		// retention + maxCount + debug stay at their defaults — confirm no partial write.
		expect(await getLogRetentionDays()).toBe(7);
		expect(await getLogMaxCount()).toBe(50000);
		expect(await isDebugEnabled()).toBe(false);
	});

	it('rejects maxCount below floor without persisting any field', async () => {
		const result = await run(createRequest({ maxCount: '500' }));
		expect(result).toMatchObject({ status: 400 });
		// retention + maxCount + debug stay at their defaults — confirm no partial write.
		expect(await getLogRetentionDays()).toBe(7);
		expect(await getLogMaxCount()).toBe(50000);
		expect(await isDebugEnabled()).toBe(false);
	});

	it('rejects updateLogSettings with blank settingsVersion as 409 conflict', async () => {
		const result = await run(createRequest({ settingsVersion: '' }));
		expect(result).toMatchObject({
			status: 409,
			data: {
				conflict: true,
				error: 'Settings changed in another tab. Please reload.'
			}
		});
		expect(await getLogRetentionDays()).toBe(7);
		expect(await getLogMaxCount()).toBe(50000);
		expect(await isDebugEnabled()).toBe(false);
	});

	it('rejects updateLogSettings with stale settingsVersion as 409 conflict', async () => {
		// First write succeeds and advances the row's updatedAt.
		await expect(run(createRequest())).resolves.toMatchObject({ success: true });
		// Second write uses the original (now-stale) epoch timestamp.
		const result = await run(
			createRequest({
				settingsVersion: new Date(0).toISOString(),
				retentionDays: '21'
			})
		);
		expect(result).toMatchObject({
			status: 409,
			data: { conflict: true }
		});
		// First write's values still in place — stale tab did not clobber them.
		expect(await getLogRetentionDays()).toBe(14);
		expect(await getLogMaxCount()).toBe(2000);
	});

	it('allows a follow-up save with the bumped settingsVersion (no spurious 409)', async () => {
		await expect(run(createRequest())).resolves.toMatchObject({ success: true });
		// Re-read the freshly bumped settingsVersion (using a future ISO works because
		// the OCC check compares submitted >= current).
		const result = await run(
			createRequest({
				settingsVersion: new Date(Date.now() + 60_000).toISOString(),
				retentionDays: '21'
			})
		);
		expect(result).toMatchObject({ success: true });
		expect(await getLogRetentionDays()).toBe(21);
	});
});
