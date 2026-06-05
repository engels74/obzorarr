import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import * as settingsService from '$lib/server/admin/settings.service';
import * as membership from '$lib/server/auth/membership';
import * as plexOauth from '$lib/server/auth/plex-oauth';
import { NotServerMemberError } from '$lib/server/auth/types';
import { db } from '$lib/server/db/client';
import { sessions, users } from '$lib/server/db/schema';
import * as onboarding from '$lib/server/onboarding';
import {
	claimOnboardingInstance,
	clearBootstrapToken,
	createBootstrapToken,
	OnboardingClaimRequiredError
} from '$lib/server/onboarding/bootstrap';
import {
	createTestApiConfig,
	createTestPlexUser,
	type RestorableSpy,
	restoreSpies
} from '../../helpers/auth';
import { resetSharedTestDb } from '../../helpers/db';
import { createTestCookies } from '../../helpers/requests';

describe('createSessionFromPlexToken', () => {
	let spies: RestorableSpy[] = [];

	beforeEach(async () => {
		await resetSharedTestDb();
		clearBootstrapToken();

		spies = [
			spyOn(settingsService, 'getApiConfigWithSources').mockResolvedValue(createTestApiConfig()),
			spyOn(onboarding, 'requiresOnboarding').mockResolvedValue(false),
			spyOn(membership, 'requireServerMembership').mockResolvedValue({
				isMember: true,
				isOwner: false,
				serverName: 'Test Plex'
			}),
			spyOn(plexOauth, 'getPlexUserInfo').mockResolvedValue(createTestPlexUser())
		];
	});

	afterEach(() => {
		restoreSpies(spies);
	});

	it('redacts Plex and internal identifiers from the browser-facing completion response', async () => {
		const { createSessionFromPlexToken } = await import('$lib/server/auth/login-completion');
		const cookies = createTestCookies();

		const result = await createSessionFromPlexToken('secret-auth-token', cookies);

		expect(result).toEqual({
			user: {
				username: 'alice',
				isAdmin: false
			},
			redirectTo: '/dashboard'
		});
		expect(cookies.sets[0]?.name).toBe('session');

		const responseText = JSON.stringify(result);
		for (const forbidden of [
			'authToken',
			'token',
			'secret',
			'plexToken',
			'plexId',
			'email',
			'services',
			'accessToken',
			'clientIdentifier',
			'connections',
			'resources'
		]) {
			expect(responseText).not.toContain(forbidden);
		}
		expect(responseText).not.toContain('secret-auth-token');
		expect(responseText).not.toContain('plex-user-token-from-profile');
		expect(responseText).not.toContain('service-secret');
	});

	it('rejects first-admin creation during fresh onboarding without an active setup claim', async () => {
		spies.push(
			spyOn(onboarding, 'requiresOnboarding').mockResolvedValue(true),
			spyOn(settingsService, 'getApiConfigWithSources').mockResolvedValue(
				createTestApiConfig({
					serverUrl: '',
					token: '',
					serverUrlSource: 'default',
					tokenSource: 'default'
				})
			)
		);

		const { createSessionFromPlexToken } = await import('$lib/server/auth/login-completion');
		await expect(
			createSessionFromPlexToken('secret-auth-token', createTestCookies())
		).rejects.toBeInstanceOf(OnboardingClaimRequiredError);
	});

	it('rejects configured-Plex onboarding login without an active setup claim', async () => {
		spies.push(spyOn(onboarding, 'requiresOnboarding').mockResolvedValue(true));

		const { createSessionFromPlexToken } = await import('$lib/server/auth/login-completion');

		await expect(
			createSessionFromPlexToken('secret-auth-token', createTestCookies())
		).rejects.toBeInstanceOf(OnboardingClaimRequiredError);
		expect(await db.select().from(sessions)).toHaveLength(0);
	});

	it('rejects configured-Plex onboarding login for non-owners before creating a session', async () => {
		spies.push(spyOn(onboarding, 'requiresOnboarding').mockResolvedValue(true));

		const cookies = createTestCookies();
		const token = createBootstrapToken();
		expect(await claimOnboardingInstance(cookies, token)).toBe('claimed');

		const { createSessionFromPlexToken } = await import('$lib/server/auth/login-completion');

		try {
			await createSessionFromPlexToken('secret-auth-token', cookies);
			expect.unreachable('Expected non-owner onboarding login to be rejected');
		} catch (err) {
			expect(err).toBeInstanceOf(NotServerMemberError);
			expect((err as Error).message).toBe(
				'Only the server owner can configure Obzorarr. Please sign in with the server owner account.'
			);
		}
		expect(await db.select().from(sessions)).toHaveLength(0);
		expect(await db.select().from(users)).toHaveLength(0);
	});

	it('allows configured-Plex onboarding login for the server owner', async () => {
		spies.push(
			spyOn(onboarding, 'requiresOnboarding').mockResolvedValue(true),
			spyOn(membership, 'requireServerMembership').mockResolvedValue({
				isMember: true,
				isOwner: true,
				serverName: 'Test Plex'
			})
		);

		const cookies = createTestCookies();
		const token = createBootstrapToken();
		expect(await claimOnboardingInstance(cookies, token)).toBe('claimed');

		const { createSessionFromPlexToken } = await import('$lib/server/auth/login-completion');
		const result = await createSessionFromPlexToken('secret-auth-token', cookies);

		expect(result).toEqual({
			user: { username: 'alice', isAdmin: true },
			redirectTo: '/admin'
		});
		expect(await db.select().from(sessions)).toHaveLength(1);
	});

	// ISSUE-010 regression lock — account-identity mapping.
	//
	// `play_history.accountId` is stamped by the Plex Media Server's
	// `/status/sessions/history/all` endpoint with the *local* SystemAccount ID,
	// where the server owner/admin is always `1` (verified against Plex docs and
	// python-plexapi: history `accountID` == SystemAccount ID, owner == 1). This
	// is a DIFFERENT id space from the plex.tv global id returned by
	// `getPlexUserInfo()` (`plexUser.id`, e.g. 677042263).
	//
	// Personal-Wrapped resolution is `statsAccountId = user.accountId ?? user.plexId`,
	// which filters `play_history.accountId == statsAccountId`. Therefore the OWNER
	// must store `accountId = 1` (matches their own history rows); a NON-OWNER member
	// must store their real plex.tv id (their history rows carry that id). Storing the
	// owner's real plex.tv id would make their Wrapped permanently empty — do NOT swap.
	it('stores accountId = 1 (local owner id) for the server owner during normal login, not the plex.tv id', async () => {
		spies.push(
			spyOn(membership, 'requireServerMembership').mockResolvedValue({
				isMember: true,
				isOwner: true,
				serverName: 'Test Plex'
			})
		);

		const { createSessionFromPlexToken } = await import('$lib/server/auth/login-completion');
		await createSessionFromPlexToken('secret-auth-token', createTestCookies());

		const stored = await db.select().from(users);
		expect(stored).toHaveLength(1);
		// Owner is the local SystemAccount 1 in play_history, NOT plexUser.id (12345).
		expect(stored[0]?.accountId).toBe(1);
		expect(stored[0]?.plexId).toBe(12345);
		expect(stored[0]?.isAdmin).toBe(true);
	});

	it('stores the real plex.tv id as accountId for a non-owner member during normal login', async () => {
		// Default beforeEach mock has requireServerMembership -> isOwner: false.
		const { createSessionFromPlexToken } = await import('$lib/server/auth/login-completion');
		await createSessionFromPlexToken('secret-auth-token', createTestCookies());

		const stored = await db.select().from(users);
		expect(stored).toHaveLength(1);
		// Members' history rows carry their real account id, so account_id == plexId.
		expect(stored[0]?.accountId).toBe(12345);
		expect(stored[0]?.plexId).toBe(12345);
		expect(stored[0]?.isAdmin).toBe(false);
	});

	it('stores accountId = 1 for the owner via the bootstrap-claim onboarding path (configured Plex)', async () => {
		spies.push(
			spyOn(onboarding, 'requiresOnboarding').mockResolvedValue(true),
			spyOn(membership, 'requireServerMembership').mockResolvedValue({
				isMember: true,
				isOwner: true,
				serverName: 'Test Plex'
			})
		);

		const cookies = createTestCookies();
		const token = createBootstrapToken();
		expect(await claimOnboardingInstance(cookies, token)).toBe('claimed');

		const { createSessionFromPlexToken } = await import('$lib/server/auth/login-completion');
		await createSessionFromPlexToken('secret-auth-token', cookies);

		const stored = await db.select().from(users);
		expect(stored).toHaveLength(1);
		// Bootstrap-claim owner must use the SAME convention as the OAuth owner branch:
		// local SystemAccount id 1, never the plex.tv id 12345 (ISSUE-010 trap).
		expect(stored[0]?.accountId).toBe(1);
		expect(stored[0]?.plexId).toBe(12345);
		expect(stored[0]?.isAdmin).toBe(true);
	});

	it('stores accountId = 1 for the owner via the bootstrap-claim onboarding path (fresh, unconfigured Plex)', async () => {
		spies.push(
			spyOn(onboarding, 'requiresOnboarding').mockResolvedValue(true),
			spyOn(settingsService, 'getApiConfigWithSources').mockResolvedValue(
				createTestApiConfig({
					serverUrl: '',
					token: '',
					serverUrlSource: 'default',
					tokenSource: 'default'
				})
			),
			spyOn(membership, 'verifyServerOwnership').mockResolvedValue({
				isOwner: true,
				serverName: 'Owned Plex'
			})
		);

		const cookies = createTestCookies();
		const token = createBootstrapToken();
		expect(await claimOnboardingInstance(cookies, token)).toBe('claimed');

		const { createSessionFromPlexToken } = await import('$lib/server/auth/login-completion');
		await createSessionFromPlexToken('secret-auth-token', cookies);

		const stored = await db.select().from(users);
		expect(stored).toHaveLength(1);
		expect(stored[0]?.accountId).toBe(1);
		expect(stored[0]?.plexId).toBe(12345);
		expect(stored[0]?.isAdmin).toBe(true);
	});

	it('propagates unexpected setup claim renewal errors during fresh onboarding', async () => {
		const unexpectedError = new Error('claim storage failed');

		spies.push(
			spyOn(onboarding, 'requiresOnboarding').mockResolvedValue(true),
			spyOn(settingsService, 'getApiConfigWithSources').mockResolvedValue(
				createTestApiConfig({
					serverUrl: '',
					token: '',
					serverUrlSource: 'default',
					tokenSource: 'default'
				})
			),
			spyOn(onboarding, 'requireActiveOnboardingClaim').mockRejectedValue(unexpectedError)
		);

		const { createSessionFromPlexToken } = await import('$lib/server/auth/login-completion');
		try {
			await createSessionFromPlexToken('secret-auth-token', createTestCookies());
			throw new Error('Expected setup claim renewal to fail');
		} catch (err) {
			expect(err).toBe(unexpectedError);
			expect(err).not.toBeInstanceOf(OnboardingClaimRequiredError);
		}
	});

	it('allows first-admin creation during fresh onboarding with an active setup claim', async () => {
		spies.push(
			spyOn(onboarding, 'requiresOnboarding').mockResolvedValue(true),
			spyOn(settingsService, 'getApiConfigWithSources').mockResolvedValue(
				createTestApiConfig({
					serverUrl: '',
					token: '',
					serverUrlSource: 'default',
					tokenSource: 'default'
				})
			),
			spyOn(membership, 'verifyServerOwnership').mockResolvedValue({
				isOwner: true,
				serverName: 'Owned Plex'
			})
		);

		const cookies = createTestCookies();
		const token = createBootstrapToken();
		expect(await claimOnboardingInstance(cookies, token)).toBe('claimed');

		const { createSessionFromPlexToken } = await import('$lib/server/auth/login-completion');
		const result = await createSessionFromPlexToken('secret-auth-token', cookies);

		expect(result).toEqual({
			user: { username: 'alice', isAdmin: true },
			redirectTo: '/admin'
		});
	});
});
