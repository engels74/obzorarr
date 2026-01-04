/**
 * Unit tests for Development Users Module
 *
 * Tests the dev-users.ts module which fetches and caches user information
 * from the Plex server for dev-bypass authentication.
 *
 * This module relies on external Plex APIs, so we mock the fetch calls
 * and the plex-oauth module to test the pure logic (caching, user lookup, etc.)
 */

import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';

// =============================================================================
// Mock Setup
// =============================================================================

// Mock the plex-oauth module's getPlexUserInfo function
const mockGetPlexUserInfo = mock(() =>
	Promise.resolve({
		id: 12345,
		uuid: 'owner-uuid',
		username: 'ServerOwner',
		email: 'owner@example.com',
		thumb: 'https://plex.tv/users/owner/avatar'
	})
);

mock.module('$lib/server/auth/plex-oauth', () => ({
	getPlexUserInfo: mockGetPlexUserInfo
}));

// Note: We don't mock the logger to avoid contaminating the module cache
// for other test files that test the actual logger implementation

// Helper to create mock headers
function createMockHeaders(contentType = 'application/json') {
	return {
		get: (name: string) => (name.toLowerCase() === 'content-type' ? contentType : null)
	};
}

// Machine identifier used in mock responses (must match between identity and friends)
const MOCK_MACHINE_ID = 'mock-machine-id-123456';

// Helper to create mock responses
function createMockIdentityResponse() {
	return {
		ok: true,
		headers: createMockHeaders(),
		json: () =>
			Promise.resolve({
				MediaContainer: {
					machineIdentifier: MOCK_MACHINE_ID
				}
			})
	};
}

/**
 * Create mock response for the /api/v2/friends endpoint
 *
 * The new API returns an array of friends, each with a sharedServers array
 * that includes machineIdentifier for filtering.
 */
function createMockFriendsResponse(
	sharedUsers: Array<{ id: number; username: string; email?: string; thumb?: string }> = []
) {
	return {
		ok: true,
		headers: createMockHeaders(),
		json: () =>
			Promise.resolve(
				sharedUsers.map((u, index) => ({
					id: u.id,
					username: u.username,
					email: u.email,
					thumb: u.thumb,
					// Include sharedServers with required fields for schema validation
					sharedServers: [{ id: 1000 + index, machineIdentifier: MOCK_MACHINE_ID }]
				}))
			)
	};
}

// Import after mocks are set up
import {
	clearUsersCache,
	getRandomNonOwnerUser,
	getServerOwner,
	getServerUsers,
	getUserById,
	getUserByUsername,
	resolveUserIdentifier
} from '$lib/server/auth/dev-users';

// =============================================================================
// Test Suites
// =============================================================================

