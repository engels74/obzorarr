/**
 * Onboarding Step 4: Completion
 *
 * Marks onboarding as complete and shows success message.
 * Provides summary of configuration and link to dashboard.
 */

import type { PageServerLoad, Actions } from './$types';
import { redirect } from '@sveltejs/kit';
import { completeOnboarding } from '$lib/server/onboarding';
import { isSyncRunning, getSyncProgress, getPlayHistoryCount } from '$lib/server/sync';
import {
	getUITheme,
	getWrappedTheme,
	getAnonymizationMode
} from '$lib/server/admin/settings.service';
import { getGlobalDefaultShareMode } from '$lib/server/sharing/service';
import { getCachedServerName } from '$lib/server/admin/settings.service';
import { logger } from '$lib/server/logging';

/**
 * Load function - marks onboarding complete and provides summary
 */
export const load: PageServerLoad = async ({ parent, locals }) => {
	const parentData = await parent();

	// Complete onboarding
	await completeOnboarding();

	logger.info(`Onboarding completed by ${locals.user?.username || 'unknown'}`, 'Onboarding');

	// Get sync status (may still be running)
	const syncRunning = await isSyncRunning();
	const syncProgress = getSyncProgress();
	const historyCount = await getPlayHistoryCount();

	// Get configured settings for summary
	const [serverName, uiTheme, wrappedTheme, anonymizationMode, shareMode] = await Promise.all([
		getCachedServerName(),
		getUITheme(),
		getWrappedTheme(),
		getAnonymizationMode(),
		getGlobalDefaultShareMode()
	]);

	return {
		...parentData,
		syncStatus: {
			running: syncRunning,
			progress: syncProgress,
			historyCount
		},
		configSummary: {
			serverName: serverName || 'Plex Server',
			uiTheme: formatThemeName(uiTheme),
			wrappedTheme: formatThemeName(wrappedTheme),
			anonymizationMode: formatAnonymizationMode(anonymizationMode),
			shareMode: formatShareMode(shareMode)
		}
	};
};

/**
 * Format theme name for display
 */
function formatThemeName(theme: string): string {
	return theme
		.split('-')
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(' ');
}

/**
 * Format anonymization mode for display
 */
function formatAnonymizationMode(mode: string): string {
	const modes: Record<string, string> = {
		real: 'Real Names',
		anonymous: 'Anonymous',
		hybrid: 'Hybrid'
	};
	return modes[mode] || mode;
}

/**
 * Format share mode for display
 */
function formatShareMode(mode: string): string {
	const modes: Record<string, string> = {
		public: 'Public',
		'private-oauth': 'Server Members Only',
		'private-link': 'Private Link'
	};
	return modes[mode] || mode;
}

/**
 * Form actions
 */
export const actions: Actions = {
	/**
	 * Go to dashboard
	 */
	goToDashboard: async () => {
		redirect(303, '/admin');
	}
};
