import { beforeEach, describe, expect, it } from 'bun:test';
import { env } from '$env/dynamic/private';
import {
	AppSettingsKey,
	getAppSetting,
	getAppSettingsUpdatedAt,
	setAppSetting,
	USER_DEFAULTS_SETTINGS_KEYS
} from '$lib/server/admin/settings.service';
import { db } from '$lib/server/db/client';
import { appSettings } from '$lib/server/db/schema';
import { getGlobalAllowUserControl, getGlobalDefaultShareMode } from '$lib/server/sharing/service';
import { actions } from '../../../src/routes/admin/settings/+page.server';

type UpdateUserDefaultsAction = NonNullable<typeof actions.updateUserDefaults>;
type UpdateApiConfigAction = NonNullable<typeof actions.updateApiConfig>;
type ClearOpenaiModelAction = NonNullable<typeof actions.clearOpenaiModel>;

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
