import { redirect } from '@sveltejs/kit';
import {
	getApiConfigWithSources,
	getUITheme,
	hasPlexEnvConfig
} from '$lib/server/admin/settings.service';
import {
	getOnboardingStep,
	getStepNumber,
	isOnboardingComplete,
	type OnboardingStep,
	OnboardingSteps
} from '$lib/server/onboarding';
import { getServerName } from '$lib/server/plex/server-name.service';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	const isComplete = await isOnboardingComplete();
	if (isComplete) {
		redirect(303, locals.user?.isAdmin ? '/admin' : '/');
	}

	const currentStep = await getOnboardingStep();
	const requestedPath = url.pathname;

	if (requestedPath !== '/onboarding' && !requestedPath.startsWith(`/onboarding/${currentStep}`)) {
		redirect(303, `/onboarding/${currentStep}`);
	}

	const [apiConfig, uiTheme] = await Promise.all([getApiConfigWithSources(), getUITheme()]);
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
