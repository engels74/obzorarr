import type { PageServerLoad, Actions } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { setOnboardingStep, OnboardingSteps } from '$lib/server/onboarding';
import { verifyServerMembership } from '$lib/server/auth/membership';
import { getSessionPlexToken } from '$lib/server/auth/session';
import { logger } from '$lib/server/logging';

export const load: PageServerLoad = async ({ parent, locals }) => {
	const parentData = await parent();

	const canProceed = parentData.hasEnvConfig && parentData.isAuthenticated && parentData.isAdmin;

	return {
		...parentData,
		canProceed,
		isNonAdminUser: parentData.isAuthenticated && !parentData.isAdmin
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
				return fail(403, {
					error: 'You are not a member of the configured Plex server.'
				});
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
	}
};
