/**
 * Onboarding Step 2: Initial Data Sync
 *
 * Triggers the initial Plex history sync and shows progress.
 * User can continue to next step while sync runs in background.
 */

import type { PageServerLoad, Actions } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { setOnboardingStep, OnboardingSteps } from '$lib/server/onboarding';
import {
	startBackgroundSync,
	isSyncRunning,
	getSyncProgress,
	getPlayHistoryCount
} from '$lib/server/sync';
import { logger } from '$lib/server/logging';

/**
 * Load function - provides sync status
 */
export const load: PageServerLoad = async ({ parent }) => {
	const parentData = await parent();

	const syncRunning = await isSyncRunning();
	const currentProgress = getSyncProgress();
	const historyCount = await getPlayHistoryCount();
	const currentYear = new Date().getFullYear();

	return {
		...parentData,
		syncRunning,
		currentProgress,
		historyCount,
		currentYear
	};
};

/**
 * Form actions
 */
export const actions: Actions = {
	/**
	 * Start the initial sync
	 */
	startSync: async ({ locals }) => {
		if (!locals.user?.isAdmin) {
			return fail(403, { error: 'Admin access required' });
		}

		try {
			if (await isSyncRunning()) {
				return { success: true, message: 'Sync is already running' };
			}

			const currentYear = new Date().getFullYear();
			const result = await startBackgroundSync(currentYear);

			if (!result.started) {
				return fail(400, { error: result.error || 'Failed to start sync' });
			}

			logger.info(`Onboarding: Initial sync started for year ${currentYear}`, 'Onboarding');

			return { success: true, message: 'Sync started successfully' };
		} catch (err) {
			logger.error(
				`Failed to start sync: ${err instanceof Error ? err.message : String(err)}`,
				'Onboarding'
			);

			return fail(500, { error: 'Failed to start sync. Please try again.' });
		}
	},

	/**
	 * Continue to settings step (sync continues in background)
	 */
	continue: async ({ locals }) => {
		if (!locals.user?.isAdmin) {
			return fail(403, { error: 'Admin access required' });
		}

		logger.info('Onboarding: Proceeding to settings (sync may still be running)', 'Onboarding');

		await setOnboardingStep(OnboardingSteps.SETTINGS);
		redirect(303, '/onboarding/settings');
	}
};
