import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import * as pinTransactions from '$lib/server/auth/pin-transactions';
import * as plexOAuth from '$lib/server/auth/plex-oauth';
import { GET } from '../../../src/routes/auth/plex/+server';

/**
 * ISSUE-002 regression: GET /auth/plex content-negotiates on Sec-Fetch-Dest.
 *
 * The homepage keeps a no-JS `<a href="/auth/plex">` sign-in fallback. A real
 * top-level navigation (Sec-Fetch-Dest: document) must NOT render the raw PIN
 * JSON to the page — it must mint a PIN and 303-redirect to the Plex OAuth URL,
 * so the no-JS path works end-to-end. A `fetch()`/XHR caller (the JS button,
 * Sec-Fetch-Dest: empty) still receives the JSON PIN payload unchanged. A link
 * prefetch (Sec-Purpose: prefetch) must NOT burn a PIN.
 */

const FAKE_PIN = { id: 999001, code: 'WXYZ', expiresAt: '2026-06-01T00:15:00.000Z' };
const FAKE_OAUTH_URL = 'https://app.plex.tv/auth#?clientID=test&code=WXYZ&forwardUrl=fwd';

type Spy = ReturnType<typeof spyOn>;

function cookieStub() {
	return {
		get: () => undefined,
		getAll: () => [],
		set: () => {},
		delete: () => {},
		serialize: () => ''
	} as unknown as Parameters<typeof GET>[0]['cookies'];
}

function invokeGet(headers: Record<string, string>) {
	const url = new URL('http://localhost/auth/plex');
	const request = new Request(url, { headers });
	return GET({
		cookies: cookieStub(),
		url,
		request
	} as unknown as Parameters<typeof GET>[0]);
}

describe('GET /auth/plex: Sec-Fetch-Dest content negotiation (ISSUE-002)', () => {
	let requestPinSpy: Spy;
	let buildOAuthSpy: Spy;
	let createTxSpy: Spy;
	let parseForwardSpy: Spy;
	let appendForwardSpy: Spy;

	beforeEach(() => {
		requestPinSpy = spyOn(plexOAuth, 'requestPin').mockResolvedValue(FAKE_PIN);
		buildOAuthSpy = spyOn(plexOAuth, 'buildPlexOAuthUrl').mockReturnValue(FAKE_OAUTH_URL);
		createTxSpy = spyOn(pinTransactions, 'createPinTransaction').mockResolvedValue('state-token');
		// parsePinForwardUrl validates and returns the parsed URL; the handler calls
		// it only for its throw-on-invalid side effect, so any valid URL works here.
		parseForwardSpy = spyOn(pinTransactions, 'parsePinForwardUrl').mockReturnValue(
			new URL('http://localhost/auth/plex/redirect')
		);
		appendForwardSpy = spyOn(pinTransactions, 'appendPinStateToForwardUrl').mockReturnValue('fwd');
	});

	afterEach(() => {
		requestPinSpy.mockRestore();
		buildOAuthSpy.mockRestore();
		createTxSpy.mockRestore();
		parseForwardSpy.mockRestore();
		appendForwardSpy.mockRestore();
	});

	it('303-redirects a document navigation straight to the Plex OAuth URL', async () => {
		try {
			await invokeGet({ 'sec-fetch-dest': 'document' });
			expect.unreachable('Expected a redirect to be thrown');
		} catch (err) {
			const redirectErr = err as { status?: number; location?: string };
			expect(redirectErr.status).toBe(303);
			expect(redirectErr.location).toBe(FAKE_OAUTH_URL);
		}
		// A document nav still mints a PIN (so the redirect target is live).
		expect(requestPinSpy).toHaveBeenCalledTimes(1);
	});

	it('mints NO PIN for a link prefetch (Sec-Purpose: prefetch) and returns 204', async () => {
		const response = (await invokeGet({
			'sec-fetch-dest': 'document',
			'sec-purpose': 'prefetch'
		})) as Response;

		expect(response.status).toBe(204);
		expect(requestPinSpy).not.toHaveBeenCalled();
		expect(createTxSpy).not.toHaveBeenCalled();
	});

	it('returns the JSON PIN payload for a fetch/XHR caller (Sec-Fetch-Dest: empty)', async () => {
		const response = (await invokeGet({ 'sec-fetch-dest': 'empty' })) as Response;

		expect(response.status).toBe(200);
		const body = (await response.json()) as { pinId: number; code: string; authUrl: string };
		expect(body.pinId).toBe(FAKE_PIN.id);
		expect(body.code).toBe(FAKE_PIN.code);
		expect(body.authUrl).toBe(FAKE_OAUTH_URL);
		expect(requestPinSpy).toHaveBeenCalledTimes(1);
	});

	it('falls back to JSON when Sec-Fetch-Dest is absent (very old browsers)', async () => {
		const response = (await invokeGet({})) as Response;

		expect(response.status).toBe(200);
		const body = (await response.json()) as { pinId: number };
		expect(body.pinId).toBe(FAKE_PIN.id);
	});
});
