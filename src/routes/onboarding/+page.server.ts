import { redirect } from '@sveltejs/kit';
import { getOnboardingStep } from '$lib/server/onboarding';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const step = await getOnboardingStep();
	redirect(303, `/onboarding/${step}`);
};
