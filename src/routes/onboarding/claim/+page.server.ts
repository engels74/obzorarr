import { fail, redirect } from '@sveltejs/kit';
import {
	claimOnboardingInstance,
	OnboardingSteps,
	setOnboardingStep
} from '$lib/server/onboarding';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ parent }) => {
	return parent();
};

export const actions: Actions = {
	claimInstance: async ({ request, cookies }) => {
		const formData = await request.formData();
		const token = formData.get('token')?.toString().trim() ?? '';

		const result = await claimOnboardingInstance(cookies, token);
		switch (result) {
			case 'claimed':
			case 'renewed':
				await setOnboardingStep(OnboardingSteps.CSRF);
				redirect(303, '/onboarding/csrf');
				break;
			case 'already-claimed':
				return fail(409, {
					error:
						'Setup is already claimed in another browser. Wait for the claim to expire and try again.'
				});
			case 'invalid-token':
				return fail(400, { error: 'Invalid or expired bootstrap token' });
		}
	}
};
