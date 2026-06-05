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
	// DF-012 (wontfix): the `?/claimInstance` action name appears in the form POST
	// URL. This is standard SvelteKit named-form-action behavior — the action name
	// is a routing selector, not a secret, and exposing it is not an auth bypass or
	// enumeration risk (the actual claim is gated by the bootstrap token validated
	// inside claimOnboardingInstance). No change needed.
	claimInstance: async ({ request, cookies, url }) => {
		const formData = await request.formData();
		const token = formData.get('token')?.toString().trim() ?? '';

		const result = await claimOnboardingInstance(cookies, token, { requestUrl: url });
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
