import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import type { Cookies } from '@sveltejs/kit';
import * as sessionModule from '$lib/server/auth/session';
import { db } from '$lib/server/db/client';
import { appSettings } from '$lib/server/db/schema';
import {
	claimOnboardingInstance,
	clearBootstrapToken,
	createBootstrapToken
} from '$lib/server/onboarding/bootstrap';
import { POST } from '../../../src/routes/api/onboarding/test-connection/+server';

type HandlerArgs = Parameters<typeof POST>[0];

let claimValues = new Map<string, string>();

function makeCookies(sessionId?: string): HandlerArgs['cookies'] {
	return {
		get: (name: string) => (sessionId && name === 'session' ? sessionId : claimValues.get(name)),
		getAll: () => [],
		set: (name: string, value: string) => claimValues.set(name, value),
		delete: (name: string) => claimValues.delete(name),
		serialize: () => ''
	} as unknown as HandlerArgs['cookies'];
}

function runPost(
	locals: HandlerArgs['locals'],
	body: unknown,
	sessionId?: string
): ReturnType<typeof POST> {
	const request = new Request('http://localhost/api/onboarding/test-connection', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	});

	return POST({ request, locals, cookies: makeCookies(sessionId) } as unknown as HandlerArgs);
}

function makeIdentityResponse(): Response {
	return new Response(
		JSON.stringify({
			MediaContainer: {
				machineIdentifier: 'a'.repeat(32),
				friendlyName: 'Test Server'
			}
		}),
		{ status: 200, headers: { 'Content-Type': 'application/json' } }
	);
}

function hasIdentityFetchWithToken(fetchSpy: ReturnType<typeof spyOn>, token: string) {
	const calls = fetchSpy.mock.calls as Array<[string | URL | Request, RequestInit | undefined]>;
	return calls.some(([input, init]) => {
		const headers = init?.headers as Record<string, string> | undefined;
		return input === 'http://plex.local:32400/identity' && headers?.['X-Plex-Token'] === token;
	});
}

const adminLocals = {
	user: { id: 1, plexId: 100, username: 'admin', isAdmin: true }
} as HandlerArgs['locals'];

