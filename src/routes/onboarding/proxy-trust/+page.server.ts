import { fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import {
	AppSettingsKey,
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
import { _resetTrustProxyCache } from '$lib/server/security/proxy-handle';
import {
	assertEnableTrustProxyAllowed,
	createReverseProxyDiagnostic
} from '$lib/server/security/reverse-proxy-diagnostic';
import type { Actions, PageServerLoad } from './$types';

async function isOnboardingProxyTrustStep(): Promise<boolean> {
	const [done, step] = await Promise.all([isOnboardingComplete(), getOnboardingStep()]);
	return !done && step === OnboardingSteps.PROXY_TRUST;
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

const MAX_BROWSER_ORIGIN_LENGTH = 2048;

const BrowserOriginSchema = z.object({
	browserOrigin: z
		.string()
		.min(1, 'Browser origin is required')
		.max(MAX_BROWSER_ORIGIN_LENGTH, 'browserOrigin is too long')
		.url('Browser origin is invalid')
		.refine((url) => url.startsWith('http://') || url.startsWith('https://'), {
			message: 'Browser origin must start with http:// or https://'
		})
		.transform((url) => new URL(url).origin)
});

const TrustProxyEnableSchema = BrowserOriginSchema.extend({
	confirmRisk: z.literal('true')
});

async function requireOnboardingProxyTrustAction(
	cookies: Parameters<NonNullable<Actions['continue']>>[0]['cookies'],
	url: URL,
	errorKey: 'error' | 'diagnosticError' | 'trustProxyError'
) {
	try {
		await requireActiveOnboardingClaim(cookies, { requestUrl: url });
	} catch (err) {
		if (err instanceof OnboardingClaimRequiredError) {
			return fail(403, { [errorKey]: err.message });
		}
		throw err;
	}
	if (!(await isOnboardingProxyTrustStep())) {
		return fail(403, { [errorKey]: 'Not allowed at this onboarding stage' });
	}
	return null;
}

export const load: PageServerLoad = async ({ parent }) => {
	const parentData = await parent();
	const trustProxyConfig = await getTrustProxyConfigWithSource();

	return {
		...parentData,
		trustProxy: {
			enabled: trustProxyConfig.trustProxy.value === 'true',
			source: trustProxyConfig.trustProxy.source,
			isLocked: trustProxyConfig.trustProxy.isLocked
		}
	};
};

export const actions: Actions = {
	continue: async ({ request, cookies, url }) => {
		const guardResult = await requireOnboardingProxyTrustAction(cookies, url, 'error');
		if (guardResult) return guardResult;

		if (!isSameOriginOnboardingAction(request, url)) {
			return fail(403, { error: 'Continue must be submitted from this Obzorarr origin' });
		}

		await setOnboardingStep(OnboardingSteps.PLEX);
		redirect(303, '/onboarding/plex');
	},

	// Rewind to the previous step so the user can review the security settings.
	// Both steps are pure configuration with no destructive side effects, so the
	// only state changed is the onboarding cursor; forward navigation re-runs the
	// normal `continue` action and its validation.
	goBack: async ({ cookies, url }) => {
		const guardResult = await requireOnboardingProxyTrustAction(cookies, url, 'error');
		if (guardResult) return guardResult;

		await setOnboardingStep(OnboardingSteps.CSRF);
		redirect(303, '/onboarding/csrf');
	},

	diagnoseReverseProxy: async ({ request, cookies, url, getClientAddress }) => {
		const guardResult = await requireOnboardingProxyTrustAction(cookies, url, 'diagnosticError');
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
		const guardResult = await requireOnboardingProxyTrustAction(cookies, url, 'trustProxyError');
		if (guardResult) return guardResult;

		const trustProxyConfig = await getTrustProxyConfigWithSource();
		if (trustProxyConfig.trustProxy.isLocked) {
			return fail(400, {
				trustProxyError:
					'TRUST_PROXY is set via environment variable and must be changed in your environment or container configuration.'
			});
		}

		// Re-ordered per ISSUE-001: the diagnostic-recommendation guard must run
		// BEFORE the confirmRisk guard, otherwise an API-direct caller posting
		// `confirmRisk=1` on a system the diagnostic told to leave disabled would
		// see the wrong error message and assume the diagnostic guard had passed.
		const formData = await request.formData();
		const browserOriginParsed = BrowserOriginSchema.safeParse({
			browserOrigin: formData.get('browserOrigin')
		});
		if (!browserOriginParsed.success) {
			return fail(400, {
				trustProxyError:
					browserOriginParsed.error.issues[0]?.message ?? 'Could not read browser origin safely'
			});
		}

		if (!isSubmittedBrowserOriginAction(request, browserOriginParsed.data.browserOrigin)) {
			return fail(403, {
				trustProxyError: 'Reverse proxy header trust must be enabled from this browser origin'
			});
		}

		const diagnostic = await createReverseProxyDiagnostic({
			request,
			rawAppUrl: request.url,
			effectiveAppUrl: url,
			browserOrigin: browserOriginParsed.data.browserOrigin,
			sourceAddress: getClientAddress()
		});
		const gate = assertEnableTrustProxyAllowed(diagnostic);
		if (!gate.ok) {
			return fail(400, { trustProxyError: gate.error });
		}

		const parsed = TrustProxyEnableSchema.safeParse({
			browserOrigin: browserOriginParsed.data.browserOrigin,
			confirmRisk: formData.get('confirmRisk')
		});
		if (!parsed.success) {
			return fail(400, {
				trustProxyError: 'Confirm the reverse-proxy header trust risk before enabling TRUST_PROXY.'
			});
		}

		await setAppSetting(AppSettingsKey.TRUST_PROXY, 'true');
		_resetTrustProxyCache();
		logger.warn(
			'Reverse-proxy header trust enabled during onboarding. Verify your upstream proxy strips inbound x-forwarded-* headers.',
			'Onboarding'
		);
		return { trustProxySuccess: true, trustProxyMessage: 'Reverse-proxy header trust enabled.' };
	}
};
