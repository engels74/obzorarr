/**
 * Onboarding Step 4: Completion
 *
 * Marks onboarding as complete and shows success message.
 * Provides summary of configuration and link to dashboard.
 */

import { fail, redirect } from '@sveltejs/kit';
import {
	getAnonymizationMode,
	getApiConfigWithSources,
	getCachedServerName,
	getFunFactFrequency,
	getUITheme,
	getWrappedLogoMode,
	getWrappedTheme
} from '$lib/server/admin/settings.service';
import { logger } from '$lib/server/logging';
import {
	clearOnboardingClaimCookie,
	completeOnboarding,
	OnboardingClaimRequiredError,
	requireActiveOnboardingClaim
} from '$lib/server/onboarding';
import { getGlobalAllowUserControl, getGlobalDefaultShareMode } from '$lib/server/sharing/service';
import { getPlayHistoryCount, getSyncProgress, isSyncRunning } from '$lib/server/sync';
import type { Actions, PageServerLoad } from './$types';

/**
 * Load function - marks onboarding complete and provides summary
 */
export const load: PageServerLoad = async ({ parent, locals, url, cookies }) => {
	if (!locals.user?.isAdmin) {
		redirect(303, '/onboarding/claim');
	}

	try {
		await requireActiveOnboardingClaim(cookies, { requestUrl: url });
	} catch (err) {
		if (err instanceof OnboardingClaimRequiredError) {
			redirect(303, '/onboarding/claim');
		}
		throw err;
	}

	const parentData = await parent();
	const notice = url.searchParams.get('notice');

	// Get sync status (may still be running)
	const syncRunning = await isSyncRunning();
	const syncProgress = getSyncProgress();
	const historyCount = await getPlayHistoryCount();

	// Get configured settings for summary
	const [
		serverName,
		uiTheme,
		wrappedTheme,
		anonymizationMode,
		logoMode,
		shareMode,
		allowUserControl,
		funFactFrequency,
		apiConfig
	] = await Promise.all([
		getCachedServerName(),
		getUITheme(),
		getWrappedTheme(),
		getAnonymizationMode(),
		getWrappedLogoMode(),
		getGlobalDefaultShareMode(),
		getGlobalAllowUserControl(),
		getFunFactFrequency(),
		getApiConfigWithSources()
	]);

	// Fun facts are only active when an effective OpenAI API key is present.
	// Without a key the engine falls back to built-in templates only, but the
	// onboarding "Configure" step treats that as AI fun facts being off.
	const enableFunFacts = Boolean(apiConfig.openai.apiKey.value.trim());

	return {
		...parentData,
		notice: notice === 'ai-key-missing' ? 'ai-key-missing' : null,
		syncStatus: {
			running: syncRunning,
			progress: syncProgress,
			historyCount
		},
		enableFunFacts,
		configSummary: {
			serverName: serverName || 'Plex Server',
			uiTheme: formatThemeName(uiTheme),
			wrappedTheme: formatThemeName(wrappedTheme),
			anonymizationMode: formatAnonymizationMode(anonymizationMode),
			logoMode: formatLogoMode(logoMode),
			shareMode: formatShareMode(shareMode),
			allowUserControl: allowUserControl ? 'Allowed' : 'Locked by admin',
			funFacts: deriveFunFactsSummary(enableFunFacts, notice === 'ai-key-missing', funFactFrequency)
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

function formatLogoMode(mode: string): string {
	const modes: Record<string, string> = {
		always_show: 'Always Show',
		always_hide: 'Always Hide',
		user_choice: 'User Choice'
	};
	return modes[mode] || mode;
}

function formatFunFactFrequency(config: { mode: string; count: number }): string {
	if (config.mode === 'custom') return `Custom (${config.count})`;
	return `${formatThemeName(config.mode)} (${config.count})`;
}

/**
 * Derive the "Fun Facts" summary label for the onboarding Done step.
 *
 * The summary must distinguish three states the old `enableFunFacts ? ... :
 * 'Disabled'` copy collapsed into two:
 *  - an effective OpenAI key is present  -> AI fun facts on, show the frequency;
 *  - no key but the user enabled AI fun facts during Configure (signalled by the
 *    `ai-key-missing` notice) -> built-in templates are used, so it is "template
 *    mode", not disabled;
 *  - no key and fun facts were left off  -> genuinely "Disabled".
 */
function deriveFunFactsSummary(
	hasOpenAiKey: boolean,
	aiKeyMissing: boolean,
	frequency: { mode: string; count: number }
): string {
	if (hasOpenAiKey) {
		return formatFunFactFrequency(frequency);
	}
	if (aiKeyMissing) {
		return 'Template mode — add an OpenAI key to enable AI';
	}
	return 'Disabled';
}

async function requireOnboardingCompleteClaim(
	cookies: Parameters<NonNullable<Actions['goToDashboard']>>[0]['cookies'],
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

/**
 * Form actions
 */
export const actions: Actions = {
	/**
	 * Go to dashboard
	 */
	goToDashboard: async ({ locals, cookies, url }) => {
		const guardResult = await requireOnboardingCompleteClaim(cookies, url);
		if (guardResult) return guardResult;

		if (!locals.user?.isAdmin) {
			return fail(403, { error: 'Admin access required' });
		}
		await completeOnboarding();
		clearOnboardingClaimCookie(cookies);
		logger.info(`Onboarding completed by ${locals.user?.username || 'unknown'}`, 'Onboarding');
		redirect(303, '/admin');
	}
};
