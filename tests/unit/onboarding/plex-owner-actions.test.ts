import { beforeEach, describe, expect, it, spyOn } from 'bun:test';
import type { Cookies } from '@sveltejs/kit';
import { isRedirect } from '@sveltejs/kit';
import * as membershipModule from '$lib/server/auth/membership';
import * as sessionModule from '$lib/server/auth/session';
import { db } from '$lib/server/db/client';
import { appSettings } from '$lib/server/db/schema';
import { getOnboardingStep, OnboardingSteps } from '$lib/server/onboarding';
import {
	claimOnboardingInstance,
	clearBootstrapToken,
	createBootstrapToken
} from '$lib/server/onboarding/bootstrap';
import { actions } from '../../../src/routes/onboarding/plex/+page.server';

type VerifyAdminAction = NonNullable<typeof actions.verifyAdmin>;

const ownerLocals = {
	user: { id: 1, plexId: 100, username: 'owner', isAdmin: true }
} as unknown as App.Locals;

const verifyAdmin = actions.verifyAdmin as VerifyAdminAction;

let claimValues = new Map<string, string>();

function makeCookies(): Cookies {
	return {
		get: (name: string) => (name === 'session' ? 'session-id' : claimValues.get(name)),
		getAll: () => [],
		set: (name: string, value: string) => claimValues.set(name, value),
		delete: (name: string) => claimValues.delete(name),
		serialize: () => ''
	} as unknown as Cookies;
}

async function createClaim(cookies: Cookies): Promise<void> {
	const token = createBootstrapToken();
	expect(await claimOnboardingInstance(cookies, token)).toBe('claimed');
}

function invokeVerifyAdmin(cookies: Cookies) {
	return verifyAdmin({
		locals: ownerLocals,
		cookies,
		url: new URL('http://localhost/onboarding/plex')
	} as unknown as Parameters<VerifyAdminAction>[0]);
}

describe('onboarding Plex owner verification', () => {
	beforeEach(async () => {
		await db.delete(appSettings);
		clearBootstrapToken();
		claimValues = new Map();
	});

	it('allows the server owner to complete Plex setup verification', async () => {
		const cookies = makeCookies();
		await createClaim(cookies);
		const getTokenSpy = spyOn(sessionModule, 'getSessionPlexToken').mockResolvedValue('plex-token');
		const membershipSpy = spyOn(membershipModule, 'verifyServerMembership').mockResolvedValue({
			isMember: true,
			isOwner: true
		});

		try {
			await invokeVerifyAdmin(cookies);
			expect.unreachable('Expected redirect to sync step');
		} catch (err) {
			expect(isRedirect(err)).toBe(true);
			if (!isRedirect(err)) throw err;
			expect(err.status).toBe(303);
			expect(err.location).toBe('/onboarding/sync');
		} finally {
			getTokenSpy.mockRestore();
			membershipSpy.mockRestore();
		}

		expect(await getOnboardingStep()).toBe(OnboardingSteps.SYNC);
	});

	it('rejects non-owner Plex members with the owner-only setup message', async () => {
		const cookies = makeCookies();
		await createClaim(cookies);
		const getTokenSpy = spyOn(sessionModule, 'getSessionPlexToken').mockResolvedValue('plex-token');
		const membershipSpy = spyOn(membershipModule, 'verifyServerMembership').mockResolvedValue({
			isMember: true,
			isOwner: false,
			reason: 'not_owner'
		});

		try {
			const result = await invokeVerifyAdmin(cookies);

			expect(result).toMatchObject({
				status: 403,
				data: {
					error:
						'Only the server owner can configure Obzorarr. Please sign in with the server owner account.'
				}
			});
			expect(await getOnboardingStep()).not.toBe(OnboardingSteps.SYNC);
		} finally {
			getTokenSpy.mockRestore();
			membershipSpy.mockRestore();
		}
	});
});
