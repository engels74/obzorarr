import { describe, expect, it, beforeEach, afterEach, spyOn, mock } from 'bun:test';
import {
	requestPin,
	checkPinStatus,
	pollPinForToken,
	getPlexUserInfo,
	getPinInfo,
	buildPlexOAuthUrl
} from '$lib/server/auth/plex-oauth';
import {
	PlexAuthApiError,
	PinExpiredError,
	PLEX_CLIENT_ID,
	PLEX_PRODUCT,
	PLEX_VERSION
} from '$lib/server/auth/types';

/**
 * Unit tests for Plex OAuth Module
 *
 * Tests the Plex PIN-based OAuth authentication flow.
 * Uses fetch mocking to simulate Plex.tv API responses.
 */

// Helper to create mock fetch response
function createMockResponse(data: unknown, ok = true, status = 200): Response {
	return {
		ok,
		status,
		statusText: ok ? 'OK' : 'Error',
		json: () => Promise.resolve(data),
		headers: new Headers(),
		redirected: false,
		type: 'basic',
		url: '',
		clone: () => createMockResponse(data, ok, status),
		body: null,
		bodyUsed: false,
		arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
		blob: () => Promise.resolve(new Blob()),
		formData: () => Promise.resolve(new FormData()),
		text: () => Promise.resolve(JSON.stringify(data))
	} as Response;
}

// Valid mock PIN response
function createMockPinResponse(authToken: string | null = null) {
	return {
		id: 12345,
		code: 'ABCD',
		product: PLEX_PRODUCT,
		trusted: false,
		qr: 'https://plex.tv/api/v2/pins/12345/qr',
		clientIdentifier: PLEX_CLIENT_ID,
		expiresIn: 900,
		createdAt: new Date().toISOString(),
		expiresAt: new Date(Date.now() + 900000).toISOString(),
		authToken
	};
}

// Valid mock user response
function createMockUserResponse() {
	return {
		id: 67890,
		uuid: 'abc-123-def-456',
		username: 'testuser',
		email: 'test@example.com',
		title: 'Test User',
		thumb: 'https://plex.tv/users/67890/avatar'
	};
}

