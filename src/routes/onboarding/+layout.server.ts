import type { LayoutServerLoad } from './$types';
import {
	getOnboardingStep,
	isOnboardingComplete,
	getStepNumber,
	OnboardingSteps,
	type OnboardingStep
} from '$lib/server/onboarding';
import { getApiConfigWithSources, hasPlexEnvConfig } from '$lib/server/admin/settings.service';
import { getServerName } from '$lib/server/plex/server-name.service';
import { redirect } from '@sveltejs/kit';

/**
 * Onboarding Layout Server Load
 *
 * Provides shared data for all onboarding pages:
 * - Current step and total steps
 * - Authentication status
 * - Plex configuration status
 *
 * Redirects to main app if onboarding is already complete.
 */
export const load: LayoutServerLoad = async ({ locals }) => {
	// If onboarding is complete, redirect to appropriate page
	const isComplete = await isOnboardingComplete();
	if (isComplete) {
		redirect(303, locals.user?.isAdmin ? '/admin' : '/');
	}

	const currentStep = await getOnboardingStep();
	const apiConfig = await getApiConfigWithSources();
	const hasEnvConfigValue = hasPlexEnvConfig();

	// Fetch server name if ENV config is present (for display purposes)
	const serverName = hasEnvConfigValue ? await getServerName() : null;

	const steps: { id: OnboardingStep; label: string }[] = [
		{ id: OnboardingSteps.PLEX, label: 'Connect' },
		{ id: OnboardingSteps.SYNC, label: 'Sync' },
		{ id: OnboardingSteps.SETTINGS, label: 'Configure' },
		{ id: OnboardingSteps.COMPLETE, label: 'Done' }
	];

	return {
		// Step information
		steps,
		currentStep,
		currentStepIndex: getStepNumber(currentStep) - 1,
		totalSteps: 4,

		// Auth status
		isAuthenticated: !!locals.user,
		isAdmin: locals.user?.isAdmin ?? false,
		username: locals.user?.username,

		// Plex configuration
		hasEnvConfig: hasEnvConfigValue,
		plexConfigured: !!(apiConfig.plex.serverUrl.value && apiConfig.plex.token.value),
		plexServerUrl: apiConfig.plex.serverUrl.value,
		plexConfigSource: apiConfig.plex.serverUrl.source,
		plexServerName: serverName
	};
};
