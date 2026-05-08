import { beforeEach, describe, expect, it } from 'bun:test';
import { env } from '$env/dynamic/private';
import {
	AppSettingsKey,
	getAppSetting,
	getAppSettingsUpdatedAt,
	getWrappedLogoMode,
	setAppSetting,
	USER_DEFAULTS_SETTINGS_KEYS,
	WrappedLogoMode
} from '$lib/server/admin/settings.service';
import { db } from '$lib/server/db/client';
import { appSettings } from '$lib/server/db/schema';
import { getGlobalAllowUserControl, getGlobalDefaultShareMode } from '$lib/server/sharing/service';
import { actions } from '../../../src/routes/admin/settings/+page.server';

type UpdateUserDefaultsAction = NonNullable<typeof actions.updateUserDefaults>;
type UpdateApiConfigAction = NonNullable<typeof actions.updateApiConfig>;
type ClearOpenaiModelAction = NonNullable<typeof actions.clearOpenaiModel>;
type UpdateTrustProxyAction = NonNullable<typeof actions.updateTrustProxy>;
type UpdateWrappedLogoModeAction = NonNullable<typeof actions.updateWrappedLogoMode>;

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
	const updateUserDefaults = actions.updateUserDefaults as UpdateUserDefaultsAction;
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
		const handler = actions.updateApiConfig as UpdateApiConfigAction;
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
		const handler = actions.clearOpenaiModel as ClearOpenaiModelAction;
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

	function createTrustProxyRequest(enabled: boolean, confirmRisk?: boolean): Request {
		const formData = new FormData();
		formData.set('enabled', enabled ? 'true' : 'false');
		if (confirmRisk) formData.set('confirmRisk', 'true');

		return new Request('http://localhost/admin/settings?/updateTrustProxy', {
			method: 'POST',
			body: formData
		});
	}

	async function runUpdateTrustProxy(request: Request) {
		const handler = actions.updateTrustProxy as UpdateTrustProxyAction;
		return handler({ request, locals: adminLocals } as Parameters<UpdateTrustProxyAction>[0]);
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

			const result = await runUpdateTrustProxy(createTrustProxyRequest(false));

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

	function createWrappedLogoModeRequest(logoMode: string): Request {
		const formData = new FormData();
		formData.set('logoMode', logoMode);

		return new Request('http://localhost/admin/settings?/updateWrappedLogoMode', {
			method: 'POST',
			body: formData
		});
	}

	async function runUpdateWrappedLogoMode(request: Request) {
		const handler = actions.updateWrappedLogoMode as UpdateWrappedLogoModeAction;
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
});
