import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { isSafeReturnPath, resolveSafeReturnPath } from '$lib/client/plex-login';
import { AppSettingsKey, setAppSetting } from '$lib/server/admin/settings.service';
import { completePlexPinLogin } from '$lib/server/auth/login-completion';
import * as pinTransactions from '$lib/server/auth/pin-transactions';
import {
	clearPinTransaction,
	createPinTransaction,
	getPinTransactionForRequest,
	markPinCallbackVerified,
	verifyPinCallback
} from '$lib/server/auth/pin-transactions';
import * as plexOAuth from '$lib/server/auth/plex-oauth';
import { PinExpiredError } from '$lib/server/auth/types';
import { GET as plexLoginGet } from '../../../src/routes/auth/plex/+server';
import { load as redirectLoad } from '../../../src/routes/auth/plex/redirect/+page.server';
import { resetSharedTestDb } from '../../helpers/db';
import { createTestCookies } from '../../helpers/requests';

const { load: logoutLoad, actions: logoutActions } = await import(
	'../../../src/routes/auth/logout/+page.server'
);

const FAKE_PIN = { id: 999001, code: 'WXYZ', expiresAt: '2026-06-01T00:15:00.000Z' };
const FAKE_OAUTH_URL = 'https://app.plex.tv/auth#?clientID=test&code=WXYZ&forwardUrl=fwd';
const BACKSLASH = String.fromCharCode(92);
const NEWLINE = String.fromCharCode(10);
const TAB = String.fromCharCode(9);
const NUL = String.fromCharCode(0);

type Spy = ReturnType<typeof spyOn>;

function isRedirect(thrown: unknown): thrown is { status: number; location: string } {
	return (
		typeof thrown === 'object' && thrown !== null && 'status' in thrown && 'location' in thrown
	);
}

async function expectRedirect(action: () => unknown, location: string) {
	try {
		await action();
		expect.unreachable(`Expected redirect to ${location}`);
	} catch (err) {
		expect(isRedirect(err)).toBe(true);
		if (isRedirect(err)) expect(err).toMatchObject({ status: 303, location });
	}
}

function invokePlexLoginGet(
	headers: Record<string, string>,
	recordedHeaders?: Record<string, string>
) {
	const url = new URL('http://localhost/auth/plex');
	return plexLoginGet({
		cookies: createTestCookies(),
		url,
		request: new Request(url, { headers }),
		setHeaders: (newHeaders: Record<string, string>) => {
			if (recordedHeaders) Object.assign(recordedHeaders, newHeaders);
		}
	} as unknown as Parameters<typeof plexLoginGet>[0]);
}

function redirectEvent(
	cookies: ReturnType<typeof createTestCookies>,
	state: string,
	referer?: string
) {
	const url = new URL(`http://localhost/auth/plex/redirect?state=${state}`);
	return {
		cookies,
		locals: {},
		request: new Request(url, referer ? { headers: { referer } } : undefined),
		url
	} as unknown as Parameters<typeof redirectLoad>[0];
}

const readSource = (path: string) => Bun.file(path).text();

