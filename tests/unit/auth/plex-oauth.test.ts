import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import {
	buildPlexOAuthUrl,
	checkPinStatus,
	getPinInfo,
	getPlexUserInfo,
	pollPinForToken,
	requestPin
} from '$lib/server/auth/plex-oauth';
import {
	PinExpiredError,
	PLEX_CLIENT_ID,
	PLEX_PRODUCT,
	PLEX_VERSION,
	PlexAuthApiError
} from '$lib/server/auth/types';
import { createMockJsonResponse } from '../../helpers/requests';

const PIN = {
	id: 12345,
	code: 'ABCD',
	product: PLEX_PRODUCT,
	trusted: false,
	qr: 'https://plex.tv/api/v2/pins/12345/qr',
	clientIdentifier: PLEX_CLIENT_ID,
	expiresIn: 900,
	createdAt: new Date().toISOString(),
	expiresAt: new Date(Date.now() + 900000).toISOString(),
	authToken: null as string | null
};
const USER = {
	id: 67890,
	uuid: 'abc-123-def-456',
	username: 'testuser',
	email: 'test@example.com',
	title: 'Test User',
	thumb: 'https://plex.tv/users/67890/avatar'
};

const pin = (authToken: string | null = null) => ({ ...PIN, authToken });
const ok = (data: unknown) => Promise.resolve(createMockJsonResponse(data));
const httpError = (status: number) => Promise.resolve(createMockJsonResponse({}, false, status));

