import {
	getAppSetting,
	setAppSetting,
	deleteAppSetting,
	AppSettingsKey,
	getApiConfigWithSources
} from '$lib/server/admin/settings.service';

export const OnboardingSteps = {
	CSRF: 'csrf',
	PLEX: 'plex',
	SYNC: 'sync',
	SETTINGS: 'settings',
	COMPLETE: 'complete'
} as const;

export type OnboardingStep = (typeof OnboardingSteps)[keyof typeof OnboardingSteps];

export interface OnboardingStatus {
	isComplete: boolean;
	currentStep: OnboardingStep;
	hasPlexConfig: boolean;
}

export async function requiresOnboarding(): Promise<boolean> {
	const completed = await getAppSetting(AppSettingsKey.ONBOARDING_COMPLETED);
	return completed !== 'true';
}

export async function isOnboardingComplete(): Promise<boolean> {
	const completed = await getAppSetting(AppSettingsKey.ONBOARDING_COMPLETED);
	return completed === 'true';
}

export async function getOnboardingStep(): Promise<OnboardingStep> {
	const step = await getAppSetting(AppSettingsKey.ONBOARDING_CURRENT_STEP);

	// Validate the step is a valid OnboardingStep
	if (step && Object.values(OnboardingSteps).includes(step as OnboardingStep)) {
		return step as OnboardingStep;
	}

	return OnboardingSteps.CSRF;
}

export async function setOnboardingStep(step: OnboardingStep): Promise<void> {
	await setAppSetting(AppSettingsKey.ONBOARDING_CURRENT_STEP, step);
}

export async function completeOnboarding(): Promise<void> {
	await setAppSetting(AppSettingsKey.ONBOARDING_COMPLETED, 'true');
	await deleteAppSetting(AppSettingsKey.ONBOARDING_CURRENT_STEP);
}

export async function resetOnboarding(): Promise<void> {
	await deleteAppSetting(AppSettingsKey.ONBOARDING_COMPLETED);
	await deleteAppSetting(AppSettingsKey.ONBOARDING_CURRENT_STEP);
}

export async function isPlexConfigured(): Promise<boolean> {
	const config = await getApiConfigWithSources();
	return !!(config.plex.serverUrl.value && config.plex.token.value);
}

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

export function getStepNumber(step: OnboardingStep): number {
	const stepOrder: OnboardingStep[] = [
		OnboardingSteps.CSRF,
		OnboardingSteps.PLEX,
		OnboardingSteps.SYNC,
		OnboardingSteps.SETTINGS,
		OnboardingSteps.COMPLETE
	];
	return stepOrder.indexOf(step) + 1;
}

export function getNextStep(currentStep: OnboardingStep): OnboardingStep | null {
	const stepOrder: OnboardingStep[] = [
		OnboardingSteps.CSRF,
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

export function getPreviousStep(currentStep: OnboardingStep): OnboardingStep | null {
	const stepOrder: OnboardingStep[] = [
		OnboardingSteps.CSRF,
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
