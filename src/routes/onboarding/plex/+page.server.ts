import { fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import {
	getApiConfigWithSources,
	setPlexServerUrlOverrideManual
} from '$lib/server/admin/settings.service';
import { verifyServerMembership } from '$lib/server/auth/membership';
import { getSessionPlexToken } from '$lib/server/auth/session';
import { db } from '$lib/server/db/client';
import { sessions, users } from '$lib/server/db/schema';
import { logger } from '$lib/server/logging';
import { isOnboardingComplete, OnboardingSteps, setOnboardingStep } from '$lib/server/onboarding';
import { getConfiguredServerMachineId } from '$lib/server/plex/server-identity.service';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ parent }) => {
	const parentData = await parent();

	const canProceed = parentData.hasEnvConfig && parentData.isAuthenticated && parentData.isAdmin;

	let configuredMachineId: string | null = null;
	let configuredUrlReachable = true;
	let configuredUrlErrorReason: string | null = null;

	if (parentData.hasEnvConfig) {
		const identity = await getConfiguredServerMachineId();
		configuredMachineId = identity.machineId;
		configuredUrlReachable = identity.machineId !== null;
		configuredUrlErrorReason = identity.errorReason;
	}

	return {
		...parentData,
		canProceed,
		isNonAdminUser: parentData.isAuthenticated && !parentData.isAdmin,
		configuredMachineId,
		configuredUrlReachable,
		configuredUrlErrorReason
	};
};

export const actions: Actions = {
	verifyAdmin: async ({ locals, cookies }) => {
		if (!locals.user) {
			return fail(401, { error: 'Please sign in with Plex first' });
		}

		const sessionId = cookies.get('session');
		if (!sessionId) {
			return fail(401, { error: 'Session not found' });
		}

		try {
			const plexToken = await getSessionPlexToken(sessionId);
			if (!plexToken) {
				return fail(401, { error: 'Session expired. Please sign in again.' });
			}

			const membership = await verifyServerMembership(plexToken);

			if (!membership.isMember) {
				const failurePayload: {
					error: string;
					membershipReason?: 'not_reachable' | 'not_in_resources';
					configuredMachineId?: string;
				} = {
					error:
						membership.reason === 'not_reachable'
							? 'Obzorarr could not reach the configured Plex server. Check that PLEX_SERVER_URL and PLEX_TOKEN are correct and the server is online.'
							: 'The configured Plex server is not listed under your Plex.tv account. Sign in with the owner account, or confirm ownership to bypass the check.',
					membershipReason:
						membership.reason === 'not_reachable' ? 'not_reachable' : 'not_in_resources'
				};
				if (membership.configuredMachineId) {
					failurePayload.configuredMachineId = membership.configuredMachineId;
				}
				return fail(403, failurePayload);
			}

			if (!membership.isOwner) {
				return fail(403, {
					error:
						'Only the server owner can configure Obzorarr. Please sign in with the server owner account.'
				});
			}

			logger.info(`Onboarding: Admin verified - ${locals.user.username}`, 'Onboarding');

			await setOnboardingStep(OnboardingSteps.SYNC);
			redirect(303, '/onboarding/sync');
		} catch (err) {
			if (
				err instanceof Response ||
				(err &&
					typeof err === 'object' &&
					'status' in err &&
					(err as { status: number }).status >= 300 &&
					(err as { status: number }).status < 400)
			) {
				throw err;
			}

			logger.error(
				`Admin verification failed: ${err instanceof Error ? err.message : String(err)}`,
				'Onboarding'
			);

			return fail(500, {
				error: 'Failed to verify admin status. Please try again.'
			});
		}
	},

	continueAfterServerSelection: async ({ locals }) => {
		if (!locals.user) {
			return fail(401, { error: 'Please sign in with Plex first' });
		}

		if (!locals.user.isAdmin) {
			return fail(403, {
				error: 'Only the server owner can configure Obzorarr.'
			});
		}

		logger.info(`Onboarding: Server selection complete - ${locals.user.username}`, 'Onboarding');

		await setOnboardingStep(OnboardingSteps.SYNC);
		redirect(303, '/onboarding/sync');
	},

	forceManualSelection: async ({ locals }) => {
		if (!locals.user) {
			return fail(401, { error: 'Please sign in with Plex first' });
		}

		if (!locals.user.isAdmin) {
			return fail(403, { error: 'Only the server owner can configure Obzorarr.' });
		}

		await setPlexServerUrlOverrideManual(true);

		logger.info(
			`Onboarding: Manual server selection override enabled by ${locals.user.username}`,
			'Onboarding'
		);

		redirect(303, '/onboarding/plex');
	},

	confirmOwnershipOverride: async ({ locals, cookies }) => {
		if (!locals.user) {
			return fail(401, { error: 'Please sign in with Plex first' });
		}

		if (await isOnboardingComplete()) {
			return fail(403, {
				error: 'Onboarding is already complete. Admin status cannot be changed from this page.'
			});
		}

		const sessionId = cookies.get('session');
		if (!sessionId) {
			return fail(401, { error: 'Session not found' });
		}

		const identity = await getConfiguredServerMachineId();
		if (!identity.machineId) {
			return fail(400, {
				error:
					'The configured server is not reachable, so ownership cannot be verified. Choose a different server.'
			});
		}

		const apiConfig = await getApiConfigWithSources();
		const configuredUrl = apiConfig.plex.serverUrl.value;

		const userId = locals.user.id;
		await db.transaction(async (tx) => {
			await tx.update(sessions).set({ isAdmin: true }).where(eq(sessions.id, sessionId));
			await tx.update(users).set({ isAdmin: true, accountId: 1 }).where(eq(users.id, userId));
		});

		logger.warn(
			`Onboarding: Admin override used for ${configuredUrl} machineId=${identity.machineId} user=${locals.user.username}`,
			'Onboarding'
		);

		await setOnboardingStep(OnboardingSteps.SYNC);
		redirect(303, '/onboarding/sync');
	}
};
