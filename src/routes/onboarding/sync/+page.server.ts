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

export const actions: Actions = {
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

	continue: async ({ locals }) => {
		if (!locals.user?.isAdmin) {
			return fail(403, { error: 'Admin access required' });
		}

		logger.info('Onboarding: Proceeding to settings (sync may still be running)', 'Onboarding');

		await setOnboardingStep(OnboardingSteps.SETTINGS);
		redirect(303, '/onboarding/settings');
	}
};
