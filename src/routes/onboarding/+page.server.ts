import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { getOnboardingStep } from '$lib/server/onboarding';

/**
 * Root onboarding page redirects to current step
 */
export const load: PageServerLoad = async () => {
	const step = await getOnboardingStep();
	redirect(303, `/onboarding/${step}`);
};
