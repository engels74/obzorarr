export {
	claimOnboardingInstance,
	clearBootstrapToken,
	clearOnboardingClaim,
	clearOnboardingClaimCookie,
	createBootstrapToken,
	generateBootstrapToken,
	hasActiveOnboardingClaim,
	hasAnyActiveOnboardingClaim,
	isBootstrapTokenExpired,
	ONBOARDING_CLAIM_COOKIE,
	ONBOARDING_CLAIM_REQUIRED_MESSAGE,
	type OnboardingClaimCookieContext,
	OnboardingClaimRequiredError,
	printOnboardingBootstrapBanner,
	renewOnboardingClaim,
	requireActiveOnboardingClaim,
	validateBootstrapToken
} from './bootstrap';

export {
	completeOnboarding,
	getNextStep,
	getOnboardingStatus,
	getOnboardingStep,
	getPreviousStep,
	getStepNumber,
	isOnboardingComplete,
	isPlexConfigured,
	type OnboardingStatus,
	type OnboardingStep,
	OnboardingSteps,
	requiresOnboarding,
	resetOnboarding,
	setOnboardingStep
} from './status';
