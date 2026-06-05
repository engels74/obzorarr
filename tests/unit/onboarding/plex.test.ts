import { beforeEach, describe, expect, it, spyOn } from 'bun:test';
import * as membershipModule from '$lib/server/auth/membership';
import * as sessionModule from '$lib/server/auth/session';
import { getOnboardingStep, OnboardingSteps } from '$lib/server/onboarding';
import * as serverIdentityModule from '$lib/server/plex/server-identity.service';
import { actions, load } from '../../../src/routes/onboarding/plex/+page.server';
import {
	claimOnboardingCookies,
	createOnboardingCookies,
	expectRedirect,
	resetOnboardingTestState
} from '../../helpers/onboarding';

type VerifyAdminAction = NonNullable<typeof actions.verifyAdmin>;

const verifyAdmin = actions.verifyAdmin as VerifyAdminAction;
const ownerLocals = {
	user: { id: 1, plexId: 100, username: 'owner', isAdmin: true }
} as unknown as App.Locals;

function parentData(overrides: Record<string, unknown> = {}) {
	return {
		hasEnvConfig: false,
		isAuthenticated: false,
		isAdmin: false,
		username: null,
		plexConfigured: false,
		plexServerUrl: '',
		plexConfigSource: 'default' as const,
		plexServerName: null,
		uiTheme: 'default',
		...overrides
	};
}

function invokeVerifyAdmin(cookies = createOnboardingCookies('session-id')) {
	return verifyAdmin({
		locals: ownerLocals,
		cookies,
		url: new URL('http://localhost/onboarding/plex')
	} as unknown as Parameters<VerifyAdminAction>[0]);
}

describe('onboarding Plex load', () => {
	beforeEach(resetOnboardingTestState);

	it.each([
		['unauthenticated parent', parentData()],
		[
			'authenticated configured parent',
			parentData({
				isAuthenticated: true,
				isAdmin: true,
				username: 'admin',
				plexConfigured: true,
				plexServerUrl: 'https://test-plex-server:32400',
				plexConfigSource: 'env'
			})
		]
	] as const)('threads per-field ENV lock info for %s', async (_name, parent) => {
		const result = (await load({ parent: async () => parent } as unknown as Parameters<
			typeof load
		>[0])) as {
			plexServerUrlLocked: boolean;
			plexTokenLocked: boolean;
			plexTokenHasValue: boolean;
		};

		expect(result.plexServerUrlLocked).toBe(true);
		expect(result.plexTokenLocked).toBe(true);
		expect(result.plexTokenHasValue).toBe(true);
	});

	it('refreshes configured machine identity when hasEnvConfig=true', async () => {
		const spy = spyOn(serverIdentityModule, 'refreshConfiguredServerMachineId').mockResolvedValue({
			machineId: 'mock-machine-id',
			source: 'fresh' as const,
			errorReason: null
		});

		try {
			const result = (await load({
				parent: async () =>
					parentData({
						hasEnvConfig: true,
						isAuthenticated: true,
						isAdmin: true,
						username: 'admin',
						plexConfigured: true,
						plexServerUrl: 'https://test-plex-server:32400',
						plexConfigSource: 'env',
						plexServerName: 'My Plex'
					})
			} as unknown as Parameters<typeof load>[0])) as {
				configuredMachineId: string | null;
				configuredUrlReachable: boolean;
				plexServerUrlLocked: boolean;
				plexTokenLocked: boolean;
				plexTokenHasValue: boolean;
			};

			expect(spy).toHaveBeenCalledTimes(1);
			expect(result.configuredMachineId).toBe('mock-machine-id');
			expect(result.configuredUrlReachable).toBe(true);
			expect(result.plexServerUrlLocked).toBe(true);
			expect(result.plexTokenLocked).toBe(true);
			expect(result.plexTokenHasValue).toBe(true);
		} finally {
			spy.mockRestore();
		}
	});
});

describe('onboarding Plex owner verification', () => {
	beforeEach(resetOnboardingTestState);

	it('allows the server owner to complete Plex setup verification', async () => {
		const cookies = await claimOnboardingCookies(createOnboardingCookies('session-id'));
		const getTokenSpy = spyOn(sessionModule, 'getSessionPlexToken').mockResolvedValue('plex-token');
		const membershipSpy = spyOn(membershipModule, 'verifyServerMembership').mockResolvedValue({
			isMember: true,
			isOwner: true
		});

		try {
			await expectRedirect(() => invokeVerifyAdmin(cookies), '/onboarding/sync');
		} finally {
			getTokenSpy.mockRestore();
			membershipSpy.mockRestore();
		}

		expect(await getOnboardingStep()).toBe(OnboardingSteps.SYNC);
	});

	it('rejects non-owner Plex members with the owner-only setup message', async () => {
		const cookies = await claimOnboardingCookies(createOnboardingCookies('session-id'));
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
		} finally {
			getTokenSpy.mockRestore();
			membershipSpy.mockRestore();
		}

		expect(await getOnboardingStep()).not.toBe(OnboardingSteps.SYNC);
	});
});
