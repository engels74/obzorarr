import { fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import {
	AppSettingsKey,
	deleteAppSetting,
	getCsrfConfigWithSource,
	getTrustProxyConfigWithSource,
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
import { createReverseProxyDiagnostic } from '$lib/server/security/reverse-proxy-diagnostic';
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

function isSubmittedBrowserOriginAction(request: Request, browserOrigin: string): boolean {
	const requestOrigin = getRequestOrigin(request);
	return requestOrigin !== null && originsMatch(requestOrigin, browserOrigin);
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

const BrowserOriginSchema = z.object({
	browserOrigin: z
		.string()
		.min(1, 'Browser origin is required')
		.url('Browser origin is invalid')
		.refine((url) => url.startsWith('http://') || url.startsWith('https://'), {
			message: 'Browser origin must start with http:// or https://'
		})
		.transform((url) => new URL(url).origin)
});

const TrustProxyEnableSchema = BrowserOriginSchema.extend({
	confirmRisk: z.literal('true')
});

async function requireOnboardingCsrfAction(
	cookies: Parameters<NonNullable<Actions['testOrigin']>>[0]['cookies'],
	url: URL,
	errorKey: 'error' | 'testError' | 'diagnosticError' | 'trustProxyError'
) {
	if (!(await isOnboardingCsrfStep())) {
		return fail(403, { [errorKey]: 'Not allowed at this onboarding stage' });
	}
	try {
		await requireActiveOnboardingClaim(cookies, { requestUrl: url });
	} catch (err) {
		if (err instanceof OnboardingClaimRequiredError) {
			return fail(403, { [errorKey]: err.message });
		}
		throw err;
	}
	return null;
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
		reverseProxyDiagnostic: null,
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

	saveOrigin: async ({ request, cookies, url }) => {
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

		await setOnboardingStep(OnboardingSteps.PLEX);
		redirect(303, '/onboarding/plex');
	},

	skipCsrf: async ({ request, cookies, url }) => {
		const guardResult = await requireOnboardingCsrfAction(cookies, url, 'error');
		if (guardResult) return guardResult;

		if (!isSameOriginOnboardingAction(request, url)) {
			return fail(403, { error: 'CSRF skip must be submitted from this Obzorarr origin' });
		}

		await setAppSetting(AppSettingsKey.CSRF_ORIGIN_SKIPPED, 'true');
		logger.info('Onboarding: CSRF configuration skipped', 'Onboarding');

		await setOnboardingStep(OnboardingSteps.PLEX);
		redirect(303, '/onboarding/plex');
	},

	diagnoseReverseProxy: async ({ request, cookies, url, getClientAddress }) => {
		const guardResult = await requireOnboardingCsrfAction(cookies, url, 'diagnosticError');
		if (guardResult) return guardResult;

		const formData = await request.formData();
		const parsed = BrowserOriginSchema.safeParse({
			browserOrigin: formData.get('browserOrigin')
		});
		if (!parsed.success) {
			return fail(400, {
				diagnosticError: parsed.error.issues[0]?.message ?? 'Could not read browser origin safely'
			});
		}

		try {
			const diagnostic = await createReverseProxyDiagnostic({
				request,
				rawAppUrl: request.url,
				effectiveAppUrl: url,
				browserOrigin: parsed.data.browserOrigin,
				sourceAddress: getClientAddress()
			});
			return { reverseProxyDiagnostic: diagnostic };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown diagnostic error';
			logger.error(`Onboarding reverse proxy diagnostic failed: ${message}`, 'Onboarding');
			return fail(500, { diagnosticError: 'Could not run reverse proxy diagnostic' });
		}
	},

	enableTrustProxy: async ({ request, cookies, url, getClientAddress }) => {
		const guardResult = await requireOnboardingCsrfAction(cookies, url, 'trustProxyError');
		if (guardResult) return guardResult;

		const trustProxyConfig = await getTrustProxyConfigWithSource();
		if (trustProxyConfig.trustProxy.isLocked) {
			return fail(400, {
				trustProxyError:
					'TRUST_PROXY is set via environment variable and must be changed in your environment or container configuration.'
			});
		}

		const formData = await request.formData();
		const parsed = TrustProxyEnableSchema.safeParse({
			browserOrigin: formData.get('browserOrigin'),
			confirmRisk: formData.get('confirmRisk')
		});
		if (!parsed.success) {
			return fail(400, {
				trustProxyError: 'Confirm the reverse-proxy header trust risk before enabling TRUST_PROXY.'
			});
		}

		if (!isSubmittedBrowserOriginAction(request, parsed.data.browserOrigin)) {
			return fail(403, {
				trustProxyError: 'Reverse proxy header trust must be enabled from this browser origin'
			});
		}

		const diagnostic = await createReverseProxyDiagnostic({
			request,
			rawAppUrl: request.url,
			effectiveAppUrl: url,
			browserOrigin: parsed.data.browserOrigin,
			sourceAddress: getClientAddress()
		});
		if (diagnostic.recommendation.action !== 'enable') {
			return fail(400, {
				trustProxyError:
					'The current diagnostic does not recommend enabling reverse proxy header trust.'
			});
		}

		await setAppSetting(AppSettingsKey.TRUST_PROXY, 'true');
		logger.warn(
			'Reverse-proxy header trust enabled during onboarding. Verify your upstream proxy strips inbound x-forwarded-* headers.',
			'Onboarding'
		);
		return { trustProxySuccess: true, trustProxyMessage: 'Reverse-proxy header trust enabled.' };
	}
};
