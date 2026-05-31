import { beforeEach, describe, expect, it } from 'bun:test';
import { env } from '$env/dynamic/private';
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

	// The blank-URL guard (ISSUE-005) only fires when the Plex URL is NOT
	// env-locked. The test harness mocks PLEX_SERVER_URL/PLEX_TOKEN (so the field
	// is locked by default), so these tests clear those env vars to exercise the
	// unlocked DB-backed path, then restore them.
	const dynamicEnv = env as Record<string, string | undefined>;
	async function withUnlockedPlex(fn: () => Promise<void>): Promise<void> {
		const prevUrl = dynamicEnv.PLEX_SERVER_URL;
		const prevToken = dynamicEnv.PLEX_TOKEN;
		dynamicEnv.PLEX_SERVER_URL = '';
		dynamicEnv.PLEX_TOKEN = '';
		try {
			await fn();
		} finally {
			dynamicEnv.PLEX_SERVER_URL = prevUrl;
			dynamicEnv.PLEX_TOKEN = prevToken;
		}
	}

	it('rejects a present-but-blank Plex URL as 400 and leaves the stored row intact (ISSUE-005)', async () => {
		await withUnlockedPlex(async () => {
			// Seed a stored Plex URL so we can prove the blank submit does not clear it.
			await setAppSetting(AppSettingsKey.PLEX_SERVER_URL, 'http://plex.local:32400');
			expect((await getApiConfigWithSources()).plex.serverUrl.value).toBe(
				'http://plex.local:32400'
			);

			const result = await run(
				makeRequest('updateApiConfig', {
					plexServerUrl: '',
					apiConfigVersion: new Date(Date.now() + 60_000).toISOString()
				})
			);

			expect(result).toMatchObject({
				status: 400,
				data: { error: 'Plex server URL is required' }
			});
			// The stored row must be untouched — a blank submit must not delete it.
			expect((await getApiConfigWithSources()).plex.serverUrl.value).toBe(
				'http://plex.local:32400'
			);
		});
	});

	it('rejects a whitespace-only Plex URL as 400 (trimmed to blank) (ISSUE-005)', async () => {
		await withUnlockedPlex(async () => {
			await setAppSetting(AppSettingsKey.PLEX_SERVER_URL, 'http://plex.local:32400');

			const result = await run(
				makeRequest('updateApiConfig', {
					plexServerUrl: '   ',
					apiConfigVersion: new Date(Date.now() + 60_000).toISOString()
				})
			);

			expect(result).toMatchObject({
				status: 400,
				data: { error: 'Plex server URL is required' }
			});
			expect((await getApiConfigWithSources()).plex.serverUrl.value).toBe(
				'http://plex.local:32400'
			);
		});
	});

	it('does NOT 400 on a blank Plex URL when the field is ENV-locked', async () => {
		// With the harness's mocked PLEX_SERVER_URL env var, the field is locked;
		// a blank submit must NOT hit the required-field guard (the lock path owns
		// the value and setApiConfigAtomic ignores locked fields).
		const result = await run(
			makeRequest('updateApiConfig', {
				plexServerUrl: '',
				apiConfigVersion: new Date(Date.now() + 60_000).toISOString()
			})
		);
		expect(result).not.toMatchObject({ data: { error: 'Plex server URL is required' } });
	});

	it('does NOT trip the blank-URL guard when plexServerUrl is absent (OpenAI-only save)', async () => {
		await withUnlockedPlex(async () => {
			// An OpenAI-only panel save omits the Plex inputs entirely; the absent
			// field parses to `undefined` (not ''), so the required-URL guard is
			// skipped and the save succeeds without wiping the stored Plex URL.
			await setAppSetting(AppSettingsKey.PLEX_SERVER_URL, 'http://plex.local:32400');

			const formData = new FormData();
			formData.set('openaiModel', 'gpt-4o-mini');
			formData.set('apiConfigVersion', new Date(Date.now() + 60_000).toISOString());
			// plexServerUrl intentionally absent
			const request = new Request('http://localhost/admin/settings/connections?/updateApiConfig', {
				method: 'POST',
				body: formData
			});

			const result = await run(request);
			// Whatever the outcome, it must NOT be the blank-URL required-field 400.
			expect(result).not.toMatchObject({ data: { error: 'Plex server URL is required' } });
			// And the stored Plex URL is preserved.
			expect((await getApiConfigWithSources()).plex.serverUrl.value).toBe(
				'http://plex.local:32400'
			);
		});
	});

	it('rejects checkbox-style boolean for plexAllowInsecureLocalHttp', async () => {
		// Same protection as the privacy tab's FormBooleanSchema fix
		// (commit adefc25): ApiConfigSchema.plexAllowInsecureLocalHttp uses
		// z.enum(['true', 'false']).transform() so HTML checkbox 'on' fails
		// schema validation instead of being silently coerced to false.
		// Without this guard, accidentally wiring a checkbox to this field
		// would unconditionally write `false` regardless of the checkbox
		// state.
		const result = await run(
			makeRequest('updateApiConfig', {
				plexAllowInsecureLocalHttp: 'on',
				apiConfigVersion: new Date(Date.now() + 60_000).toISOString()
			})
		);
		expect(result).toMatchObject({ status: 400, data: { error: 'Invalid input' } });
	});

	// H5: bad openaiBaseUrl returns fieldErrors.openaiBaseUrl (not just a generic error)
	it('returns fieldErrors.openaiBaseUrl for an invalid base URL (H5)', async () => {
		const result = await run(
			makeRequest('updateApiConfig', {
				openaiBaseUrl: 'not-a-url',
				apiConfigVersion: new Date(Date.now() + 60_000).toISOString()
			})
		);
		expect(result).toMatchObject({
			status: 400,
			data: {
				error: 'Invalid input',
				fieldErrors: { openaiBaseUrl: ['Invalid URL format'] }
			}
		});
	});

	// A2: successful save returns a fresh apiConfigVersion
	it('returns a fresh apiConfigVersion on success (A2)', async () => {
		await withUnlockedPlex(async () => {
			// Seed a valid Plex URL so the save can succeed.
			await setAppSetting(AppSettingsKey.PLEX_SERVER_URL, 'https://plex.local:32400');

			const formData = new FormData();
			formData.set('openaiModel', 'gpt-4o-mini');
			formData.set('apiConfigVersion', new Date(Date.now() + 60_000).toISOString());
			const request = new Request('http://localhost/admin/settings/connections?/updateApiConfig', {
				method: 'POST',
				body: formData
			});

			const result = await run(request);
			// The result must be a success object (not a failure ActionResult).
			expect(result).toMatchObject({ success: true });
			// It must carry a fresh apiConfigVersion string.
			const version = (result as { apiConfigVersion?: string }).apiConfigVersion;
			expect(typeof version).toBe('string');
			expect(version!.length).toBeGreaterThan(0);
			// The returned version must be parseable as an ISO date.
			expect(Number.isNaN(Date.parse(version!))).toBe(false);
		});
	});

	// C2: submitting a value for a locked field yields the informational note
	it('includes locked-field note in success message when a locked field is submitted (C2)', async () => {
		// The test harness has PLEX_SERVER_URL locked via the mock env.
		// Submit plexServerUrl (the locked field) alongside a valid apiConfigVersion.
		// The action should succeed (setApiConfigAtomic ignores locked fields) and
		// include the informational note in the message.
		const result = await run(
			makeRequest('updateApiConfig', {
				plexServerUrl: 'https://plex.local:32400',
				apiConfigVersion: new Date(Date.now() + 60_000).toISOString()
			})
		);
		expect(result).toMatchObject({ success: true });
		const message = (result as { message?: string }).message ?? '';
		expect(message).toContain('Some fields are controlled by environment variables');
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
