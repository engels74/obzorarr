import { fail, redirect } from '@sveltejs/kit';
import { logger } from '$lib/server/logging';
import {
	OnboardingClaimRequiredError,
	OnboardingSteps,
	requireActiveOnboardingClaim,
	setOnboardingStep
} from '$lib/server/onboarding';
import {
	getPlayHistoryCount,
	getSyncProgress,
	isSyncRunning,
	startBackgroundSync
} from '$lib/server/sync';
import { cancelSync } from '$lib/server/sync/progress';
import type { Actions, PageServerLoad } from './$types';

async function requireOnboardingSyncClaim(
	cookies: Parameters<NonNullable<Actions['startSync']>>[0]['cookies'],
	url: URL
) {
	try {
		await requireActiveOnboardingClaim(cookies, { requestUrl: url });
	} catch (err) {
		if (err instanceof OnboardingClaimRequiredError) {
			return fail(403, { error: err.message });
		}
		throw err;
	}
	return null;
}

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
	startSync: async ({ locals, cookies, url }) => {
		const guardResult = await requireOnboardingSyncClaim(cookies, url);
		if (guardResult) return guardResult;

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

	cancelSync: async ({ locals, cookies, url }) => {
		const guardResult = await requireOnboardingSyncClaim(cookies, url);
		if (guardResult) return guardResult;

		if (!locals.user?.isAdmin) {
			return fail(403, { error: 'Admin access required' });
		}

		const cancelled = cancelSync();

		if (!cancelled) {
			return fail(400, { error: 'No sync is currently running' });
		}

		return { success: true, message: 'Sync cancelled' };
	},

	continue: async ({ locals, cookies, url }) => {
		const guardResult = await requireOnboardingSyncClaim(cookies, url);
		if (guardResult) return guardResult;

		if (!locals.user?.isAdmin) {
			return fail(403, { error: 'Admin access required' });
		}

		logger.info('Onboarding: Proceeding to settings (sync may still be running)', 'Onboarding');

		await setOnboardingStep(OnboardingSteps.SETTINGS);
		redirect(303, '/onboarding/settings');
	},

	// Rewind to the Plex connection step. A running sync is decoupled from the
	// request lifecycle (see startBackgroundSync), so it keeps running in the
	// background; stepping back only moves the onboarding cursor.
	goBack: async ({ cookies, url }) => {
		const guardResult = await requireOnboardingSyncClaim(cookies, url);
		if (guardResult) return guardResult;

		await setOnboardingStep(OnboardingSteps.PLEX);
		redirect(303, '/onboarding/plex');
	}
};
