import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { isHttpError } from '@sveltejs/kit';
import * as sessionModule from '$lib/server/auth/session';
import { GET } from '../../../src/routes/api/onboarding/servers/+server';

type HandlerArgs = Parameters<typeof GET>[0];

function makeCookies(sessionId?: string): HandlerArgs['cookies'] {
	return {
		get: (name: string) => (sessionId && name === 'session' ? sessionId : undefined),
		getAll: () => [],
		set: () => undefined,
		delete: () => undefined,
		serialize: () => ''
	} as unknown as HandlerArgs['cookies'];
}

function runGet(locals: HandlerArgs['locals'], sessionId?: string): ReturnType<typeof GET> {
	return GET({
		cookies: makeCookies(sessionId),
		locals
	} as unknown as HandlerArgs);
}

function createPlexResourcesResponse(resources: unknown[]): Response {
	return new Response(JSON.stringify(resources), {
		status: 200,
		headers: { 'Content-Type': 'application/json' }
	});
}

describe('GET /api/onboarding/servers', () => {
	afterEach(() => {
		// bun:test's spyOn returns a spy that we reset by restoring the original
		// module bindings; recreating spies per-test keeps state isolated.
	});

	it('returns 401 when the request is unauthenticated', async () => {
		try {
			await runGet({} as HandlerArgs['locals']);
			expect.unreachable('Expected error to be thrown');
		} catch (err) {
			expect(isHttpError(err)).toBe(true);
			if (!isHttpError(err)) throw err;
			expect(err.status).toBe(401);
		}
	});

	it('returns 403 when the user is authenticated but not an admin', async () => {
		const locals = {
			user: { id: 1, plexId: 100, username: 'nonadmin', isAdmin: false }
		} as HandlerArgs['locals'];

		try {
			await runGet(locals);
			expect.unreachable('Expected error to be thrown');
		} catch (err) {
			expect(isHttpError(err)).toBe(true);
			if (!isHttpError(err)) throw err;
			expect(err.status).toBe(403);
			expect(err.body.message).toBe('Only server owners can configure Obzorarr');
		}
	});

	describe('happy path — authenticated admin', () => {
		it('returns servers list built from Plex resources', async () => {
			const publicUri = 'https://plex.example.plex.direct:32400';
			const resources = [
				{
					name: 'Home Server',
					product: 'Plex Media Server',
					provides: 'server',
					owned: true,
					clientIdentifier: 'abc123',
					connections: [
						{
							protocol: 'https',
							address: 'plex.example.plex.direct',
							port: 32400,
							uri: publicUri,
							local: false,
							relay: false
						},
						{
							protocol: 'http',
							address: '192.168.1.10',
							port: 32400,
							uri: 'http://192.168.1.10:32400',
							local: true,
							relay: false
						}
					]
				}
			];

			const getSessionPlexTokenSpy = spyOn(sessionModule, 'getSessionPlexToken').mockResolvedValue(
				'test-plex-token'
			);
			const fetchSpy = spyOn(global, 'fetch').mockResolvedValue(
				createPlexResourcesResponse(resources)
			);

			try {
				const locals = {
					user: { id: 1, plexId: 100, username: 'admin', isAdmin: true }
				} as HandlerArgs['locals'];

				const response = await runGet(locals, 'test-session-id');
				expect(response.status).toBe(200);

				const body = (await response.json()) as {
					servers: Array<{
						name: string;
						clientIdentifier: string;
						bestConnectionUrl: string | null;
					}>;
				};

				expect(Array.isArray(body.servers)).toBe(true);
				expect(body.servers.length).toBe(1);
				const first = body.servers[0];
				if (!first) throw new Error('Expected at least one server');
				expect(first.name).toBe('Home Server');
				expect(first.clientIdentifier).toBe('abc123');
				expect(first.bestConnectionUrl).toBe(publicUri);
			} finally {
				getSessionPlexTokenSpy.mockRestore();
				fetchSpy.mockRestore();
			}
		});
	});
});