describe('auth routes and browser login flow', () => {
	describe('logout route', () => {
		it.each([
			['GET load', 0],
			['POST action', 1]
		] as const)('%s redirects to / and only POST clears the session cookie', async (_name, deletes) => {
			const cookies = createTestCookies({ session: 'session-abc' });
			const action =
				_name === 'GET load'
					? () => logoutLoad({ cookies } as never)
					: () => logoutActions.default!({ cookies } as never);

			await expectRedirect(action, '/');

			expect(cookies.deletes).toHaveLength(deletes);
			if (deletes) expect(cookies.deletes[0]).toEqual({ name: 'session', options: { path: '/' } });
		});
	});

	describe('GET /auth/plex content negotiation', () => {
		let requestPinSpy: Spy;
		let buildOAuthSpy: Spy;
		let createTxSpy: Spy;
		let parseForwardSpy: Spy;
		let appendForwardSpy: Spy;

		beforeEach(() => {
			requestPinSpy = spyOn(plexOAuth, 'requestPin').mockResolvedValue(FAKE_PIN);
			buildOAuthSpy = spyOn(plexOAuth, 'buildPlexOAuthUrl').mockReturnValue(FAKE_OAUTH_URL);
			createTxSpy = spyOn(pinTransactions, 'createPinTransaction').mockResolvedValue('state-token');
			parseForwardSpy = spyOn(pinTransactions, 'parsePinForwardUrl').mockReturnValue(
				new URL('http://localhost/auth/plex/redirect')
			);
			appendForwardSpy = spyOn(pinTransactions, 'appendPinStateToForwardUrl').mockReturnValue(
				'fwd'
			);
		});

		afterEach(() => {
			for (const spy of [
				requestPinSpy,
				buildOAuthSpy,
				createTxSpy,
				parseForwardSpy,
				appendForwardSpy
			]) {
				spy.mockRestore();
			}
		});

		it('303-redirects document navigation to Plex OAuth after minting a PIN', async () => {
			await expectRedirect(
				() => invokePlexLoginGet({ 'sec-fetch-dest': 'document' }),
				FAKE_OAUTH_URL
			);
			expect(requestPinSpy).toHaveBeenCalledTimes(1);
		});

		it('mints no PIN for link prefetches', async () => {
			const response = (await invokePlexLoginGet({
				'sec-fetch-dest': 'document',
				'sec-purpose': 'prefetch'
			})) as Response;

			expect(response.status).toBe(204);
			expect(requestPinSpy).not.toHaveBeenCalled();
			expect(createTxSpy).not.toHaveBeenCalled();
		});

		it.each([
			['XHR/fetch', { 'sec-fetch-dest': 'empty' }],
			['absent Sec-Fetch-Dest', {}]
		] as const)('returns JSON PIN payload for %s callers', async (_name, headers) => {
			const recordedHeaders: Record<string, string> = {};
			const response = (await invokePlexLoginGet(headers, recordedHeaders)) as Response;
			const body = (await response.json()) as { pinId: number; code: string; authUrl: string };

			expect(response.status).toBe(200);
			expect(body).toMatchObject({
				pinId: FAKE_PIN.id,
				code: FAKE_PIN.code,
				authUrl: FAKE_OAUTH_URL
			});
			expect(recordedHeaders['Cache-Control']).toBe('no-store');
		});
	});

	describe('Plex PIN transactions', () => {
		beforeEach(async () => {
			await resetSharedTestDb();
		});

		it('binds, verifies, and clears a PIN transaction with the browser state cookie', async () => {
			const cookies = createTestCookies();
			const state = await createPinTransaction(123, cookies);

			expect((await getPinTransactionForRequest(123, cookies))?.state).toBe(state);
			expect(await getPinTransactionForRequest(456, cookies)).toBeNull();
			expect(await getPinTransactionForRequest(123, createTestCookies())).toBeNull();
			expect(await markPinCallbackVerified(cookies, 'wrong-state')).toBe(false);
			expect((await getPinTransactionForRequest(123, cookies))?.callbackVerified).toBe(false);
			expect(await markPinCallbackVerified(cookies, state)).toBe(true);
			expect((await getPinTransactionForRequest(123, cookies))?.callbackVerified).toBe(true);

			await clearPinTransaction(cookies, state);
			expect(cookies.deletes).toHaveLength(1);
			expect(cookies.deletes[0]?.name).toBe('plex_login_state');
			const setOptions = cookies.sets[0]?.options;
			const deleteOptions = cookies.deletes[0]?.options;
			expect(deleteOptions?.path).toBe(setOptions?.path);
			expect(deleteOptions?.httpOnly).toBe(setOptions?.httpOnly);
			expect(deleteOptions?.secure).toBe(setOptions?.secure);
			expect(deleteOptions?.sameSite).toBe(setOptions?.sameSite);
		});

		it('returns a token-free server PIN fallback for verified callback state', async () => {
			const cookies = createTestCookies();
			const state = await createPinTransaction(123, cookies);
			const verified = await verifyPinCallback(cookies, state);

			expect(verified?.pinId).toBe(123);
			expect(verified?.expiresAt).toBeInstanceOf(Date);
			expect(JSON.stringify(verified)).not.toContain('token');
		});

		it.each([
			['onboarding', false, 456, 'https://app.plex.tv'],
			['landing', true, 789, undefined]
		] as const)('redirect load exposes %s PIN fallback without tokens', async (context, onboarded, pinId, referer) => {
			if (onboarded) await setAppSetting(AppSettingsKey.ONBOARDING_COMPLETED, 'true');
			const cookies = createTestCookies();
			const state = await createPinTransaction(pinId, cookies);

			const result = await redirectLoad(redirectEvent(cookies, state, referer));

			expect(result).toMatchObject({
				stateVerified: true,
				serverPinFallback: { pinId, context }
			});
			expect(JSON.stringify(result)).not.toContain('token');
		});

		it('does not poll Plex or create a session before callback verification', async () => {
			const cookies = createTestCookies();
			await createPinTransaction(123, cookies);

			await expect(completePlexPinLogin(123, cookies)).resolves.toEqual({ pending: true });
		});

		it('rejects PIN polling without the initiating browser transaction', async () => {
			await expect(completePlexPinLogin(123, createTestCookies())).rejects.toBeInstanceOf(
				PinExpiredError
			);
		});
	});

	describe('returnTo open-redirect protection', () => {
		it.each([
			'/admin/settings',
			'/admin',
			'/dashboard?tab=x',
			'/admin/users#section'
		] as const)('accepts safe same-origin path %s', (path) => {
			expect(isSafeReturnPath(path)).toBe(true);
		});

		it.each([
			'//evil.com',
			'//evil.com/admin',
			`/${BACKSLASH}evil.com`,
			`${BACKSLASH}evil`,
			`${BACKSLASH}${BACKSLASH}evil.com`,
			`/admin${BACKSLASH}evil`,
			'https://evil.com',
			'http://evil.com/admin',
			'javascript:alert(1)',
			'data:text/html,<script>',
			'',
			'admin/settings',
			'relative',
			null,
			undefined,
			42,
			`/admin${NEWLINE}/evil`,
			`/admin${TAB}x`,
			`/admin${NUL}`
		] as const)('rejects forged returnTo %p', (path) => {
			expect(isSafeReturnPath(path)).toBe(false);
		});

		it.each([
			['/admin/settings', '/admin', '/admin/settings'],
			['/dashboard', '/dashboard', '/dashboard'],
			['//evil.com', '/admin', '/admin'],
			['https://evil.com', '/dashboard', '/dashboard'],
			[`${BACKSLASH}evil`, '/admin', '/admin'],
			[null, '/admin', '/admin'],
			[undefined, '/dashboard', '/dashboard']
		] as const)('resolves %p against %s', (candidate, fallback, expected) => {
			expect(resolveSafeReturnPath(candidate, fallback)).toBe(expected);
		});
	});

	describe('returnTo source wiring guards', () => {
		it('redirect load validates returnTo before putting it in PageData', async () => {
			const source = await readSource('src/routes/auth/plex/redirect/+page.server.ts');
			expect(source).toContain("import { isSafeReturnPath } from '$lib/client/plex-login';");
			expect(source).toContain("url.searchParams.get('returnTo')");
			expect(source).toContain('isSafeReturnPath(rawReturnTo) ? rawReturnTo : null');
		});

		it('redirect page lets onboarding win and otherwise resolves the safe returnTo', async () => {
			const source = await readSource('src/routes/auth/plex/redirect/+page.svelte');
			const onboardingIdx = source.indexOf("pinData.context === 'onboarding'");
			const resolveIdx = source.indexOf('resolveSafeReturnPath(data.returnTo');

			expect(source).toContain('resolveSafeReturnPath');
			expect(onboardingIdx).toBeGreaterThan(-1);
			expect(resolveIdx).toBeGreaterThan(onboardingIdx);
		});

		it('landing page threads a validated returnTo into both auth flows', async () => {
			const source = await readSource('src/routes/+page.svelte');
			expect(source).toContain("params.get('returnTo')");
			expect(source).toContain('isSafeReturnPath(rawReturnTo)');
			expect(source).toContain('returnTo,');
			expect(source).toContain('resolveSafeReturnPath(');
		});
	});
});