describe('POST /api/onboarding/test-connection token alias', () => {
	let fetchSpy: ReturnType<typeof spyOn>;
	let getSessionPlexTokenSpy: ReturnType<typeof spyOn>;

	afterEach(() => {
		fetchSpy?.mockRestore();
		getSessionPlexTokenSpy?.mockRestore();
	});

	it('accepts the canonical accessToken field', async () => {
		fetchSpy = spyOn(global, 'fetch').mockResolvedValue(makeIdentityResponse());

		const response = await runPost(adminLocals, {
			url: 'http://plex.local:32400',
			allowInsecureLocalHttp: true,
			accessToken: 'plex-token-abc'
		});

		expect(response.status).toBe(200);
		const body = (await response.json()) as { success: boolean; serverName?: string };
		expect(body.success).toBe(true);
		expect(body.serverName).toBe('Test Server');
		expect(hasIdentityFetchWithToken(fetchSpy, 'plex-token-abc')).toBe(true);
	});

	it('accepts the legacy token alias and uses it as X-Plex-Token', async () => {
		fetchSpy = spyOn(global, 'fetch').mockResolvedValue(makeIdentityResponse());

		const response = await runPost(adminLocals, {
			url: 'http://plex.local:32400',
			allowInsecureLocalHttp: true,
			token: 'plex-token-xyz'
		});

		expect(response.status).toBe(200);
		const body = (await response.json()) as { success: boolean };
		expect(body.success).toBe(true);
		expect(hasIdentityFetchWithToken(fetchSpy, 'plex-token-xyz')).toBe(true);
	});

	it('resolves a token server-side from clientIdentifier', async () => {
		getSessionPlexTokenSpy = spyOn(sessionModule, 'getSessionPlexToken').mockResolvedValue(
			'admin-session-token'
		);
		fetchSpy = spyOn(global, 'fetch')
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify([
						{
							name: 'Home Server',
							product: 'Plex Media Server',
							provides: 'server',
							owned: true,
							clientIdentifier: 'abc123',
							accessToken: 'server-token-secret'
						}
					]),
					{ status: 200, headers: { 'Content-Type': 'application/json' } }
				)
			)
			.mockResolvedValueOnce(makeIdentityResponse());

		const response = await runPost(
			adminLocals,
			{
				url: 'http://plex.local:32400',
				allowInsecureLocalHttp: true,
				clientIdentifier: 'abc123'
			},
			'test-session-id'
		);

		expect(response.status).toBe(200);
		const body = (await response.json()) as {
			success: boolean;
			accessToken?: string;
			token?: string;
		};
		expect(body.success).toBe(true);
		expect(body.accessToken).toBeUndefined();
		expect(body.token).toBeUndefined();
		expect(hasIdentityFetchWithToken(fetchSpy, 'server-token-secret')).toBe(true);
	});

	it('rejects requests with neither accessToken, token, nor clientIdentifier', async () => {
		const response = await runPost(adminLocals, {
			url: 'http://plex.local:32400'
		});

		expect(response.status).toBe(400);
		const body = (await response.json()) as { success: boolean; error?: string };
		expect(body.success).toBe(false);
		expect(body.error).toContain('Access token');
	});

	it('returns 400 for invalid request schema', async () => {
		const response = await runPost(adminLocals, { url: 'not-a-url', accessToken: 'abc' });
		expect(response.status).toBe(400);
		const body = (await response.json()) as { success: boolean };
		expect(body.success).toBe(false);
	});

	it('returns 401 when Plex responds 401', async () => {
		fetchSpy = spyOn(global, 'fetch').mockResolvedValue(
			new Response('Unauthorized', { status: 401 })
		);

		const response = await runPost(adminLocals, {
			url: 'http://plex.local:32400',
			allowInsecureLocalHttp: true,
			accessToken: 'bad'
		});

		expect(response.status).toBe(401);
		const body = (await response.json()) as { success: boolean; error?: string };
		expect(body.success).toBe(false);
		expect(body.error).toContain('Authentication failed');
	});

	it('returns 502 for non-OK upstream', async () => {
		fetchSpy = spyOn(global, 'fetch').mockResolvedValue(new Response('boom', { status: 503 }));

		const response = await runPost(adminLocals, {
			url: 'http://plex.local:32400',
			allowInsecureLocalHttp: true,
			accessToken: 'abc'
		});

		expect(response.status).toBe(502);
		const body = (await response.json()) as { success: boolean };
		expect(body.success).toBe(false);
	});

	it('returns 422 for non-Plex schema mismatch', async () => {
		fetchSpy = spyOn(global, 'fetch').mockResolvedValue(
			new Response(JSON.stringify({ unexpected: true }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			})
		);

		const response = await runPost(adminLocals, {
			url: 'http://plex.local:32400',
			allowInsecureLocalHttp: true,
			accessToken: 'abc'
		});

		expect(response.status).toBe(422);
		const body = (await response.json()) as { success: boolean; error?: string };
		expect(body.success).toBe(false);
		expect(body.error).toContain('Plex Media Server');
	});

	it('returns 422 when response body is not valid JSON', async () => {
		fetchSpy = spyOn(global, 'fetch').mockResolvedValue(
			new Response('<html>Gateway</html>', { status: 200 })
		);

		const response = await runPost(adminLocals, {
			url: 'http://plex.local:32400',
			allowInsecureLocalHttp: true,
			accessToken: 'abc'
		});

		expect(response.status).toBe(422);
		const body = (await response.json()) as { success: boolean; error?: string };
		expect(body.success).toBe(false);
		expect(body.error).toContain('Plex Media Server');
	});

	it('returns 503 when fetch throws', async () => {
		fetchSpy = spyOn(global, 'fetch').mockRejectedValue(new Error('network down'));

		const response = await runPost(adminLocals, {
			url: 'http://plex.local:32400',
			allowInsecureLocalHttp: true,
			accessToken: 'abc'
		});

		expect(response.status).toBe(503);
		const body = (await response.json()) as { success: boolean };
		expect(body.success).toBe(false);
	});
});
beforeEach(async () => {
	await db.delete(appSettings);
	clearBootstrapToken();
	claimValues = new Map();
	const cookies = makeCookies();
	const token = createBootstrapToken();
	expect(await claimOnboardingInstance(cookies as unknown as Cookies, token)).toBe('claimed');
});
