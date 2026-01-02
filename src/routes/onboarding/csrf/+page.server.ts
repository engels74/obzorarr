import type { PageServerLoad, Actions } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import {
	getCsrfConfigWithSource,
	setAppSetting,
	AppSettingsKey
} from '$lib/server/admin/settings.service';
import { setOnboardingStep, OnboardingSteps } from '$lib/server/onboarding';
import { logger } from '$lib/server/logging';

const CsrfOriginSchema = z.object({
	csrfOrigin: z
		.string()
		.min(1, 'Origin URL is required')
		.url('Invalid URL format')
		.refine((url) => url.startsWith('http://') || url.startsWith('https://'), {
			message: 'Origin must start with http:// or https://'
		})
		.transform((url) => {
			try {
				const parsed = new URL(url);
				return parsed.origin;
			} catch {
				return url;
			}
		})
});

export const load: PageServerLoad = async ({ request, parent }) => {
	const parentData = await parent();
	const csrfConfig = await getCsrfConfigWithSource();

	const forwardedProto = request.headers.get('x-forwarded-proto');
	const forwardedHost = request.headers.get('x-forwarded-host');
	const isReverseProxy = !!(forwardedProto || forwardedHost);

	let detectedOrigin: string;
	if (forwardedProto && forwardedHost) {
		const proto = forwardedProto.includes('https') ? 'https' : 'http';
		detectedOrigin = `${proto}://${forwardedHost}`;
	} else {
		detectedOrigin = new URL(request.url).origin;
	}

	return {
		...parentData,
		csrfConfig: csrfConfig.origin,
		detection: {
			isReverseProxy,
			detectedOrigin,
			forwardedProto,
			forwardedHost
		}
	};
};

export const actions: Actions = {
	saveOrigin: async ({ request }) => {
		const formData = await request.formData();
		const result = CsrfOriginSchema.safeParse({
			csrfOrigin: formData.get('csrfOrigin')
		});

		if (!result.success) {
			const errorMessage = result.error.issues[0]?.message ?? 'Invalid input';
			return fail(400, { error: errorMessage });
		}

		await setAppSetting(AppSettingsKey.CSRF_ORIGIN, result.data.csrfOrigin);
		logger.info(`Onboarding: CSRF origin configured - ${result.data.csrfOrigin}`, 'Onboarding');

		await setOnboardingStep(OnboardingSteps.PLEX);
		redirect(303, '/onboarding/plex');
	},

	skipCsrf: async () => {
		logger.info('Onboarding: CSRF configuration skipped', 'Onboarding');

		await setOnboardingStep(OnboardingSteps.PLEX);
		redirect(303, '/onboarding/plex');
	}
};