describe('Plex OAuth module', () => {
	let fetchMock: ReturnType<typeof spyOn>;

	beforeEach(() => {
		fetchMock = spyOn(globalThis, 'fetch').mockRejectedValue(
			new Error('Fetch not mocked for this test')
		);
	});

	afterEach(() => {
		fetchMock.mockRestore();
	});

	describe('buildPlexOAuthUrl', () => {
		it('builds Plex auth URLs with device context and optional forwardUrl', () => {
			const url = buildPlexOAuthUrl('TESTCODE', 'https://myapp.com/callback');
			const withoutForward = buildPlexOAuthUrl('TESTCODE');

			expect(url).toContain('https://app.plex.tv/auth#?');
			expect(url).toContain(`clientID=${PLEX_CLIENT_ID}`);
			expect(url).toContain('code=TESTCODE');
			expect(url).toContain(`context%5Bdevice%5D%5Bproduct%5D=${PLEX_PRODUCT}`);
			expect(url).toContain(`context%5Bdevice%5D%5Bversion%5D=${PLEX_VERSION}`);
			expect(url).toContain(`forwardUrl=${encodeURIComponent('https://myapp.com/callback')}`);
			expect(withoutForward).not.toContain('forwardUrl');
		});
	});

	describe('requestPin', () => {
		it('returns parsed PIN responses', async () => {
			fetchMock.mockImplementation(() => ok(pin()));

			expect(await requestPin()).toMatchObject({ id: 12345, code: 'ABCD', authToken: null });
		});

		it.each([
			['non-OK response', () => httpError(500)],
			['invalid schema', () => ok({ invalid: 'response' })],
			['network error', () => Promise.reject(new Error('Network error'))]
		] as const)('throws PlexAuthApiError on %s', async (_name, response) => {
			fetchMock.mockImplementation(response);

			await expect(requestPin()).rejects.toBeInstanceOf(PlexAuthApiError);
		});

		it.each([
			['status code', () => httpError(429), 'statusCode', 429],
			['endpoint', () => httpError(500), 'endpoint', '/api/v2/pins'],
			[
				'wrapped message',
				() => Promise.reject(new Error('Connection refused')),
				'message',
				'Connection refused'
			]
		] as const)('preserves %s in errors', async (_name, response, property, expected) => {
			fetchMock.mockImplementation(response);

			try {
				await requestPin();
				expect.unreachable('Expected requestPin to reject');
			} catch (error) {
				expect(error).toBeInstanceOf(PlexAuthApiError);
				expect(String((error as unknown as Record<string, unknown>)[property])).toContain(
					String(expected)
				);
			}
		});
	});

	describe('checkPinStatus', () => {
		it('returns parsed PIN responses including authToken', async () => {
			fetchMock.mockImplementation(() => ok(pin('valid-auth-token')));

			expect(await checkPinStatus(12345)).toMatchObject({
				id: 12345,
				code: 'ABCD',
				authToken: 'valid-auth-token'
			});
		});

		it.each([
			['404', () => httpError(404), PinExpiredError],
			['500', () => httpError(500), PlexAuthApiError],
			['invalid schema', () => ok({ missing: 'fields' }), PlexAuthApiError],
			['network error', () => Promise.reject(new Error('Network failure')), PlexAuthApiError],
			['non-Error rejection', () => Promise.reject('string error'), PlexAuthApiError]
		] as const)('throws %s error', async (_name, response, ErrorClass) => {
			fetchMock.mockImplementation(response);

			await expect(checkPinStatus(12345)).rejects.toBeInstanceOf(ErrorClass);
		});
	});

	describe('pollPinForToken', () => {
		it.each([
			['immediately', ['my-auth-token'], 'my-auth-token', 1],
			['after polling', [null, null, 'delayed-token'], 'delayed-token', 3]
		] as const)('returns token %s', async (_name, tokens, expected, calls) => {
			let callCount = 0;
			fetchMock.mockImplementation(() => ok(pin(tokens[callCount++] ?? null)));

			expect(await pollPinForToken(12345, { intervalMs: 10 })).toBe(expected);
			expect(callCount).toBe(calls);
		});

		it.each([
			['max attempts expire', () => ok(pin(null)), { maxAttempts: 2, intervalMs: 10 }],
			[
				'PIN expires mid-poll',
				(() => {
					let calls = 0;
					return () => (++calls >= 2 ? httpError(404) : ok(pin(null)));
				})(),
				{ maxAttempts: 5, intervalMs: 10 }
			]
		] as const)('throws PinExpiredError when %s', async (_name, response, options) => {
			fetchMock.mockImplementation(response);

			await expect(pollPinForToken(12345, options)).rejects.toBeInstanceOf(PinExpiredError);
		});

		it('uses default polling options', async () => {
			fetchMock.mockImplementation(() => ok(pin('token')));

			expect(await pollPinForToken(12345)).toBe('token');
		});
	});

	describe('getPlexUserInfo', () => {
		it('returns parsed user info including thumb', async () => {
			fetchMock.mockImplementation(() => ok(USER));

			expect(await getPlexUserInfo('valid-token')).toMatchObject({
				id: 67890,
				username: 'testuser',
				email: 'test@example.com',
				thumb: USER.thumb
			});
		});

		it.each([
			['non-OK response', () => httpError(401)],
			['invalid schema', () => ok({ id: 123 })],
			['network error', () => Promise.reject(new Error('Connection timeout'))],
			['non-Error rejection', () => Promise.reject({ code: 'TIMEOUT' })]
		] as const)('throws PlexAuthApiError on %s', async (_name, response) => {
			fetchMock.mockImplementation(response);

			await expect(getPlexUserInfo('valid-token')).rejects.toBeInstanceOf(PlexAuthApiError);
		});
	});

	describe('getPinInfo', () => {
		it('returns complete PIN info with auth URL and response expiry', async () => {
			const expiresAt = '2024-12-21T12:00:00.000Z';
			fetchMock.mockImplementation(() => ok({ ...pin(), expiresAt }));

			expect(await getPinInfo()).toMatchObject({
				pinId: 12345,
				code: 'ABCD',
				expiresAt
			});
		});

		it('generates fallback expiresAt when the response omits it', async () => {
			fetchMock.mockImplementation(() => ok({ ...pin(), expiresAt: undefined }));
			const before = Date.now();
			const result = await getPinInfo();
			const expiresTime = new Date(result.expiresAt).getTime();

			expect(result.authUrl).toContain('https://app.plex.tv/auth#?');
			expect(result.authUrl).toContain('code=ABCD');
			expect(expiresTime).toBeGreaterThanOrEqual(before + 15 * 60 * 1000 - 1000);
			expect(expiresTime).toBeLessThanOrEqual(Date.now() + 15 * 60 * 1000 + 1000);
		});

		it('propagates requestPin errors', async () => {
			fetchMock.mockImplementation(() => httpError(500));

			await expect(getPinInfo()).rejects.toBeInstanceOf(PlexAuthApiError);
		});
	});

	describe('error passthrough', () => {
		it.each([
			['PlexAuthApiError', requestPin, new PlexAuthApiError('Original error', 400, '/test')],
			['PinExpiredError', () => checkPinStatus(12345), new PinExpiredError()]
		] as const)('re-throws %s without wrapping', async (_name, action, originalError) => {
			fetchMock.mockImplementation(() => Promise.reject(originalError));

			try {
				await action();
				expect.unreachable('Expected passthrough error');
			} catch (error) {
				expect(error).toBe(originalError);
			}
		});
	});
});
