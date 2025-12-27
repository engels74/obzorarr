/**
 * Onboarding Step 1: Plex Configuration
 *
 * Handles two flows:
 * 1. ENV vars configured: Verify admin and proceed
 * 2. No ENV vars: Select server after OAuth
 */

import type { PageServerLoad, Actions } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { setOnboardingStep, OnboardingSteps } from '$lib/server/onboarding';
import { verifyServerMembership } from '$lib/server/auth/membership';
import { getSessionPlexToken } from '$lib/server/auth/session';
import { logger } from '$lib/server/logging';

/**
 * Load function - provides step data
 */
export const load: PageServerLoad = async ({ parent, locals }) => {
	const parentData = await parent();

	// If user is authenticated and admin, check if they can proceed
	const canProceed = parentData.hasEnvConfig && parentData.isAuthenticated && parentData.isAdmin;

	return {
		...parentData,
		canProceed,
		// If not admin but authenticated, show error
		isNonAdminUser: parentData.isAuthenticated && !parentData.isAdmin
	};
};

/**
 * Form actions
 */
export const actions: Actions = {
	/**
	 * Verify admin and proceed (for ENV-configured setups)
	 */
	verifyAdmin: async ({ locals, cookies }) => {
		if (!locals.user) {
			return fail(401, { error: 'Please sign in with Plex first' });
		}

		// Get session to verify membership
		const sessionId = cookies.get('session');
		if (!sessionId) {
			return fail(401, { error: 'Session not found' });
		}

		try {
			const plexToken = await getSessionPlexToken(sessionId);
			if (!plexToken) {
				return fail(401, { error: 'Session expired. Please sign in again.' });
			}

			// Verify user is server owner
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

			// Update user admin status if needed (in case it wasn't set correctly)
			// The session already has isAdmin from the OAuth flow

			logger.info(`Onboarding: Admin verified - ${locals.user.username}`, 'Onboarding');

			// Advance to sync step
			await setOnboardingStep(OnboardingSteps.SYNC);
			redirect(303, '/onboarding/sync');
		} catch (err) {
			// Handle redirect (expected)
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

	/**
	 * Save selected server (for manual server selection)
	 *
	 * Note: This is called from the client after selecting a server
	 * via the /api/onboarding/select-server endpoint.
	 * This action just advances to the next step.
	 */
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

		// Advance to sync step
		await setOnboardingStep(OnboardingSteps.SYNC);
		redirect(303, '/onboarding/sync');
	}
};
