/**
 * Unit tests for Development Users Module
 *
 * Tests the dev-users.ts module which fetches and caches user information
 * from the Plex server for dev-bypass authentication.
 *
 * This module relies on external Plex APIs, so we mock the fetch calls
 * and the plex-oauth module to test the pure logic (caching, user lookup, etc.)
 */

import { describe, expect, it, beforeEach, mock, spyOn, afterEach } from 'bun:test';
import type { NormalizedServerUser } from '$lib/server/auth/types';

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

// Mock logger to prevent console noise in tests
mock.module('$lib/server/logging', () => ({
	logger: {
		debug: () => {},
		info: () => {},
		warn: () => {},
		error: () => {}
	}
}));

// Helper to create mock responses
function createMockIdentityResponse() {
	return {
		ok: true,
		json: () =>
			Promise.resolve({
				MediaContainer: {
					machineIdentifier: 'mock-machine-id-123456'
				}
			})
	};
}

function createMockSharedServersResponse(
	sharedUsers: Array<{ id: number; username: string; email?: string; thumb?: string }> = []
) {
	return {
		ok: true,
		json: () =>
			Promise.resolve({
				MediaContainer: {
					SharedServer: sharedUsers.map((u) => ({
						id: u.id,
						username: u.username,
						email: u.email,
						thumb: u.thumb
					}))
				}
			})
	};
}

// Import after mocks are set up
import {
	getServerUsers,
	getServerOwner,
	getUserById,
	getUserByUsername,
	getRandomNonOwnerUser,
	resolveUserIdentifier,
	clearUsersCache
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
			if (urlStr.includes('/shared_servers')) {
				return Promise.resolve(createMockSharedServersResponse(sharedUsers) as Response);
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
						statusText: 'Unauthorized'
					} as Response);
				}
				return Promise.resolve(createMockSharedServersResponse([]) as Response);
			}) as typeof fetch);

			await expect(getServerUsers()).rejects.toThrow('Failed to get server identity');
		});

		it('throws error when shared_servers endpoint returns non-ok response', async () => {
			fetchMock = spyOn(globalThis, 'fetch').mockImplementation(((url: URL | RequestInfo) => {
				const urlStr = url.toString();
				if (urlStr.includes('/identity')) {
					return Promise.resolve(createMockIdentityResponse() as Response);
				}
				if (urlStr.includes('/shared_servers')) {
					return Promise.resolve({
						ok: false,
						status: 403,
						statusText: 'Forbidden'
					} as Response);
				}
				return Promise.reject(new Error(`Unexpected URL: ${urlStr}`));
			}) as typeof fetch);

			await expect(getServerUsers()).rejects.toThrow('Failed to get shared servers');
		});

		it('throws error when identity response has invalid schema', async () => {
			fetchMock = spyOn(globalThis, 'fetch').mockImplementation(((url: URL | RequestInfo) => {
				const urlStr = url.toString();
				if (urlStr.includes('/identity')) {
					return Promise.resolve({
						ok: true,
						json: () => Promise.resolve({ invalid: 'data' })
					} as Response);
				}
				return Promise.resolve(createMockSharedServersResponse([]) as Response);
			}) as typeof fetch);

			await expect(getServerUsers()).rejects.toThrow('Invalid server identity response');
		});

		it('throws error when shared_servers response has invalid schema', async () => {
			fetchMock = spyOn(globalThis, 'fetch').mockImplementation(((url: URL | RequestInfo) => {
				const urlStr = url.toString();
				if (urlStr.includes('/identity')) {
					return Promise.resolve(createMockIdentityResponse() as Response);
				}
				if (urlStr.includes('/shared_servers')) {
					return Promise.resolve({
						ok: true,
						json: () => Promise.resolve({ invalid: 'data' })
					} as Response);
				}
				return Promise.reject(new Error(`Unexpected URL: ${urlStr}`));
			}) as typeof fetch);

			await expect(getServerUsers()).rejects.toThrow('Invalid shared servers response');
		});
	});
});
