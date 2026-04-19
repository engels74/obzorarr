import { fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { getApiConfigWithSources, hasPlexEnvConfig } from '$lib/server/admin/settings.service';
import { messageForMembershipFailure, verifyServerMembership } from '$lib/server/auth/membership';
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
					error: messageForMembershipFailure(membership),
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

		// When PLEX_SERVER_URL / PLEX_TOKEN are set as environment variables they
		// take unconditional precedence over any database value in getPlexConfig().
		// Letting the user proceed through the manual picker would silently write
		// DB values that the rest of the application ignores, creating a confusing
		// "I configured a different server but nothing changed" experience.
		// The correct remediation is to update or remove the env vars.
		if (hasPlexEnvConfig()) {
			return fail(400, {
				error:
					'PLEX_SERVER_URL / PLEX_TOKEN are set as environment variables and cannot be overridden from the UI. To use a different server, update those environment variables and restart Obzorarr.'
			});
		}

		// No override flag is persisted: when env is absent the DB is already
		// authoritative. Writing a flag here would be dead state today and a
		// footgun later — a pre-existing `true` would silently bypass the env
		// guard above if env vars were added in a future boot.

		logger.info(
			`Onboarding: Manual server selection requested by ${locals.user.username}`,
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
