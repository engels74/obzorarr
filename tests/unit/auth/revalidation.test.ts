import { beforeEach, describe, expect, it, mock } from 'bun:test';

const mockVerifyServerMembership = mock(() =>
	Promise.resolve({ isMember: true, isOwner: false, serverName: 'TestServer' })
);

mock.module('$lib/server/auth/membership', () => ({
	verifyServerMembership: mockVerifyServerMembership
}));

const mockRequiresOnboarding = mock(() => Promise.resolve(false));

mock.module('$lib/server/onboarding', () => ({
	requiresOnboarding: mockRequiresOnboarding
}));

import {
	clearRevalidationEntry,
	needsRevalidation,
	type RevalidationResult,
	revalidateMembership,
	shouldRevalidateSession
} from '$lib/server/auth/revalidation';
import { PlexAuthApiError } from '$lib/server/auth/types';

const SESSION_ID = 'test-session';
const PLEX_TOKEN = 'test-token';

describe('revalidation module', () => {
	beforeEach(() => {
		mockVerifyServerMembership.mockClear();
		mockVerifyServerMembership.mockImplementation(() =>
			Promise.resolve({ isMember: true, isOwner: false, serverName: 'TestServer' })
		);
		clearRevalidationEntry(SESSION_ID);
	});

	describe('needsRevalidation', () => {
		it('returns true for unknown sessions', () => {
			expect(needsRevalidation('unknown-session-id')).toBe(true);
		});

		it('returns false within the revalidation interval after a successful check', async () => {
			await revalidateMembership(SESSION_ID, PLEX_TOKEN);
			expect(needsRevalidation(SESSION_ID)).toBe(false);
		});

		it('returns true after cache entry is cleared', async () => {
			await revalidateMembership(SESSION_ID, PLEX_TOKEN);
			expect(needsRevalidation(SESSION_ID)).toBe(false);

			clearRevalidationEntry(SESSION_ID);
			expect(needsRevalidation(SESSION_ID)).toBe(true);
		});
	});

	describe('revalidateMembership - success', () => {
		it('returns valid when user is still a member', async () => {
			const result = await revalidateMembership(SESSION_ID, PLEX_TOKEN);

			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.membership.isMember).toBe(true);
				expect(result.membership.isOwner).toBe(false);
				expect(result.membership.serverName).toBe('TestServer');
			}
			expect(mockVerifyServerMembership).toHaveBeenCalledWith(PLEX_TOKEN);
		});

		it('returns valid with ownership info when user is owner', async () => {
			mockVerifyServerMembership.mockImplementation(() =>
				Promise.resolve({ isMember: true, isOwner: true, serverName: 'MyServer' })
			);

			const result = await revalidateMembership(SESSION_ID, PLEX_TOKEN);

			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.membership.isOwner).toBe(true);
			}
		});

		it('resets consecutive failures after a successful check', async () => {
			// Cause some failures first
			mockVerifyServerMembership.mockImplementation(() => {
				throw new Error('Network error');
			});
			await revalidateMembership(SESSION_ID, PLEX_TOKEN);
			await revalidateMembership(SESSION_ID, PLEX_TOKEN);

			// Now succeed
			mockVerifyServerMembership.mockImplementation(() =>
				Promise.resolve({ isMember: true, isOwner: false, serverName: 'TestServer' })
			);
			const result = await revalidateMembership(SESSION_ID, PLEX_TOKEN);
			expect(result.status).toBe('valid');

			// Subsequent failures should start count from 0 again
			mockVerifyServerMembership.mockImplementation(() => {
				throw new Error('Network error');
			});
			const failResult = await revalidateMembership(SESSION_ID, PLEX_TOKEN);
			expect(failResult.status).toBe('error_within_grace');
		});
	});

	describe('revalidateMembership - revocation', () => {
		it('returns revoked when isMember is false', async () => {
			mockVerifyServerMembership.mockImplementation(() =>
				Promise.resolve({ isMember: false, isOwner: false, serverName: 'TestServer' })
			);

			const result = await revalidateMembership(SESSION_ID, PLEX_TOKEN);

			expect(result.status).toBe('revoked');
			if (result.status === 'revoked') {
				expect(result.reason).toContain('member');
			}
		});

		it('returns revoked on PlexAuthApiError with 401 status', async () => {
			mockVerifyServerMembership.mockImplementation(() => {
				throw new PlexAuthApiError('Unauthorized', 401, '/api/v2/resources');
			});

			const result = await revalidateMembership(SESSION_ID, PLEX_TOKEN);

			expect(result.status).toBe('revoked');
			if (result.status === 'revoked') {
				expect(result.reason).toContain('401');
			}
		});
	});

	describe('revalidateMembership - transient errors', () => {
		it('returns error_within_grace on first network error', async () => {
			mockVerifyServerMembership.mockImplementation(() => {
				throw new Error('Network error');
			});

			const result = await revalidateMembership(SESSION_ID, PLEX_TOKEN);
			expect(result.status).toBe('error_within_grace');
		});

		it('returns error_within_grace on network error after prior success', async () => {
			// Succeed first
			await revalidateMembership(SESSION_ID, PLEX_TOKEN);

			// Then fail
			mockVerifyServerMembership.mockImplementation(() => {
				throw new Error('Network error');
			});

			const result = await revalidateMembership(SESSION_ID, PLEX_TOKEN);
			expect(result.status).toBe('error_within_grace');
		});

		it('returns error_grace_expired after MAX_CONSECUTIVE_FAILURES (4)', async () => {
			mockVerifyServerMembership.mockImplementation(() => {
				throw new Error('Network error');
			});

			let result: RevalidationResult | undefined;
			// 4 consecutive failures = MAX_CONSECUTIVE_FAILURES
			for (let i = 0; i < 4; i++) {
				result = await revalidateMembership(SESSION_ID, PLEX_TOKEN);
			}

			expect(result!.status).toBe('error_grace_expired');
		});

		it('stays error_within_grace below MAX_CONSECUTIVE_FAILURES threshold', async () => {
			mockVerifyServerMembership.mockImplementation(() => {
				throw new Error('Network error');
			});

			// 3 failures < MAX_CONSECUTIVE_FAILURES (4)
			let result: RevalidationResult | undefined;
			for (let i = 0; i < 3; i++) {
				result = await revalidateMembership(SESSION_ID, PLEX_TOKEN);
			}

			expect(result!.status).toBe('error_within_grace');
		});

		it('returns error_grace_expired after MAX failures even with prior success', async () => {
			// Succeed first
			await revalidateMembership(SESSION_ID, PLEX_TOKEN);

			// Then fail MAX_CONSECUTIVE_FAILURES times
			mockVerifyServerMembership.mockImplementation(() => {
				throw new Error('Network error');
			});

			let result: RevalidationResult | undefined;
			for (let i = 0; i < 4; i++) {
				result = await revalidateMembership(SESSION_ID, PLEX_TOKEN);
			}

			expect(result!.status).toBe('error_grace_expired');
		});

		it('treats non-401 PlexAuthApiError as transient error', async () => {
			mockVerifyServerMembership.mockImplementation(() => {
				throw new PlexAuthApiError('Internal Server Error', 500, '/api/v2/resources');
			});

			const result = await revalidateMembership(SESSION_ID, PLEX_TOKEN);
			expect(result.status).toBe('error_within_grace');
		});
	});

	describe('revalidateMembership - deduplication', () => {
		it('deduplicates concurrent calls for the same session', async () => {
			let resolveDelay: () => void;
			const delayPromise = new Promise<void>((r) => {
				resolveDelay = r;
			});

			mockVerifyServerMembership.mockImplementation(async () => {
				await delayPromise;
				return { isMember: true, isOwner: false, serverName: 'TestServer' };
			});

			const promise1 = revalidateMembership(SESSION_ID, PLEX_TOKEN);
			const promise2 = revalidateMembership(SESSION_ID, PLEX_TOKEN);

			resolveDelay!();

			const [result1, result2] = await Promise.all([promise1, promise2]);

			expect(result1.status).toBe('valid');
			expect(result2.status).toBe('valid');
			expect(mockVerifyServerMembership).toHaveBeenCalledTimes(1);
		});

		it('allows separate calls for different sessions', async () => {
			clearRevalidationEntry('session-a');
			clearRevalidationEntry('session-b');

			let resolveA: () => void;
			let resolveB: () => void;
			const delayA = new Promise<void>((r) => {
				resolveA = r;
			});
			const delayB = new Promise<void>((r) => {
				resolveB = r;
			});

			let callCount = 0;
			mockVerifyServerMembership.mockImplementation(async () => {
				callCount++;
				if (callCount === 1) await delayA;
				else await delayB;
				return { isMember: true, isOwner: false, serverName: 'TestServer' };
			});

			const promiseA = revalidateMembership('session-a', 'token-a');
			const promiseB = revalidateMembership('session-b', 'token-b');

			resolveA!();
			resolveB!();

			await Promise.all([promiseA, promiseB]);

			expect(mockVerifyServerMembership).toHaveBeenCalledTimes(2);

			clearRevalidationEntry('session-a');
			clearRevalidationEntry('session-b');
		});
	});

	describe('shouldRevalidateSession', () => {
		beforeEach(() => {
			mockRequiresOnboarding.mockClear();
		});

		it('returns false when onboarding is still required', async () => {
			mockRequiresOnboarding.mockImplementation(() => Promise.resolve(true));
			expect(await shouldRevalidateSession()).toBe(false);
		});

		it('returns true when onboarding is complete', async () => {
			mockRequiresOnboarding.mockImplementation(() => Promise.resolve(false));
			expect(await shouldRevalidateSession()).toBe(true);
		});

		it('returns false (and does not throw) when requiresOnboarding rejects', async () => {
			mockRequiresOnboarding.mockImplementation(() => Promise.reject(new Error('db failure')));
			expect(await shouldRevalidateSession()).toBe(false);
		});
	});

	describe('clearRevalidationEntry', () => {
		it('removes cache entry so needsRevalidation returns true', async () => {
			await revalidateMembership(SESSION_ID, PLEX_TOKEN);
			expect(needsRevalidation(SESSION_ID)).toBe(false);

			clearRevalidationEntry(SESSION_ID);
			expect(needsRevalidation(SESSION_ID)).toBe(true);
		});

		it('does not throw for non-existent sessions', () => {
			expect(() => clearRevalidationEntry('nonexistent')).not.toThrow();
		});

		it('allows re-revalidation after clearing', async () => {
			await revalidateMembership(SESSION_ID, PLEX_TOKEN);
			clearRevalidationEntry(SESSION_ID);

			const result = await revalidateMembership(SESSION_ID, PLEX_TOKEN);
			expect(result.status).toBe('valid');
			expect(mockVerifyServerMembership).toHaveBeenCalledTimes(2);
		});
	});
});
