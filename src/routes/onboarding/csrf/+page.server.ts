import { fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import {
	AppSettingsKey,
	deleteAppSetting,
	getCsrfConfigWithSource,
	setAppSetting
} from '$lib/server/admin/settings.service';
import { logger } from '$lib/server/logging';
import {
	getOnboardingStep,
	isOnboardingComplete,
	OnboardingClaimRequiredError,
	OnboardingSteps,
	requireActiveOnboardingClaim,
	setOnboardingStep
} from '$lib/server/onboarding';
import { parseForwardedProtoHost } from '$lib/server/security/forwarded-headers';
import type { Actions, PageServerLoad } from './$types';

async function isOnboardingCsrfStep(): Promise<boolean> {
	const [done, step] = await Promise.all([isOnboardingComplete(), getOnboardingStep()]);
	return !done && step === OnboardingSteps.CSRF;
}

function getRequestOrigin(request: Request): string | null {
	const origin = request.headers.get('origin');
	if (origin) return origin;

	const referer = request.headers.get('referer');
	if (!referer) return null;

	try {
		return new URL(referer).origin;
	} catch {
		return null;
	}
}

function normalizeOrigin(origin: string): string | null {
	try {
		return new URL(origin).origin.toLowerCase();
	} catch {
		return null;
	}
}

function originsMatch(left: string, right: string): boolean {
	const normalizedLeft = normalizeOrigin(left);
	const normalizedRight = normalizeOrigin(right);
	return normalizedLeft !== null && normalizedLeft === normalizedRight;
}

function isSameOriginOnboardingAction(request: Request, url: URL): boolean {
	const requestOrigin = getRequestOrigin(request);
	return requestOrigin !== null && originsMatch(requestOrigin, url.origin);
}

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

async function requireOnboardingCsrfAction(
	cookies: Parameters<NonNullable<Actions['testOrigin']>>[0]['cookies'],
	url: URL,
	errorKey: 'error' | 'testError'
) {
	try {
		await requireActiveOnboardingClaim(cookies, { requestUrl: url });
	} catch (err) {
		if (err instanceof OnboardingClaimRequiredError) {
			return fail(403, { [errorKey]: err.message });
		}
		throw err;
	}
	if (!(await isOnboardingCsrfStep())) {
		return fail(403, { [errorKey]: 'Not allowed at this onboarding stage' });
	}
	return null;
}

async function saveCsrfOrigin({
	request,
	cookies,
	url
}: Parameters<NonNullable<Actions['saveOrigin']>>[0]) {
	const guardResult = await requireOnboardingCsrfAction(cookies, url, 'error');
	if (guardResult) return guardResult;

	if (!isSameOriginOnboardingAction(request, url)) {
		return fail(403, { error: 'CSRF origin must be submitted from this Obzorarr origin' });
	}

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

	const actualOrigin = getRequestOrigin(request);
	if (!actualOrigin) {
		return fail(400, {
			error: 'Could not detect browser origin. Ensure you are accessing via HTTP/HTTPS.'
		});
	}

	if (!originsMatch(result.data.csrfOrigin, actualOrigin)) {
		return fail(400, {
			error: `Origin mismatch: browser sends "${actualOrigin}" but you configured "${result.data.csrfOrigin}"`
		});
	}

	await setAppSetting(AppSettingsKey.CSRF_ORIGIN, result.data.csrfOrigin);
	await deleteAppSetting(AppSettingsKey.CSRF_ORIGIN_SKIPPED);
	logger.info(`Onboarding: CSRF origin configured - ${result.data.csrfOrigin}`, 'Onboarding');

	await setOnboardingStep(OnboardingSteps.PROXY_TRUST);
	redirect(303, '/onboarding/proxy-trust');
}

export const load: PageServerLoad = async ({ request, parent }) => {
	const parentData = await parent();
	const csrfConfig = await getCsrfConfigWithSource();

	const forwardedPair = parseForwardedProtoHost(request.headers);
	const requestUrl = new URL(request.url);
	const isReverseProxy = forwardedPair.protoPresent || forwardedPair.hostPresent;
	const detectedOrigin = forwardedPair.url?.origin ?? requestUrl.origin;

	return {
		...parentData,
		csrfConfig: csrfConfig.origin,
		detection: {
			isReverseProxy,
			detectedOrigin
		}
	};
};

export const actions: Actions = {
	testOrigin: async ({ request, cookies, url }) => {
		const guardResult = await requireOnboardingCsrfAction(cookies, url, 'testError');
		if (guardResult) return guardResult;

		const formData = await request.formData();
		const proposedOrigin = formData.get('csrfOrigin')?.toString();

		const result = CsrfOriginSchema.safeParse({ csrfOrigin: proposedOrigin });
		if (!result.success) {
			const errorMessage = result.error.issues[0]?.message ?? 'Invalid URL format';
			return fail(400, { testError: errorMessage });
		}

		const actualOrigin = getRequestOrigin(request);
		if (!actualOrigin) {
			return fail(400, {
				testError: 'Could not detect browser origin. Ensure you are accessing via HTTP/HTTPS.'
			});
		}

		if (!originsMatch(result.data.csrfOrigin, actualOrigin)) {
			return fail(400, {
				testError: `Origin mismatch: browser sends "${actualOrigin}" but you configured "${result.data.csrfOrigin}"`
			});
		}

		return { testSuccess: true, testedOrigin: result.data.csrfOrigin };
	},

	save: saveCsrfOrigin,

	saveOrigin: saveCsrfOrigin,

	skipCsrf: async ({ request, cookies, url }) => {
		const guardResult = await requireOnboardingCsrfAction(cookies, url, 'error');
		if (guardResult) return guardResult;

		if (!isSameOriginOnboardingAction(request, url)) {
			return fail(403, { error: 'CSRF skip must be submitted from this Obzorarr origin' });
		}

		await setAppSetting(AppSettingsKey.CSRF_ORIGIN_SKIPPED, 'true');
		logger.info('Onboarding: CSRF configuration skipped', 'Onboarding');

		await setOnboardingStep(OnboardingSteps.PROXY_TRUST);
		redirect(303, '/onboarding/proxy-trust');
	}
};
