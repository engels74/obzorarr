import { describe, expect, it } from 'bun:test';
import { AppSettingsKey, setAppSetting } from '$lib/server/admin/settings.service';
import { db } from '$lib/server/db/client';
import { appSettings } from '$lib/server/db/schema';
import { csrfHandle } from '$lib/server/security/csrf-handle';

// DF-010 — CSRF 403 body must not leak internal detail to the client.
// DF-011/021 — postMessage AUTH_COMPLETE handler assessment (source-level).

function makeEvent(options: { method: string; url: string; origin?: string }) {
	const headers = new Headers();
	if (options.origin !== undefined) {
		headers.set('origin', options.origin);
	}
	const request = new Request(options.url, { method: options.method, headers });
	return {
		request,
		url: new URL(options.url),
		route: { id: null }
	} as unknown as Parameters<typeof csrfHandle>[0]['event'];
}

async function invoke(event: ReturnType<typeof makeEvent>): Promise<Response> {
	const sentinel = new Response('resolved', { status: 200 });
	const result = await csrfHandle({
		event,
		resolve: async () => sentinel
	} as unknown as Parameters<typeof csrfHandle>[0]);
	return result as Response;
}

describe('DF-010 — CSRF 403 body is generic (no internal detail leaked)', () => {
	it('missing-origin branch returns {"error":"Forbidden"} body', async () => {
		await db.delete(appSettings);
		await setAppSetting(AppSettingsKey.CSRF_ORIGIN, 'https://example.com');

		const event = makeEvent({
			method: 'POST',
			url: 'https://example.com/admin/settings'
			// No origin header → missing-origin branch
		});

		const response = await invoke(event);
		expect(response.status).toBe(403);

		const body = (await response.json()) as Record<string, unknown>;
		expect(body).toEqual({ error: 'Forbidden' });
		// Must NOT contain any internal detail
		expect(JSON.stringify(body)).not.toContain('missing origin');
		expect(JSON.stringify(body)).not.toContain('CSRF check');
	});

	it('origin-mismatch branch returns {"error":"Forbidden"} body', async () => {
		await db.delete(appSettings);
		await setAppSetting(AppSettingsKey.CSRF_ORIGIN, 'https://example.com');

		const event = makeEvent({
			method: 'POST',
			url: 'https://example.com/admin/settings',
			origin: 'https://attacker.example'
		});

		const response = await invoke(event);
		expect(response.status).toBe(403);

		const body = (await response.json()) as Record<string, unknown>;
		expect(body).toEqual({ error: 'Forbidden' });
		// Must NOT contain any internal detail
		expect(JSON.stringify(body)).not.toContain('mismatch');
		expect(JSON.stringify(body)).not.toContain('CSRF check');
	});
});

// DF-011/021 — Source-level assertion: the Plex popup/postMessage handler path
// (src/lib/client/plex-login.ts) uses server-side polling via fetch('/auth/plex')
// and does NOT implement a postMessage AUTH_COMPLETE handler. No token payload
// is ever passed to console.*. This test pins the absence of that pattern so a
// future refactor that adds AUTH_COMPLETE postMessage handling must also add a
// no-console-log guard.
describe('DF-011/021 — plex-login popup path has no AUTH_COMPLETE postMessage handler', () => {
	it('plex-login.ts contains no AUTH_COMPLETE string (no postMessage handler present)', async () => {
		const source = await Bun.file('src/lib/client/plex-login.ts').text();
		expect(source).not.toContain('AUTH_COMPLETE');
	});

	it('plex-login.ts does not log the popup poll response payload', async () => {
		const source = await Bun.file('src/lib/client/plex-login.ts').text();
		// There must be no console.log/warn/error/info of message data or poll payload
		expect(source).not.toMatch(/console\.(log|warn|error|info)\s*\(/);
	});

	it('auth-mode.ts contains no postMessage or AUTH_COMPLETE pattern', async () => {
		const source = await Bun.file('src/lib/client/auth-mode.ts').text();
		expect(source).not.toContain('AUTH_COMPLETE');
		expect(source).not.toContain('postMessage');
	});
});
