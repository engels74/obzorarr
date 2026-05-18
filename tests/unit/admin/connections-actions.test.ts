import { beforeEach, describe, expect, it } from 'bun:test';
import {
	AppSettingsKey,
	getApiConfigWithSources,
	setAppSetting
} from '$lib/server/admin/settings.service';
import { db } from '$lib/server/db/client';
import { appSettings } from '$lib/server/db/schema';
import { actions } from '../../../src/routes/admin/settings/connections/+page.server';

type UpdateApiConfigAction = NonNullable<typeof actions.updateApiConfig>;
type ClearOpenaiKeyAction = NonNullable<typeof actions.clearOpenaiKey>;
type ClearOpenaiModelAction = NonNullable<typeof actions.clearOpenaiModel>;

const adminLocals = {
	user: { id: 1, plexId: 1, username: 'admin', isAdmin: true }
} as unknown as App.Locals;

function makeRequest(action: string, fields: Record<string, string>): Request {
	const formData = new FormData();
	for (const [k, v] of Object.entries(fields)) formData.set(k, v);
	return new Request(`http://localhost/admin/settings/connections?/${action}`, {
		method: 'POST',
		body: formData
	});
}

// The deeper "saving the Plex panel does not wipe OpenAI fields" semantics live
// in setApiConfigAtomic and are tested in tests/unit/admin/settings.service.test.ts
// (~ApiConfig integration). The tests here focus on the action-handler shapes
// (OCC + schema validation + the clear actions) that are specific to the
// nested-route +page.server.ts.

describe('connections nested route — updateApiConfig (OCC + schema)', () => {
	beforeEach(async () => {
		await db.delete(appSettings);
	});

	async function run(request: Request) {
		const handler = actions.updateApiConfig as UpdateApiConfigAction;
		return handler({ request, locals: adminLocals } as Parameters<UpdateApiConfigAction>[0]);
	}

	it('rejects blank apiConfigVersion as 409 conflict', async () => {
		const result = await run(
			makeRequest('updateApiConfig', {
				plexServerUrl: 'http://plex.local:32400',
				plexToken: 'token',
				apiConfigVersion: ''
			})
		);
		expect(result).toMatchObject({
			status: 409,
			data: {
				conflict: true,
				error: 'Settings changed in another tab. Reload and try again.'
			}
		});
	});

	it('rejects missing apiConfigVersion (field absent) as 409 conflict', async () => {
		const formData = new FormData();
		formData.set('plexServerUrl', 'http://plex.local:32400');
		formData.set('plexToken', 'token');
		// apiConfigVersion intentionally absent
		const request = new Request('http://localhost/admin/settings/connections?/updateApiConfig', {
			method: 'POST',
			body: formData
		});
		const result = await run(request);
		expect(result).toMatchObject({ status: 409, data: { conflict: true } });
	});

	it('rejects blank openaiModel as 400 with fieldErrors.openaiModel', async () => {
		const result = await run(
			makeRequest('updateApiConfig', {
				openaiModel: '',
				apiConfigVersion: new Date(Date.now() + 60_000).toISOString()
			})
		);
		expect(result).toMatchObject({
			status: 400,
			data: {
				error: 'Invalid input',
				fieldErrors: { openaiModel: ['Model name is required'] }
			}
		});
	});

	it('rejects whitespace-only openaiModel as 400', async () => {
		const result = await run(
			makeRequest('updateApiConfig', {
				openaiModel: '   ',
				apiConfigVersion: new Date(Date.now() + 60_000).toISOString()
			})
		);
		expect(result).toMatchObject({
			status: 400,
			data: {
				error: 'Invalid input',
				fieldErrors: { openaiModel: ['Model name is required'] }
			}
		});
	});

	it('rejects malformed Plex URL as 400 (Zod URL validator)', async () => {
		const result = await run(
			makeRequest('updateApiConfig', {
				plexServerUrl: 'not a url',
				apiConfigVersion: new Date(Date.now() + 60_000).toISOString()
			})
		);
		expect(result).toMatchObject({ status: 400 });
	});
});

describe('connections nested route — clearOpenaiKey', () => {
	beforeEach(async () => {
		await db.delete(appSettings);
	});

	async function run() {
		const handler = actions.clearOpenaiKey as ClearOpenaiKeyAction;
		return handler({
			request: new Request('http://localhost/admin/settings/connections?/clearOpenaiKey', {
				method: 'POST',
				body: new FormData()
			}),
			locals: adminLocals
		} as Parameters<ClearOpenaiKeyAction>[0]);
	}

	it('clears the stored OpenAI API key', async () => {
		await setAppSetting(AppSettingsKey.OPENAI_API_KEY, 'sk-stored');
		expect((await getApiConfigWithSources()).openai.apiKey.value).toBe('sk-stored');

		const result = await run();
		expect(result).toMatchObject({ success: true, message: 'OpenAI API key cleared' });
		expect((await getApiConfigWithSources()).openai.apiKey.value).toBe('');
	});

	it('is idempotent when no key is stored', async () => {
		const result = await run();
		expect(result).toMatchObject({ success: true });
	});
});

describe('connections nested route — clearOpenaiModel', () => {
	beforeEach(async () => {
		await db.delete(appSettings);
	});

	async function run() {
		const handler = actions.clearOpenaiModel as ClearOpenaiModelAction;
		return handler({
			request: new Request('http://localhost/admin/settings/connections?/clearOpenaiModel', {
				method: 'POST',
				body: new FormData()
			}),
			locals: adminLocals
		} as Parameters<ClearOpenaiModelAction>[0]);
	}

	it('reports the cleared message even when no model was stored (idempotent)', async () => {
		const result = await run();
		expect(result).toMatchObject({
			success: true,
			message: 'OpenAI model cleared (will fall back to default)'
		});
	});

	it('clears a stored OpenAI model setting (falls back to the service default)', async () => {
		await setAppSetting(AppSettingsKey.OPENAI_MODEL, 'gpt-4o');
		expect((await getApiConfigWithSources()).openai.model.value).toBe('gpt-4o');

		const result = await run();
		expect(result).toMatchObject({ success: true });
		// clearApiConfigKey removes the DB row + bumps API_CONFIG_VERSION;
		// resolveConfigValue then returns the service's hardcoded default
		// model ('gpt-5-mini' per getApiConfigWithSources). The user's
		// custom 'gpt-4o' is no longer in effect.
		const after = (await getApiConfigWithSources()).openai.model.value;
		expect(after).not.toBe('gpt-4o');
		expect(after.length).toBeGreaterThan(0);
		expect(after).toMatch(/^gpt-/);
	});
});
