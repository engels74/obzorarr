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
	OnboardingSteps,
	renewOnboardingClaim
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

	// ISSUE-002: renew the claim on every onboarding page load so it survives the
	// off-site Plex OAuth round-trip. The return path (`/auth/plex/redirect`) lands
	// back on an onboarding `load`, not an onboarding *action*, so without renewing
	// here a slow OAuth could lapse the claim and wrongly demand "Setup claim
	// required" after the owner already authenticated. Renewal still requires the
	// existing valid claim cookie (anti-theft preserved) and is best-effort: a
	// failed renewal must never block the onboarding page from rendering.
	if (hasActiveClaim) {
		try {
			await renewOnboardingClaim(cookies, { requestUrl: url });
		} catch {
			// Keep the current expiry rather than breaking the page on a write error.
		}
	}

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

	const plexServerUrlLocked = apiConfig.plex.serverUrl.isLocked;

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
		// Never ship the raw URL to the client when it is ENV-locked — mirror the
		// token masking pattern (toSafeConfigValue). The Svelte page uses
		// plexServerUrlLocked to show a placeholder instead of the real value.
		plexServerUrl: plexServerUrlLocked ? '' : apiConfig.plex.serverUrl.value,
		plexServerUrlLocked,
		plexConfigSource: apiConfig.plex.serverUrl.source,
		plexServerName: serverName,
		uiTheme
	};
};
