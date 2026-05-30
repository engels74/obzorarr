import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import type { Cookies } from '@sveltejs/kit';
import * as settingsService from '$lib/server/admin/settings.service';
import * as membership from '$lib/server/auth/membership';
import * as plexOauth from '$lib/server/auth/plex-oauth';
import {
	clearRevalidationEntry,
	needsRevalidation,
	revalidateMembership
} from '$lib/server/auth/revalidation';
import { PlexAuthApiError } from '$lib/server/auth/types';
import { db } from '$lib/server/db/client';
import { appSettings, sessions, users } from '$lib/server/db/schema';
import * as onboarding from '$lib/server/onboarding';
import {
	claimOnboardingInstance,
	clearBootstrapToken,
	createBootstrapToken
} from '$lib/server/onboarding/bootstrap';

/**
 * ISSUE-001 (real cause) — the admin session is *revoked* by the first-ever
 * revalidation that fires the instant onboarding completes. Two complementary
 * fixes:
 *   A. Cache-seed at session creation so the immediate, redundant re-probe is
 *      skipped (membership was just verified during login).
 *   B. Treat a transient `not_reachable` /identity blip during revalidation as a
 *      grace-period failure, not a hard revoke.
 *
 * Security guards (must hold before AND after): genuine non-membership
 * (`not_in_resources`) and invalid tokens (401) still revoke immediately.
 */

interface TestCookies extends Cookies {
	sets: Array<{ name: string; value?: string }>;
}

function createCookies(): TestCookies {
	const values = new Map<string, string>();
	const sets: Array<{ name: string; value?: string }> = [];
	return {
		sets,
		get: (name: string) => values.get(name),
		set: (name: string, value: string) => {
			sets.push({ name, value });
			values.set(name, value);
		},
		delete: (name: string) => {
			values.delete(name);
		}
	} as unknown as TestCookies;
}

describe('ISSUE-001: revalidation does not revoke a freshly-verified session', () => {
	let spies: Array<{ mockRestore(): void }> = [];

	beforeEach(async () => {
		await db.delete(appSettings);
		await db.delete(sessions);
		await db.delete(users);
		clearBootstrapToken();
		spies = [];
	});

	afterEach(() => {
		for (const spy of spies) spy.mockRestore();
	});

	// ----- Repro A: cache-seed at session creation ------------------------------
	it('seeds the revalidation cache at session creation so the next request skips revalidation', async () => {
		spies.push(
			spyOn(settingsService, 'getApiConfigWithSources').mockResolvedValue({
				plex: {
					serverUrl: { value: 'http://test-plex-server:32400', source: 'env', isLocked: false },
					token: { value: 'test-token', source: 'env', isLocked: false }
				},
				openai: {
					apiKey: { value: '', source: 'default', isLocked: false },
					baseUrl: { value: 'https://api.openai.com/v1', source: 'default', isLocked: false },
					model: { value: 'gpt-5-mini', source: 'default', isLocked: false }
				}
			}),
			spyOn(onboarding, 'requiresOnboarding').mockResolvedValue(true),
			spyOn(membership, 'requireServerMembership').mockResolvedValue({
				isMember: true,
				isOwner: true,
				serverName: 'Test Plex'
			}),
			spyOn(plexOauth, 'getPlexUserInfo').mockResolvedValue({
				id: 12345,
				uuid: 'plex-user-uuid',
				username: 'owner',
				email: 'owner@example.com',
				thumb: undefined,
				authToken: 'plex-user-token',
				services: []
			})
		);

		const cookies = createCookies();
		const token = createBootstrapToken();
		expect(await claimOnboardingInstance(cookies, token)).toBe('claimed');

		const { createSessionFromPlexToken } = await import('$lib/server/auth/login-completion');
		const result = await createSessionFromPlexToken('owner-auth-token', cookies);
		expect(result.user.isAdmin).toBe(true);

		const sessionId = cookies.get('session') as string;
		expect(sessionId).toBeTruthy();

		// THE FIX: the just-verified session is marked fresh, so authHandle skips the
		// immediate re-probe that would otherwise be the session's first revalidation.
		expect(needsRevalidation(sessionId)).toBe(false);

		clearRevalidationEntry(sessionId);
	});

	// ----- Repro B: grace for a transient reachability blip ---------------------
	it('returns error_within_grace (not revoked) when /identity is transiently unreachable', async () => {
		const sessionId = 'sess-grace-transient';
		clearRevalidationEntry(sessionId);

		spies.push(
			spyOn(membership, 'verifyServerMembership').mockResolvedValue({
				isMember: false,
				isOwner: false,
				reason: 'not_reachable',
				identityErrorReason: 'Connection timed out'
			})
		);

		const result = await revalidateMembership(sessionId, 'plex-token');
		expect(result.status).toBe('error_within_grace');
		expect(result.status).not.toBe('revoked');

		clearRevalidationEntry(sessionId);
	});

	// ----- Security guard: genuine non-membership still revokes -----------------
	it('still revokes immediately when the user is genuinely not in resources', async () => {
		const sessionId = 'sess-not-in-resources';
		clearRevalidationEntry(sessionId);

		spies.push(
			spyOn(membership, 'verifyServerMembership').mockResolvedValue({
				isMember: false,
				isOwner: false,
				reason: 'not_in_resources'
			})
		);

		const result = await revalidateMembership(sessionId, 'plex-token');
		expect(result.status).toBe('revoked');

		clearRevalidationEntry(sessionId);
	});

	// ----- Security guard: invalid token (401) still revokes --------------------
	it('still revokes immediately on a 401 (invalid Plex token)', async () => {
		const sessionId = 'sess-401';
		clearRevalidationEntry(sessionId);

		spies.push(
			spyOn(membership, 'verifyServerMembership').mockRejectedValue(
				new PlexAuthApiError('Unauthorized', 401, '/identity')
			)
		);

		const result = await revalidateMembership(sessionId, 'plex-token');
		expect(result.status).toBe('revoked');

		clearRevalidationEntry(sessionId);
	});
});
