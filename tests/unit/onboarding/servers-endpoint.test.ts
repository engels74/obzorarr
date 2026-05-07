import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import type { Cookies } from '@sveltejs/kit';
import { isHttpError } from '@sveltejs/kit';
import * as sessionModule from '$lib/server/auth/session';
import { db } from '$lib/server/db/client';
import { appSettings } from '$lib/server/db/schema';
import {
	claimOnboardingInstance,
	clearBootstrapToken,
	createBootstrapToken,
	ONBOARDING_CLAIM_REQUIRED_MESSAGE
} from '$lib/server/onboarding/bootstrap';
import { GET } from '../../../src/routes/api/onboarding/servers/+server';

type HandlerArgs = Parameters<typeof GET>[0];

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

function runGet(
	locals: HandlerArgs['locals'],
	sessionId?: string,
	cookies: HandlerArgs['cookies'] = makeCookies(sessionId)
): ReturnType<typeof GET> {
	return GET({
		cookies,
		locals
	} as unknown as HandlerArgs);
}

function makeThrowingClaimCookies(errorToThrow: Error): HandlerArgs['cookies'] {
	return {
		get: () => {
			throw errorToThrow;
		},
		getAll: () => [],
		set: () => {},
		delete: () => {},
		serialize: () => ''
	} as unknown as HandlerArgs['cookies'];
}

function createPlexResourcesResponse(resources: unknown[]): Response {
	return new Response(JSON.stringify(resources), {
		status: 200,
		headers: { 'Content-Type': 'application/json' }
	});
}

describe('GET /api/onboarding/servers', () => {
	async function createClaim(): Promise<void> {
		await db.delete(appSettings);
		clearBootstrapToken();
		claimValues = new Map();
		const cookies = makeCookies();
		const token = createBootstrapToken();
		expect(await claimOnboardingInstance(cookies as unknown as Cookies, token)).toBe('claimed');
	}

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

	it('returns the expected claim-required error when setup claim is missing', async () => {
		const locals = {
			user: { id: 1, plexId: 100, username: 'admin', isAdmin: true }
		} as HandlerArgs['locals'];

		try {
			await runGet(locals, 'test-session-id');
			expect.unreachable('Expected error to be thrown');
		} catch (err) {
			expect(isHttpError(err)).toBe(true);
			if (!isHttpError(err)) throw err;
			expect(err.status).toBe(403);
			expect(err.body.message).toBe(ONBOARDING_CLAIM_REQUIRED_MESSAGE);
		}
	});

	it('propagates unexpected claim errors for centralized sanitization', async () => {
		const locals = {
			user: { id: 1, plexId: 100, username: 'admin', isAdmin: true }
		} as HandlerArgs['locals'];
		const unexpected = new Error('raw database path should stay server-side');

		try {
			await runGet(locals, 'test-session-id', makeThrowingClaimCookies(unexpected));
			expect.unreachable('Expected unexpected claim error to be thrown');
		} catch (err) {
			expect(isHttpError(err)).toBe(false);
			expect(err).toBe(unexpected);
		}
	});

	describe('happy path — authenticated admin', () => {
		it('returns servers list built from Plex resources', async () => {
			await createClaim();
			const publicUri = 'https://plex.example.plex.direct:32400';
			const resources = [
				{
					name: 'Home Server',
					product: 'Plex Media Server',
					provides: 'server',
					owned: true,
					clientIdentifier: 'abc123',
					accessToken: 'server-token-secret',
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
						accessToken?: string;
						authToken?: string;
						token?: string;
					}>;
				};

				expect(Array.isArray(body.servers)).toBe(true);
				expect(body.servers.length).toBe(1);
				const first = body.servers[0];
				if (!first) throw new Error('Expected at least one server');
				expect(first.name).toBe('Home Server');
				expect(first.clientIdentifier).toBe('abc123');
				expect(first.bestConnectionUrl).toBe(publicUri);
				expect(first.accessToken).toBeUndefined();
				expect(first.authToken).toBeUndefined();
				expect(first.token).toBeUndefined();
				expect(JSON.stringify(body)).not.toContain('server-token-secret');
			} finally {
				getSessionPlexTokenSpy.mockRestore();
				fetchSpy.mockRestore();
			}
		});
	});
});