describe('dev-users module', () => {
	let fetchMock: ReturnType<typeof spyOn>;

	beforeEach(() => {
		// Clear cache before each test
		clearUsersCache();
		// Reset mock calls
		mockGetPlexUserInfo.mockClear();
	});

	afterEach(() => {
		// Restore fetch if it was mocked
		if (fetchMock) {
			fetchMock.mockRestore();
		}
	});

	// Shared mock data
	const mockSharedUsers = [
		{ id: 1001, username: 'SharedUser1', email: 'user1@example.com', thumb: 'thumb1' },
		{ id: 1002, username: 'SharedUser2', email: 'user2@example.com', thumb: 'thumb2' },
		{ id: 1003, username: 'SharedUser3' } // No email/thumb
	];

	function setupFetchMock(sharedUsers = mockSharedUsers) {
		fetchMock = spyOn(globalThis, 'fetch').mockImplementation(((url: URL | RequestInfo) => {
			const urlStr = url.toString();
			if (urlStr.includes('/identity')) {
				return Promise.resolve(createMockIdentityResponse() as Response);
			}
			if (urlStr.includes('/api/v2/friends')) {
				return Promise.resolve(createMockFriendsResponse(sharedUsers) as Response);
			}
			return Promise.reject(new Error(`Unexpected URL: ${urlStr}`));
		}) as typeof fetch);
	}

	describe('getServerUsers', () => {
		it('fetches owner and shared users from Plex API', async () => {
			setupFetchMock();

			const result = await getServerUsers();

			expect(result.owner).toBeDefined();
			expect(result.owner.plexId).toBe(12345);
			expect(result.owner.username).toBe('ServerOwner');
			expect(result.owner.email).toBe('owner@example.com');
			expect(result.owner.isOwner).toBe(true);

			expect(result.sharedUsers).toHaveLength(3);
			expect(result.sharedUsers[0]?.plexId).toBe(1001);
			expect(result.sharedUsers[0]?.isOwner).toBe(false);
		});

		it('handles shared users without optional fields', async () => {
			setupFetchMock();

			const result = await getServerUsers();

			// Third user has no email/thumb
			const user3 = result.sharedUsers[2];
			expect(user3?.email).toBeNull();
			expect(user3?.thumb).toBeNull();
		});

		it('returns cached data on subsequent calls', async () => {
			setupFetchMock();

			// First call - should fetch
			await getServerUsers();
			expect(mockGetPlexUserInfo).toHaveBeenCalledTimes(1);

			// Second call - should use cache
			const result2 = await getServerUsers();
			expect(mockGetPlexUserInfo).toHaveBeenCalledTimes(1); // Still 1
			expect(result2.owner.username).toBe('ServerOwner');
		});

		it('handles empty shared users list', async () => {
			setupFetchMock([]);

			const result = await getServerUsers();

			expect(result.owner).toBeDefined();
			expect(result.sharedUsers).toHaveLength(0);
		});
	});

	describe('getServerOwner', () => {
		it('returns only the server owner', async () => {
			setupFetchMock();

			const owner = await getServerOwner();

			expect(owner.plexId).toBe(12345);
			expect(owner.username).toBe('ServerOwner');
			expect(owner.isOwner).toBe(true);
		});
	});

	describe('getUserById', () => {
		it('returns owner when owner plexId is provided', async () => {
			setupFetchMock();

			const user = await getUserById(12345);

			expect(user).not.toBeNull();
			expect(user?.username).toBe('ServerOwner');
			expect(user?.isOwner).toBe(true);
		});

		it('returns shared user when their plexId is provided', async () => {
			setupFetchMock();

			const user = await getUserById(1002);

			expect(user).not.toBeNull();
			expect(user?.username).toBe('SharedUser2');
			expect(user?.isOwner).toBe(false);
		});

		it('returns null for non-existent plexId', async () => {
			setupFetchMock();

			const user = await getUserById(99999);

			expect(user).toBeNull();
		});
	});

	describe('getUserByUsername', () => {
		it('returns owner when owner username is provided (case-insensitive)', async () => {
			setupFetchMock();

			const user = await getUserByUsername('serverowner');

			expect(user).not.toBeNull();
			expect(user?.plexId).toBe(12345);
			expect(user?.isOwner).toBe(true);
		});

		it('returns shared user when their username is provided', async () => {
			setupFetchMock();

			const user = await getUserByUsername('SharedUser1');

			expect(user).not.toBeNull();
			expect(user?.plexId).toBe(1001);
		});

		it('is case-insensitive for shared users', async () => {
			setupFetchMock();

			const user = await getUserByUsername('SHAREDUSER2');

			expect(user).not.toBeNull();
			expect(user?.plexId).toBe(1002);
		});

		it('returns null for non-existent username', async () => {
			setupFetchMock();

			const user = await getUserByUsername('NonExistentUser');

			expect(user).toBeNull();
		});
	});

	describe('getRandomNonOwnerUser', () => {
		it('returns a shared user (not owner)', async () => {
			setupFetchMock();

			const user = await getRandomNonOwnerUser();

			expect(user).not.toBeNull();
			expect(user?.isOwner).toBe(false);
			// Verify it's one of the shared users
			expect(user).toBeDefined();
			expect([1001, 1002, 1003]).toContain(user!.plexId);
		});

		it('returns null when no shared users exist', async () => {
			setupFetchMock([]);

			const user = await getRandomNonOwnerUser();

			expect(user).toBeNull();
		});
	});

	describe('resolveUserIdentifier', () => {
		it('resolves numeric string as plexId', async () => {
			setupFetchMock();

			const user = await resolveUserIdentifier('1001');

			expect(user).not.toBeNull();
			expect(user?.plexId).toBe(1001);
			expect(user?.username).toBe('SharedUser1');
		});

		it('resolves non-numeric string as username', async () => {
			setupFetchMock();

			const user = await resolveUserIdentifier('SharedUser2');

			expect(user).not.toBeNull();
			expect(user?.plexId).toBe(1002);
		});

		it('returns null for non-existent identifier', async () => {
			setupFetchMock();

			const user = await resolveUserIdentifier('nonexistent');

			expect(user).toBeNull();
		});

		it('treats negative numbers as usernames', async () => {
			setupFetchMock();

			// Negative numbers are not valid plexIds
			const user = await resolveUserIdentifier('-123');

			expect(user).toBeNull();
		});

		it('treats zero as username', async () => {
			setupFetchMock();

			// Zero is not a valid plexId (must be > 0)
			const user = await resolveUserIdentifier('0');

			expect(user).toBeNull();
		});
	});

	describe('clearUsersCache', () => {
		it('forces re-fetch on next call', async () => {
			setupFetchMock();

			// First fetch
			await getServerUsers();
			expect(mockGetPlexUserInfo).toHaveBeenCalledTimes(1);

			// Clear cache
			clearUsersCache();

			// Should fetch again
			await getServerUsers();
			expect(mockGetPlexUserInfo).toHaveBeenCalledTimes(2);
		});
	});

	describe('error handling', () => {
		it('throws error when identity endpoint returns non-ok response', async () => {
			fetchMock = spyOn(globalThis, 'fetch').mockImplementation(((url: URL | RequestInfo) => {
				const urlStr = url.toString();
				if (urlStr.includes('/identity')) {
					return Promise.resolve({
						ok: false,
						status: 401,
						statusText: 'Unauthorized',
						headers: createMockHeaders()
					} as Response);
				}
				return Promise.resolve(createMockFriendsResponse([]) as Response);
			}) as typeof fetch);

			await expect(getServerUsers()).rejects.toThrow('Failed to get server identity');
		});

		it('throws error when friends endpoint returns non-ok response', async () => {
			fetchMock = spyOn(globalThis, 'fetch').mockImplementation(((url: URL | RequestInfo) => {
				const urlStr = url.toString();
				if (urlStr.includes('/identity')) {
					return Promise.resolve(createMockIdentityResponse() as Response);
				}
				if (urlStr.includes('/api/v2/friends')) {
					return Promise.resolve({
						ok: false,
						status: 403,
						statusText: 'Forbidden',
						headers: createMockHeaders()
					} as Response);
				}
				return Promise.reject(new Error(`Unexpected URL: ${urlStr}`));
			}) as typeof fetch);

			await expect(getServerUsers()).rejects.toThrow('Failed to get friends');
		});

		it('throws error when identity response has invalid schema', async () => {
			fetchMock = spyOn(globalThis, 'fetch').mockImplementation(((url: URL | RequestInfo) => {
				const urlStr = url.toString();
				if (urlStr.includes('/identity')) {
					return Promise.resolve({
						ok: true,
						headers: createMockHeaders(),
						json: () => Promise.resolve({ invalid: 'data' })
					} as Response);
				}
				return Promise.resolve(createMockFriendsResponse([]) as Response);
			}) as typeof fetch);

			await expect(getServerUsers()).rejects.toThrow('Invalid server identity response');
		});

		it('returns empty shared users when friends response has invalid schema', async () => {
			fetchMock = spyOn(globalThis, 'fetch').mockImplementation(((url: URL | RequestInfo) => {
				const urlStr = url.toString();
				if (urlStr.includes('/identity')) {
					return Promise.resolve(createMockIdentityResponse() as Response);
				}
				if (urlStr.includes('/api/v2/friends')) {
					return Promise.resolve({
						ok: true,
						headers: createMockHeaders(),
						json: () => Promise.resolve({ invalid: 'data' })
					} as Response);
				}
				return Promise.reject(new Error(`Unexpected URL: ${urlStr}`));
			}) as typeof fetch);

			// With graceful error handling, invalid schema logs a warning and returns empty array
			const result = await getServerUsers();
			expect(result.owner).toBeDefined();
			expect(result.sharedUsers).toHaveLength(0);
		});

		it('throws error when friends response fails to parse as JSON', async () => {
			fetchMock = spyOn(globalThis, 'fetch').mockImplementation(((url: URL | RequestInfo) => {
				const urlStr = url.toString();
				if (urlStr.includes('/identity')) {
					return Promise.resolve(createMockIdentityResponse() as Response);
				}
				if (urlStr.includes('/api/v2/friends')) {
					return Promise.resolve({
						ok: true,
						headers: createMockHeaders('application/xml; charset=utf-8'),
						json: () => Promise.reject(new Error('Unexpected token <'))
					} as Response);
				}
				return Promise.reject(new Error(`Unexpected URL: ${urlStr}`));
			}) as typeof fetch);

			// JSON parse failures propagate as errors
			await expect(getServerUsers()).rejects.toThrow('Unexpected token <');
		});

		it('throws error when JSON response is malformed', async () => {
			fetchMock = spyOn(globalThis, 'fetch').mockImplementation(((url: URL | RequestInfo) => {
				const urlStr = url.toString();
				if (urlStr.includes('/identity')) {
					return Promise.resolve(createMockIdentityResponse() as Response);
				}
				if (urlStr.includes('/api/v2/friends')) {
					return Promise.resolve({
						ok: true,
						headers: createMockHeaders('application/json'),
						json: () => Promise.reject(new Error('Unexpected end of JSON input'))
					} as Response);
				}
				return Promise.reject(new Error(`Unexpected URL: ${urlStr}`));
			}) as typeof fetch);

			// JSON parse failures propagate as errors
			await expect(getServerUsers()).rejects.toThrow('Unexpected end of JSON input');
		});

		// Note: Testing missing config scenarios (serverUrl/token empty) would require
		// mocking the settings service module, which interferes with other tests.
		// The code paths for missing config (lines 46-50, 143-144 in dev-users.ts) are
		// defensive checks that are difficult to test in isolation.
	});
});
