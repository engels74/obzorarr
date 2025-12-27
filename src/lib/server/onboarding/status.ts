/**
 * Onboarding Status Service
 *
 * Manages the onboarding flow state and determines whether
 * the application requires initial setup.
 *
 * @module onboarding/status
 */

import {
	getAppSetting,
	setAppSetting,
	deleteAppSetting,
	AppSettingsKey,
	getApiConfigWithSources
} from '$lib/server/admin/settings.service';

// =============================================================================
// Types
// =============================================================================

/**
 * Valid onboarding steps
 */
export const OnboardingSteps = {
	PLEX: 'plex',
	SYNC: 'sync',
	SETTINGS: 'settings',
	COMPLETE: 'complete'
} as const;

export type OnboardingStep = (typeof OnboardingSteps)[keyof typeof OnboardingSteps];

/**
 * Onboarding status information
 */
export interface OnboardingStatus {
	isComplete: boolean;
	currentStep: OnboardingStep;
	hasPlexConfig: boolean;
}

// =============================================================================
// Status Functions
// =============================================================================

/**
 * Check if onboarding is required
 *
 * Onboarding is required when:
 * - ONBOARDING_COMPLETED is not set to 'true'
 *
 * Even if Plex is configured via environment variables,
 * we still show the full wizard for verification.
 *
 * @returns True if onboarding is required
 */
export async function requiresOnboarding(): Promise<boolean> {
	const completed = await getAppSetting(AppSettingsKey.ONBOARDING_COMPLETED);
	return completed !== 'true';
}

/**
 * Check if onboarding has been completed
 *
 * @returns True if onboarding is complete
 */
export async function isOnboardingComplete(): Promise<boolean> {
	const completed = await getAppSetting(AppSettingsKey.ONBOARDING_COMPLETED);
	return completed === 'true';
}

/**
 * Get the current onboarding step
 *
 * If no step is set, defaults to 'plex' (the first step).
 *
 * @returns The current onboarding step
 */
export async function getOnboardingStep(): Promise<OnboardingStep> {
	const step = await getAppSetting(AppSettingsKey.ONBOARDING_CURRENT_STEP);

	// Validate the step is a valid OnboardingStep
	if (step && Object.values(OnboardingSteps).includes(step as OnboardingStep)) {
		return step as OnboardingStep;
	}

	return OnboardingSteps.PLEX;
}

/**
 * Set the current onboarding step
 *
 * @param step - The step to set as current
 */
export async function setOnboardingStep(step: OnboardingStep): Promise<void> {
	await setAppSetting(AppSettingsKey.ONBOARDING_CURRENT_STEP, step);
}

/**
 * Mark onboarding as completed
 *
 * Sets ONBOARDING_COMPLETED to 'true' and clears the current step.
 */
export async function completeOnboarding(): Promise<void> {
	await setAppSetting(AppSettingsKey.ONBOARDING_COMPLETED, 'true');
	await deleteAppSetting(AppSettingsKey.ONBOARDING_CURRENT_STEP);
}

/**
 * Reset onboarding to initial state
 *
 * Clears both ONBOARDING_COMPLETED and ONBOARDING_CURRENT_STEP.
 * Use with caution - this will force users through onboarding again.
 */
export async function resetOnboarding(): Promise<void> {
	await deleteAppSetting(AppSettingsKey.ONBOARDING_COMPLETED);
	await deleteAppSetting(AppSettingsKey.ONBOARDING_CURRENT_STEP);
}

/**
 * Check if Plex is configured (via database or environment)
 *
 * @returns True if both PLEX_SERVER_URL and PLEX_TOKEN are set
 */
export async function isPlexConfigured(): Promise<boolean> {
	const config = await getApiConfigWithSources();
	return !!(config.plex.serverUrl.value && config.plex.token.value);
}

/**
 * Get full onboarding status
 *
 * @returns Complete onboarding status object
 */
export async function getOnboardingStatus(): Promise<OnboardingStatus> {
	const [isComplete, currentStep, hasPlexConfig] = await Promise.all([
		isOnboardingComplete(),
		getOnboardingStep(),
		isPlexConfigured()
	]);

	return {
		isComplete,
		currentStep,
		hasPlexConfig
	};
}

/**
 * Get the step number (1-based) for a given step
 *
 * @param step - The onboarding step
 * @returns The step number (1-4)
 */
export function getStepNumber(step: OnboardingStep): number {
	const stepOrder: OnboardingStep[] = [
		OnboardingSteps.PLEX,
		OnboardingSteps.SYNC,
		OnboardingSteps.SETTINGS,
		OnboardingSteps.COMPLETE
	];
	return stepOrder.indexOf(step) + 1;
}

/**
 * Get the next step in the onboarding flow
 *
 * @param currentStep - The current step
 * @returns The next step, or null if current is the last step
 */
export function getNextStep(currentStep: OnboardingStep): OnboardingStep | null {
	const stepOrder: OnboardingStep[] = [
		OnboardingSteps.PLEX,
		OnboardingSteps.SYNC,
		OnboardingSteps.SETTINGS,
		OnboardingSteps.COMPLETE
	];
	const currentIndex = stepOrder.indexOf(currentStep);
	if (currentIndex === -1 || currentIndex >= stepOrder.length - 1) {
		return null;
	}
	return stepOrder[currentIndex + 1] ?? null;
}

/**
 * Get the previous step in the onboarding flow
 *
 * @param currentStep - The current step
 * @returns The previous step, or null if current is the first step
 */
export function getPreviousStep(currentStep: OnboardingStep): OnboardingStep | null {
	const stepOrder: OnboardingStep[] = [
		OnboardingSteps.PLEX,
		OnboardingSteps.SYNC,
		OnboardingSteps.SETTINGS,
		OnboardingSteps.COMPLETE
	];
	const currentIndex = stepOrder.indexOf(currentStep);
	if (currentIndex <= 0) {
		return null;
	}
	return stepOrder[currentIndex - 1] ?? null;
}
