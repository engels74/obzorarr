import type { LayoutServerLoad } from './$types';
import {
	getOnboardingStep,
	isOnboardingComplete,
	getStepNumber,
	OnboardingSteps,
	type OnboardingStep
} from '$lib/server/onboarding';
import {
	getApiConfigWithSources,
	hasPlexEnvConfig,
	getUITheme
} from '$lib/server/admin/settings.service';
import { getServerName } from '$lib/server/plex/server-name.service';
import { redirect } from '@sveltejs/kit';

export const load: LayoutServerLoad = async ({ locals }) => {
	const isComplete = await isOnboardingComplete();
	if (isComplete) {
		redirect(303, locals.user?.isAdmin ? '/admin' : '/');
	}

	const [currentStep, apiConfig, uiTheme] = await Promise.all([
		getOnboardingStep(),
		getApiConfigWithSources(),
		getUITheme()
	]);
	const hasEnvConfigValue = hasPlexEnvConfig();
	const serverName = hasEnvConfigValue ? await getServerName() : null;

	const steps: { id: OnboardingStep; label: string }[] = [
		{ id: OnboardingSteps.CSRF, label: 'Security' },
		{ id: OnboardingSteps.PLEX, label: 'Connect' },
		{ id: OnboardingSteps.SYNC, label: 'Sync' },
		{ id: OnboardingSteps.SETTINGS, label: 'Configure' },
		{ id: OnboardingSteps.COMPLETE, label: 'Done' }
	];

	return {
		steps,
		currentStep,
		currentStepIndex: getStepNumber(currentStep) - 1,
		totalSteps: steps.length,
		isAuthenticated: !!locals.user,
		isAdmin: locals.user?.isAdmin ?? false,
		username: locals.user?.username,
		hasEnvConfig: hasEnvConfigValue,
		plexConfigured: !!(apiConfig.plex.serverUrl.value && apiConfig.plex.token.value),
		plexServerUrl: apiConfig.plex.serverUrl.value,
		plexConfigSource: apiConfig.plex.serverUrl.source,
		plexServerName: serverName,
		uiTheme
	};
};
