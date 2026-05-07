import { beforeEach, describe, expect, it, spyOn } from 'bun:test';
import type { Cookies } from '@sveltejs/kit';
import { isHttpError } from '@sveltejs/kit';
import {
	AppSettingsKey,
	getAppSetting,
	getCachedServerName
} from '$lib/server/admin/settings.service';
import * as sessionModule from '$lib/server/auth/session';
import { db } from '$lib/server/db/client';
import { appSettings } from '$lib/server/db/schema';
import {
	claimOnboardingInstance,
	clearBootstrapToken,
	createBootstrapToken,
	ONBOARDING_CLAIM_REQUIRED_MESSAGE
} from '$lib/server/onboarding/bootstrap';
import { POST } from '../../../src/routes/api/onboarding/select-server/+server';

type HandlerArgs = Parameters<typeof POST>[0];

const adminLocals = {
	user: { id: 1, plexId: 100, username: 'admin', isAdmin: true }
} as HandlerArgs['locals'];

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

function runPost(body: unknown, sessionId?: string): ReturnType<typeof POST> {
	const request = new Request('http://localhost/api/onboarding/select-server', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	});

	return POST({
		request,
		locals: adminLocals,
		cookies: makeCookies(sessionId)
	} as unknown as HandlerArgs);
}

function runPostWithCookies(
	body: unknown,
	cookies: HandlerArgs['cookies']
): ReturnType<typeof POST> {
	const request = new Request('http://localhost/api/onboarding/select-server', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	});

	return POST({
		request,
		locals: adminLocals,
		cookies
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

describe('POST /api/onboarding/select-server', () => {
	let fetchSpy: ReturnType<typeof spyOn>;
	let getSessionPlexTokenSpy: ReturnType<typeof spyOn>;

	beforeEach(async () => {
		await db.delete(appSettings);
		clearBootstrapToken();
		claimValues = new Map();
		const cookies = makeCookies();
		const token = createBootstrapToken();
		expect(await claimOnboardingInstance(cookies as unknown as Cookies, token)).toBe('claimed');
		fetchSpy?.mockRestore();
		getSessionPlexTokenSpy?.mockRestore();
	});

	it('stores a server token resolved from clientIdentifier without returning token fields', async () => {
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
			{
				serverUrl: 'http://plex.local:32400',
				allowInsecureLocalHttp: true,
				clientIdentifier: 'abc123',
				serverName: 'Home Server'
			},
			'test-session-id'
		);

		expect(response.status).toBe(200);
		const body = (await response.json()) as {
			success: boolean;
			serverName?: string;
			accessToken?: string;
			token?: string;
			authToken?: string;
		};
		expect(body.success).toBe(true);
		expect(body.serverName).toBe('Home Server');
		expect(body.accessToken).toBeUndefined();
		expect(body.token).toBeUndefined();
		expect(body.authToken).toBeUndefined();
		expect(JSON.stringify(body)).not.toContain('server-token-secret');
		expect(await getAppSetting(AppSettingsKey.PLEX_TOKEN)).toBe('server-token-secret');
		expect(await getCachedServerName()).toBe('Home Server');
	});

	it('keeps legacy accessToken compatibility', async () => {
		fetchSpy = spyOn(global, 'fetch').mockResolvedValue(makeIdentityResponse());

		const response = await runPost({
			serverUrl: 'http://plex.local:32400',
			allowInsecureLocalHttp: true,
			accessToken: 'legacy-token',
			serverName: 'Legacy Server'
		});

		expect(response.status).toBe(200);
		const body = (await response.json()) as { success: boolean };
		expect(body.success).toBe(true);
		expect(await getAppSetting(AppSettingsKey.PLEX_TOKEN)).toBe('legacy-token');
	});

	it('returns the expected claim-required error when setup claim is missing', async () => {
		claimValues = new Map();

		try {
			await runPost({
				serverUrl: 'https://plex.example.com:32400',
				accessToken: 'legacy-token',
				serverName: 'Legacy Server'
			});
			expect.unreachable('Expected error to be thrown');
		} catch (err) {
			expect(isHttpError(err)).toBe(true);
			if (!isHttpError(err)) throw err;
			expect(err.status).toBe(403);
			expect(err.body.message).toBe(ONBOARDING_CLAIM_REQUIRED_MESSAGE);
		}
	});

	it('propagates unexpected claim errors for centralized sanitization', async () => {
		const unexpected = new Error('raw database path should stay server-side');

		try {
			await runPostWithCookies(
				{
					serverUrl: 'https://plex.example.com:32400',
					accessToken: 'legacy-token',
					serverName: 'Legacy Server'
				},
				makeThrowingClaimCookies(unexpected)
			);
			expect.unreachable('Expected unexpected claim error to be thrown');
		} catch (err) {
			expect(isHttpError(err)).toBe(false);
			expect(err).toBe(unexpected);
		}
	});
});
