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

	const forwardedProtoRaw = request.headers.get('x-forwarded-proto');
	const forwardedHostRaw = request.headers.get('x-forwarded-host');
	const forwardedProto = forwardedProtoRaw?.split(',')[0]?.trim();
	const forwardedHost = forwardedHostRaw?.split(',')[0]?.trim();
	const isReverseProxy = !!(forwardedProto || forwardedHost);

	const requestUrl = new URL(request.url);
	let detectedOrigin: string;
	if (forwardedHost) {
		const proto = forwardedProto?.includes('https')
			? 'https'
			: forwardedProto || requestUrl.protocol.replace(':', '');
		detectedOrigin = `${proto}://${forwardedHost}`;
	} else {
		detectedOrigin = requestUrl.origin;
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
	testOrigin: async ({ request }) => {
		const formData = await request.formData();
		const proposedOrigin = formData.get('csrfOrigin')?.toString();

		const result = CsrfOriginSchema.safeParse({ csrfOrigin: proposedOrigin });
		if (!result.success) {
			const errorMessage = result.error.issues[0]?.message ?? 'Invalid URL format';
			return fail(400, { testError: errorMessage });
		}

		const actualOrigin = request.headers.get('origin');
		if (!actualOrigin) {
			return fail(400, {
				testError: 'Could not detect browser origin. Ensure you are accessing via HTTP/HTTPS.'
			});
		}

		if (result.data.csrfOrigin.toLowerCase() !== actualOrigin.toLowerCase()) {
			return fail(400, {
				testError: `Origin mismatch: browser sends "${actualOrigin}" but you configured "${result.data.csrfOrigin}"`
			});
		}

		return { testSuccess: true, testedOrigin: result.data.csrfOrigin };
	},

	saveOrigin: async ({ request }) => {
		const csrfConfig = await getCsrfConfigWithSource();
		if (csrfConfig.origin.isLocked) {
			return fail(400, { error: 'CSRF origin is locked via ORIGIN environment variable' });
		}

		const formData = await request.formData();
		const result = CsrfOriginSchema.safeParse({
			csrfOrigin: formData.get('csrfOrigin')
		});

		if (!result.success) {
			const errorMessage = result.error.issues[0]?.message ?? 'Invalid input';
			return fail(400, { error: errorMessage });
		}

		const actualOrigin = request.headers.get('origin');
		if (!actualOrigin) {
			return fail(400, {
				error: 'Could not detect browser origin. Ensure you are accessing via HTTP/HTTPS.'
			});
		}

		if (result.data.csrfOrigin.toLowerCase() !== actualOrigin.toLowerCase()) {
			return fail(400, {
				error: `Origin mismatch: browser sends "${actualOrigin}" but you configured "${result.data.csrfOrigin}"`
			});
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
