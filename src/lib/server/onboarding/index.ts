/**
 * Onboarding Module
 *
 * Provides services for managing the first-time setup flow.
 *
 * @module onboarding
 */

export {
	// Types
	OnboardingSteps,
	type OnboardingStep,
	type OnboardingStatus,
	// Status functions
	requiresOnboarding,
	isOnboardingComplete,
	getOnboardingStep,
	setOnboardingStep,
	completeOnboarding,
	resetOnboarding,
	isPlexConfigured,
	getOnboardingStatus,
	// Helpers
	getStepNumber,
	getNextStep,
	getPreviousStep
} from './status';