describe('Plex OAuth Module', () => {
	let fetchMock: ReturnType<typeof spyOn>;

	beforeEach(() => {
		// Default mock that rejects (tests should set up their own)
		fetchMock = spyOn(globalThis, 'fetch').mockImplementation((() =>
			Promise.reject(new Error('Fetch not mocked for this test'))) as unknown as typeof fetch);
	});

	afterEach(() => {
		fetchMock.mockRestore();
	});

	// =========================================================================
	// buildPlexOAuthUrl (Pure function - no mocking needed)
	// =========================================================================

	describe('buildPlexOAuthUrl', () => {
		it('builds correct URL with required parameters', () => {
			const url = buildPlexOAuthUrl('TESTCODE');

			expect(url).toContain('https://app.plex.tv/auth#?');
			expect(url).toContain(`clientID=${PLEX_CLIENT_ID}`);
			expect(url).toContain('code=TESTCODE');
			expect(url).toContain(`context%5Bdevice%5D%5Bproduct%5D=${PLEX_PRODUCT}`);
			expect(url).toContain(`context%5Bdevice%5D%5Bversion%5D=${PLEX_VERSION}`);
		});

		it('includes forwardUrl when provided', () => {
			const forwardUrl = 'https://myapp.com/callback';
			const url = buildPlexOAuthUrl('TESTCODE', forwardUrl);

			expect(url).toContain('forwardUrl=');
			expect(url).toContain(encodeURIComponent(forwardUrl));
		});

		it('excludes forwardUrl when not provided', () => {
			const url = buildPlexOAuthUrl('TESTCODE');

			expect(url).not.toContain('forwardUrl');
		});
	});

	// =========================================================================
	// requestPin
	// =========================================================================

	describe('requestPin', () => {
		it('returns parsed PIN response on success', async () => {
			const mockPin = createMockPinResponse();
			fetchMock.mockImplementation(() => Promise.resolve(createMockResponse(mockPin)));

			const result = await requestPin();

			expect(result.id).toBe(12345);
			expect(result.code).toBe('ABCD');
			expect(result.authToken).toBeNull();
		});

		it('throws PlexAuthApiError on non-OK response', async () => {
			fetchMock.mockImplementation(() => Promise.resolve(createMockResponse({}, false, 500)));

			await expect(requestPin()).rejects.toBeInstanceOf(PlexAuthApiError);
		});

		it('throws PlexAuthApiError on invalid response schema', async () => {
			fetchMock.mockImplementation(() =>
				Promise.resolve(createMockResponse({ invalid: 'response' }))
			);

			await expect(requestPin()).rejects.toBeInstanceOf(PlexAuthApiError);
		});

		it('throws PlexAuthApiError on network error', async () => {
			fetchMock.mockImplementation(() => Promise.reject(new Error('Network error')));

			await expect(requestPin()).rejects.toBeInstanceOf(PlexAuthApiError);
		});

		it('includes endpoint in error', async () => {
			fetchMock.mockImplementation(() => Promise.resolve(createMockResponse({}, false, 500)));

			try {
				await requestPin();
				expect(true).toBe(false); // Should not reach here
			} catch (error) {
				expect(error).toBeInstanceOf(PlexAuthApiError);
				expect((error as PlexAuthApiError).endpoint).toContain('/api/v2/pins');
			}
		});
	});

	// =========================================================================
	// checkPinStatus
	// =========================================================================

	describe('checkPinStatus', () => {
		it('returns parsed PIN response on success', async () => {
			const mockPin = createMockPinResponse();
			fetchMock.mockImplementation(() => Promise.resolve(createMockResponse(mockPin)));

			const result = await checkPinStatus(12345);

			expect(result.id).toBe(12345);
			expect(result.code).toBe('ABCD');
		});

		it('returns authToken when PIN is authorized', async () => {
			const mockPin = createMockPinResponse('valid-auth-token');
			fetchMock.mockImplementation(() => Promise.resolve(createMockResponse(mockPin)));

			const result = await checkPinStatus(12345);

			expect(result.authToken).toBe('valid-auth-token');
		});

		it('throws PinExpiredError on 404', async () => {
			fetchMock.mockImplementation(() => Promise.resolve(createMockResponse({}, false, 404)));

			await expect(checkPinStatus(12345)).rejects.toBeInstanceOf(PinExpiredError);
		});

		it('throws PlexAuthApiError on other errors', async () => {
			fetchMock.mockImplementation(() => Promise.resolve(createMockResponse({}, false, 500)));

			await expect(checkPinStatus(12345)).rejects.toBeInstanceOf(PlexAuthApiError);
		});

		it('throws PlexAuthApiError on invalid response schema', async () => {
			fetchMock.mockImplementation(() =>
				Promise.resolve(createMockResponse({ missing: 'fields' }))
			);

			await expect(checkPinStatus(12345)).rejects.toBeInstanceOf(PlexAuthApiError);
		});
	});

	// =========================================================================
	// pollPinForToken
	// =========================================================================

	describe('pollPinForToken', () => {
		it('returns auth token when PIN is authorized', async () => {
			const mockPin = createMockPinResponse('my-auth-token');
			fetchMock.mockImplementation(() => Promise.resolve(createMockResponse(mockPin)));

			const token = await pollPinForToken(12345);

			expect(token).toBe('my-auth-token');
		});

		it('polls until token is available', async () => {
			let callCount = 0;
			fetchMock.mockImplementation(() => {
				callCount++;
				// Return authorized on third call
				const authToken = callCount >= 3 ? 'delayed-token' : null;
				return Promise.resolve(createMockResponse(createMockPinResponse(authToken)));
			});

			const token = await pollPinForToken(12345, { intervalMs: 10 });

			expect(token).toBe('delayed-token');
			expect(callCount).toBe(3);
		});

		it('throws PinExpiredError after max attempts', async () => {
			const mockPin = createMockPinResponse(null);
			fetchMock.mockImplementation(() => Promise.resolve(createMockResponse(mockPin)));

			await expect(
				pollPinForToken(12345, { maxAttempts: 2, intervalMs: 10 })
			).rejects.toBeInstanceOf(PinExpiredError);
		});

		it('throws PinExpiredError when PIN expires mid-polling', async () => {
			let callCount = 0;
			fetchMock.mockImplementation(() => {
				callCount++;
				if (callCount >= 2) {
					return Promise.resolve(createMockResponse({}, false, 404));
				}
				return Promise.resolve(createMockResponse(createMockPinResponse(null)));
			});

			await expect(
				pollPinForToken(12345, { maxAttempts: 5, intervalMs: 10 })
			).rejects.toBeInstanceOf(PinExpiredError);
		});

		it('uses default polling options', async () => {
			const mockPin = createMockPinResponse('token');
			fetchMock.mockImplementation(() => Promise.resolve(createMockResponse(mockPin)));

			// Just verify it works with defaults (doesn't throw)
			const token = await pollPinForToken(12345);
			expect(token).toBe('token');
		});
	});

	// =========================================================================
	// getPlexUserInfo
	// =========================================================================

	describe('getPlexUserInfo', () => {
		it('returns parsed user info on success', async () => {
			const mockUser = createMockUserResponse();
			fetchMock.mockImplementation(() => Promise.resolve(createMockResponse(mockUser)));

			const result = await getPlexUserInfo('valid-token');

			expect(result.id).toBe(67890);
			expect(result.username).toBe('testuser');
			expect(result.email).toBe('test@example.com');
		});

		it('throws PlexAuthApiError on non-OK response', async () => {
			fetchMock.mockImplementation(() => Promise.resolve(createMockResponse({}, false, 401)));

			await expect(getPlexUserInfo('invalid-token')).rejects.toBeInstanceOf(PlexAuthApiError);
		});

		it('throws PlexAuthApiError on invalid response schema', async () => {
			fetchMock.mockImplementation(
				() => Promise.resolve(createMockResponse({ id: 123 })) // Missing required fields
			);

			await expect(getPlexUserInfo('valid-token')).rejects.toBeInstanceOf(PlexAuthApiError);
		});

		it('throws PlexAuthApiError on network error', async () => {
			fetchMock.mockImplementation(() => Promise.reject(new Error('Network error')));

			await expect(getPlexUserInfo('valid-token')).rejects.toBeInstanceOf(PlexAuthApiError);
		});

		it('includes user thumb when present', async () => {
			const mockUser = createMockUserResponse();
			fetchMock.mockImplementation(() => Promise.resolve(createMockResponse(mockUser)));

			const result = await getPlexUserInfo('valid-token');

			expect(result.thumb).toBe('https://plex.tv/users/67890/avatar');
		});
	});

	// =========================================================================
	// getPinInfo
	// =========================================================================

	describe('getPinInfo', () => {
		it('returns complete PIN info with auth URL', async () => {
			const mockPin = createMockPinResponse();
			fetchMock.mockImplementation(() => Promise.resolve(createMockResponse(mockPin)));

			const result = await getPinInfo();

			expect(result.pinId).toBe(12345);
			expect(result.code).toBe('ABCD');
			expect(result.authUrl).toContain('https://app.plex.tv/auth#?');
			expect(result.authUrl).toContain('code=ABCD');
			expect(result.expiresAt).toBeDefined();
		});

		it('uses expiresAt from response when available', async () => {
			const expiresAt = '2024-12-21T12:00:00.000Z';
			const mockPin = { ...createMockPinResponse(), expiresAt };
			fetchMock.mockImplementation(() => Promise.resolve(createMockResponse(mockPin)));

			const result = await getPinInfo();

			expect(result.expiresAt).toBe(expiresAt);
		});

		it('generates fallback expiresAt when not in response', async () => {
			const mockPin = createMockPinResponse();
			// Ensure expiresAt is undefined so we use fallback
			const pinWithoutExpiry = { ...mockPin, expiresAt: undefined };
			fetchMock.mockImplementation(() => Promise.resolve(createMockResponse(pinWithoutExpiry)));

			const before = Date.now();
			const result = await getPinInfo();
			const after = Date.now();

			// Fallback should be ~15 minutes from now
			const expiresTime = new Date(result.expiresAt).getTime();
			const expectedMin = before + 15 * 60 * 1000 - 1000; // Allow 1s tolerance
			const expectedMax = after + 15 * 60 * 1000 + 1000;

			expect(expiresTime).toBeGreaterThanOrEqual(expectedMin);
			expect(expiresTime).toBeLessThanOrEqual(expectedMax);
		});

		it('propagates errors from requestPin', async () => {
			fetchMock.mockImplementation(() => Promise.resolve(createMockResponse({}, false, 500)));

			await expect(getPinInfo()).rejects.toBeInstanceOf(PlexAuthApiError);
		});
	});

	// =========================================================================
	// Error Handling Edge Cases
	// =========================================================================

	describe('Error Handling', () => {
		it('PlexAuthApiError includes status code', async () => {
			fetchMock.mockImplementation(() => Promise.resolve(createMockResponse({}, false, 429)));

			try {
				await requestPin();
				expect(true).toBe(false);
			} catch (error) {
				expect(error).toBeInstanceOf(PlexAuthApiError);
				expect((error as PlexAuthApiError).statusCode).toBe(429);
			}
		});

		it('PlexAuthApiError wraps underlying error', async () => {
			const underlyingError = new Error('Connection refused');
			fetchMock.mockImplementation(() => Promise.reject(underlyingError));

			try {
				await requestPin();
				expect(true).toBe(false);
			} catch (error) {
				expect(error).toBeInstanceOf(PlexAuthApiError);
				expect((error as PlexAuthApiError).message).toContain('Connection refused');
			}
		});

		it('re-throws PlexAuthApiError without wrapping', async () => {
			const originalError = new PlexAuthApiError('Original error', 400, '/test');
			fetchMock.mockImplementation(() => Promise.reject(originalError));

			try {
				await requestPin();
				expect(true).toBe(false);
			} catch (error) {
				expect(error).toBe(originalError);
			}
		});

		it('re-throws PinExpiredError without wrapping', async () => {
			const originalError = new PinExpiredError();
			fetchMock.mockImplementation(() => Promise.reject(originalError));

			try {
				await checkPinStatus(12345);
				expect(true).toBe(false);
			} catch (error) {
				expect(error).toBe(originalError);
			}
		});

		it('checkPinStatus wraps network errors', async () => {
			const networkError = new Error('Network failure');
			fetchMock.mockImplementation(() => Promise.reject(networkError));

			try {
				await checkPinStatus(12345);
				expect(true).toBe(false);
			} catch (error) {
				expect(error).toBeInstanceOf(PlexAuthApiError);
				expect((error as PlexAuthApiError).message).toContain('Network failure');
			}
		});

		it('checkPinStatus handles non-Error thrown values', async () => {
			// Some libraries throw strings or other non-Error values
			fetchMock.mockImplementation(() => Promise.reject('string error'));

			try {
				await checkPinStatus(12345);
				expect(true).toBe(false);
			} catch (error) {
				expect(error).toBeInstanceOf(PlexAuthApiError);
				expect((error as PlexAuthApiError).message).toContain('Unknown error');
			}
		});

		it('getPlexUserInfo wraps network errors', async () => {
			const networkError = new Error('Connection timeout');
			fetchMock.mockImplementation(() => Promise.reject(networkError));

			try {
				await getPlexUserInfo('test-token');
				expect(true).toBe(false);
			} catch (error) {
				expect(error).toBeInstanceOf(PlexAuthApiError);
				expect((error as PlexAuthApiError).message).toContain('Connection timeout');
			}
		});

		it('getPlexUserInfo handles non-Error thrown values', async () => {
			fetchMock.mockImplementation(() => Promise.reject({ code: 'TIMEOUT' }));

			try {
				await getPlexUserInfo('test-token');
				expect(true).toBe(false);
			} catch (error) {
				expect(error).toBeInstanceOf(PlexAuthApiError);
				expect((error as PlexAuthApiError).message).toContain('Unknown error');
			}
		});
	});
});
