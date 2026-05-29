import { redirect } from '@sveltejs/kit';
import {
	getApiConfigWithSources,
	getUITheme,
	hasPlexEnvConfig
} from '$lib/server/admin/settings.service';
import {
	getOnboardingStep,
	getStepNumber,
	hasActiveOnboardingClaim,
	isOnboardingComplete,
	type OnboardingStep,
	OnboardingSteps
} from '$lib/server/onboarding';
import { getServerName } from '$lib/server/plex/server-name.service';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ cookies, locals, url }) => {
	const isComplete = await isOnboardingComplete();
	if (isComplete) {
		redirect(303, locals.user?.isAdmin ? '/admin' : '/');
	}

	const currentStep = await getOnboardingStep();
	const requestedPath = url.pathname;
	const isClaimPath = requestedPath === '/onboarding/claim';
	const hasActiveClaim = await hasActiveOnboardingClaim(cookies);

	if (!hasActiveClaim && !isClaimPath) {
		redirect(303, '/onboarding/claim');
	}

	const isOnCompleteWithoutAdmin =
		currentStep === OnboardingSteps.COMPLETE && !locals.user?.isAdmin;

	if (
		hasActiveClaim &&
		!isOnCompleteWithoutAdmin &&
		requestedPath !== '/onboarding' &&
		!requestedPath.startsWith(`/onboarding/${currentStep}`)
	) {
		redirect(303, `/onboarding/${currentStep}`);
	}

	const displayedStep = !hasActiveClaim && isClaimPath ? OnboardingSteps.CLAIM : currentStep;

	const [apiConfig, uiTheme] = await Promise.all([getApiConfigWithSources(), getUITheme()]);
	const hasEnvConfigValue = hasPlexEnvConfig();
	const serverName = hasEnvConfigValue ? await getServerName() : null;

	const steps: { id: OnboardingStep; label: string }[] = [
		{ id: OnboardingSteps.CLAIM, label: 'Claim' },
		{ id: OnboardingSteps.CSRF, label: 'Security' },
		{ id: OnboardingSteps.PROXY_TRUST, label: 'Reverse proxy' },
		{ id: OnboardingSteps.PLEX, label: 'Connect' },
		{ id: OnboardingSteps.SYNC, label: 'Sync' },
		{ id: OnboardingSteps.SETTINGS, label: 'Configure' },
		{ id: OnboardingSteps.COMPLETE, label: 'Done' }
	];

	return {
		steps,
		currentStep: displayedStep,
		currentStepIndex: getStepNumber(displayedStep) - 1,
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
