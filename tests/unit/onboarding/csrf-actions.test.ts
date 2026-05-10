import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import type { Cookies } from '@sveltejs/kit';
import { isRedirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import {
	AppSettingsKey,
	deleteAppSetting,
	getAppSetting,
	setAppSetting
} from '$lib/server/admin/settings.service';
import { db } from '$lib/server/db/client';
import { appSettings } from '$lib/server/db/schema';
import { getOnboardingStep, OnboardingSteps, setOnboardingStep } from '$lib/server/onboarding';
import {
	claimOnboardingInstance,
	clearBootstrapToken,
	createBootstrapToken
} from '$lib/server/onboarding/bootstrap';
import { actions } from '../../../src/routes/onboarding/csrf/+page.server';

const ORIGIN = 'http://localhost:5173';
const OVERSIZED_BROWSER_ORIGIN = `https://wrapped.example.com/${'a'.repeat(2049)}`;
type SaveOriginAction = NonNullable<typeof actions.saveOrigin>;
type SkipCsrfAction = NonNullable<typeof actions.skipCsrf>;
type TestOriginAction = NonNullable<typeof actions.testOrigin>;
type DiagnoseReverseProxyAction = NonNullable<typeof actions.diagnoseReverseProxy>;
type EnableTrustProxyAction = NonNullable<typeof actions.enableTrustProxy>;

function envRecord(): Record<string, string | undefined> {
	return env as Record<string, string | undefined>;
}

function createCookies() {
	const values = new Map<string, string>();
	return {
		get: (name: string) => values.get(name),
		set: (name: string, value: string) => values.set(name, value),
		delete: (name: string) => values.delete(name)
	};
}

let cookies: ReturnType<typeof createCookies>;
let previousTrustProxyEnv: string | undefined;

function createThrowingClaimCookies(errorToThrow: Error): ReturnType<typeof createCookies> {
	return {
		get: () => {
			throw errorToThrow;
		},
		set: () => undefined,
		delete: () => undefined
	} as unknown as ReturnType<typeof createCookies>;
}

function createFormRequest(csrfOrigin: string, origin = ORIGIN, requestBase = ORIGIN): Request {
	const formData = new FormData();
	formData.set('csrfOrigin', csrfOrigin);

	return new Request(`${requestBase}/onboarding/csrf`, {
		method: 'POST',
		headers: { origin },
		body: formData
	});
}

function createReverseProxyDiagnosticRequest(
	browserOrigin = 'https://wrapped.example.com',
	requestBase = 'http://internal.local',
	headers: Record<string, string> = {}
): Request {
	const formData = new FormData();
	formData.set('browserOrigin', browserOrigin);

	return new Request(`${requestBase}/onboarding/csrf`, {
		method: 'POST',
		headers: {
			origin: browserOrigin,
			'x-forwarded-proto': 'https',
			'x-forwarded-host': 'wrapped.example.com',
			...headers
		},
		body: formData
	});
}

function createEnableTrustProxyRequest(confirmRisk = true): Request {
	const formData = new FormData();
	formData.set('browserOrigin', 'https://wrapped.example.com');
	if (confirmRisk) formData.set('confirmRisk', 'true');

	return new Request('http://internal.local/onboarding/csrf', {
		method: 'POST',
		headers: {
			origin: 'https://wrapped.example.com',
			'x-forwarded-proto': 'https',
			'x-forwarded-host': 'wrapped.example.com'
		},
		body: formData
	});
}

function createFormRequestWithRefererOnly(
	csrfOrigin: string,
	referer = `${ORIGIN}/onboarding/csrf`
): Request {
	const formData = new FormData();
	formData.set('csrfOrigin', csrfOrigin);

	return new Request(`${ORIGIN}/onboarding/csrf`, {
		method: 'POST',
		headers: { referer },
		body: formData
	});
}

async function runSaveOrigin(request: Request) {
	const saveOrigin = actions.saveOrigin as SaveOriginAction;
	return saveOrigin({
		request,
		cookies,
		url: new URL(request.url)
	} as unknown as Parameters<SaveOriginAction>[0]);
}

async function runTestOrigin(request: Request) {
	const testOrigin = actions.testOrigin as TestOriginAction;
	return testOrigin({ request, cookies } as unknown as Parameters<TestOriginAction>[0]);
}

async function runSkipCsrf(request: Request) {
	const skipCsrf = actions.skipCsrf as SkipCsrfAction;
	return skipCsrf({
		request,
		cookies,
		url: new URL(request.url)
	} as unknown as Parameters<SkipCsrfAction>[0]);
}

async function runDiagnoseReverseProxy(request: Request) {
	const diagnoseReverseProxy = actions.diagnoseReverseProxy as DiagnoseReverseProxyAction;
	return diagnoseReverseProxy({
		request,
		cookies,
		url: new URL(request.url),
		getClientAddress: () => '172.18.0.2'
	} as unknown as Parameters<DiagnoseReverseProxyAction>[0]);
}

async function runEnableTrustProxy(request: Request) {
	const enableTrustProxy = actions.enableTrustProxy as EnableTrustProxyAction;
	return enableTrustProxy({
		request,
		cookies,
		url: new URL(request.url),
		getClientAddress: () => '172.18.0.2'
	} as unknown as Parameters<EnableTrustProxyAction>[0]);
}

async function expectRedirect(run: () => Promise<unknown>, location: string) {
	try {
		await run();
		throw new Error('Expected action to redirect');
	} catch (error) {
		expect(isRedirect(error)).toBe(true);
		if (!isRedirect(error)) throw error;
		expect(error.status).toBe(303);
		expect(error.location).toBe(location);
	}
}

describe('onboarding CSRF actions', () => {
	beforeEach(async () => {
		previousTrustProxyEnv = envRecord().TRUST_PROXY;
		delete envRecord().TRUST_PROXY;
		await db.delete(appSettings);
		clearBootstrapToken();
		cookies = createCookies();
		const token = createBootstrapToken();
		expect(await claimOnboardingInstance(cookies as unknown as Cookies, token)).toBe('claimed');
		await setOnboardingStep(OnboardingSteps.CSRF);
	});

	afterEach(() => {
		if (previousTrustProxyEnv === undefined) delete envRecord().TRUST_PROXY;
		else envRecord().TRUST_PROXY = previousTrustProxyEnv;
	});

	it('test origin succeeds when the submitted origin matches the browser origin', async () => {
		const result = await runTestOrigin(createFormRequest(ORIGIN));

		expect(result).toEqual({ testSuccess: true, testedOrigin: ORIGIN });
		expect(await getOnboardingStep()).toBe(OnboardingSteps.CSRF);
	});

	it('test origin accepts browser origins with explicit default ports', async () => {
		const result = await runTestOrigin(
			createFormRequest('https://example.com', 'https://example.com:443')
		);

		expect(result).toEqual({ testSuccess: true, testedOrigin: 'https://example.com' });
		expect(await getOnboardingStep()).toBe(OnboardingSteps.CSRF);
	});

	it('test origin accepts same-origin form submissions that only include a Referer header', async () => {
		const result = await runTestOrigin(createFormRequestWithRefererOnly(ORIGIN));

		expect(result).toEqual({ testSuccess: true, testedOrigin: ORIGIN });
		expect(await getOnboardingStep()).toBe(OnboardingSteps.CSRF);
	});

	it('test origin rejects invalid URLs without advancing onboarding', async () => {
		const result = await runTestOrigin(createFormRequest('not-a-url'));

		expect(result).toEqual({
			status: 400,
			data: { testError: 'Invalid URL format' }
		});
		expect(await getOnboardingStep()).toBe(OnboardingSteps.CSRF);
	});

	it('test origin rejects requests without a browser origin', async () => {
		const formData = new FormData();
		formData.set('csrfOrigin', ORIGIN);

		const request = new Request(`${ORIGIN}/onboarding/csrf`, {
			method: 'POST',
			body: formData
		});

		const result = await runTestOrigin(request);

		expect(result).toEqual({
			status: 400,
			data: {
				testError: 'Could not detect browser origin. Ensure you are accessing via HTTP/HTTPS.'
			}
		});
		expect(await getOnboardingStep()).toBe(OnboardingSteps.CSRF);
	});

	it('test origin rejects mismatches without advancing onboarding', async () => {
		const result = await runTestOrigin(createFormRequest('https://example.com'));

		expect(result).toEqual({
			status: 400,
			data: {
				testError:
					'Origin mismatch: browser sends "http://localhost:5173" but you configured "https://example.com"'
			}
		});
		expect(await getOnboardingStep()).toBe(OnboardingSteps.CSRF);
	});

	it('saves a matching CSRF origin, advances to Plex, and redirects', async () => {
		await expectRedirect(() => runSaveOrigin(createFormRequest(ORIGIN)), '/onboarding/plex');

		expect(await getAppSetting(AppSettingsKey.CSRF_ORIGIN)).toBe(ORIGIN);
		expect(await getOnboardingStep()).toBe(OnboardingSteps.PLEX);
	});

	it('saves a matching CSRF origin when the browser origin has an explicit default port', async () => {
		await expectRedirect(
			() =>
				runSaveOrigin(
					createFormRequest('https://example.com', 'https://example.com:443', 'https://example.com')
				),
			'/onboarding/plex'
		);

		expect(await getAppSetting(AppSettingsKey.CSRF_ORIGIN)).toBe('https://example.com');
		expect(await getOnboardingStep()).toBe(OnboardingSteps.PLEX);
	});

	it('saves a matching CSRF origin and advances when the form submission only includes a Referer header', async () => {
		await expectRedirect(
			() => runSaveOrigin(createFormRequestWithRefererOnly(ORIGIN)),
			'/onboarding/plex'
		);

		expect(await getAppSetting(AppSettingsKey.CSRF_ORIGIN)).toBe(ORIGIN);
		expect(await getOnboardingStep()).toBe(OnboardingSteps.PLEX);
	});

	it('does not advance when the origin URL is invalid', async () => {
		const result = await runSaveOrigin(createFormRequest('not-a-url'));

		expect(result).toEqual({
			status: 400,
			data: { error: 'Invalid URL format' }
		});
		expect(await getAppSetting(AppSettingsKey.CSRF_ORIGIN)).toBeNull();
		expect(await getOnboardingStep()).toBe(OnboardingSteps.CSRF);
	});

	it('does not advance when the submitted origin differs from the browser origin', async () => {
		const result = await runSaveOrigin(createFormRequest('https://example.com'));

		expect(result).toEqual({
			status: 400,
			data: {
				error:
					'Origin mismatch: browser sends "http://localhost:5173" but you configured "https://example.com"'
			}
		});
		expect(await getAppSetting(AppSettingsKey.CSRF_ORIGIN)).toBeNull();
		expect(await getOnboardingStep()).toBe(OnboardingSteps.CSRF);
	});

	it('saveOrigin rejects cross-origin submissions without persisting the submitted origin', async () => {
		const result = await runSaveOrigin(
			createFormRequest('https://evil.example', 'https://evil.example')
		);

		expect(result).toEqual({
			status: 403,
			data: { error: 'CSRF origin must be submitted from this Obzorarr origin' }
		});
		expect(await getAppSetting(AppSettingsKey.CSRF_ORIGIN)).toBeNull();
		expect(await getOnboardingStep()).toBe(OnboardingSteps.CSRF);
	});

	it('skips CSRF setup, advances to Plex, and redirects', async () => {
		await deleteAppSetting(AppSettingsKey.CSRF_ORIGIN);

		await expectRedirect(() => runSkipCsrf(createFormRequest('not-a-url')), '/onboarding/plex');

		expect(await getAppSetting(AppSettingsKey.CSRF_ORIGIN)).toBeNull();
		expect(await getOnboardingStep()).toBe(OnboardingSteps.PLEX);
	});

	it('skipCsrf writes CSRF_ORIGIN_SKIPPED=true as explicit opt-out', async () => {
		expect(await getAppSetting(AppSettingsKey.CSRF_ORIGIN_SKIPPED)).toBeNull();

		await expectRedirect(() => runSkipCsrf(createFormRequest('not-a-url')), '/onboarding/plex');

		expect(await getAppSetting(AppSettingsKey.CSRF_ORIGIN_SKIPPED)).toBe('true');
	});

	it('skipCsrf rejects cross-origin submissions without advancing onboarding', async () => {
		const result = await runSkipCsrf(createFormRequest('not-a-url', 'https://evil.example'));

		expect(result).toEqual({
			status: 403,
			data: { error: 'CSRF skip must be submitted from this Obzorarr origin' }
		});
		expect(await getAppSetting(AppSettingsKey.CSRF_ORIGIN_SKIPPED)).toBeNull();
		expect(await getOnboardingStep()).toBe(OnboardingSteps.CSRF);
	});

	it('skipCsrf rejects missing Origin/Referer headers', async () => {
		const request = new Request(`${ORIGIN}/onboarding/csrf`, { method: 'POST' });

		const result = await runSkipCsrf(request);

		expect(result).toEqual({
			status: 403,
			data: { error: 'CSRF skip must be submitted from this Obzorarr origin' }
		});
		expect(await getAppSetting(AppSettingsKey.CSRF_ORIGIN_SKIPPED)).toBeNull();
		expect(await getOnboardingStep()).toBe(OnboardingSteps.CSRF);
	});

	it('runs a read-only reverse proxy diagnostic without persisting TRUST_PROXY', async () => {
		const result = await runDiagnoseReverseProxy(createReverseProxyDiagnosticRequest());

		expect(result).toMatchObject({
			reverseProxyDiagnostic: {
				trustProxy: {
					enabled: false,
					source: 'default',
					isLocked: false
				},
				recommendation: {
					action: 'enable'
				}
			}
		});
		expect(await getAppSetting(AppSettingsKey.TRUST_PROXY)).toBeNull();
		expect(await getOnboardingStep()).toBe(OnboardingSteps.CSRF);
	});

	it('rejects structurally abusive reverse proxy diagnostic browser origins', async () => {
		const result = await runDiagnoseReverseProxy(
			createReverseProxyDiagnosticRequest(OVERSIZED_BROWSER_ORIGIN)
		);

		expect(result).toEqual({
			status: 400,
			data: { diagnosticError: 'browserOrigin is too long' }
		});
		expect(await getAppSetting(AppSettingsKey.TRUST_PROXY)).toBeNull();
		expect(await getOnboardingStep()).toBe(OnboardingSteps.CSRF);
	});

	it('does not expose raw forwarded header values in the onboarding diagnostic payload', async () => {
		const result = await runDiagnoseReverseProxy(
			createReverseProxyDiagnosticRequest('https://wrapped.example.com', 'http://internal.local', {
				cookie: 'session=secret-cookie',
				authorization: 'Bearer secret-authorization',
				'x-forwarded-host': 'wrapped.example.com',
				'x-forwarded-for': '203.0.113.77',
				'x-real-ip': '198.51.100.88',
				forwarded: 'for=hidden-client;proto=https;host=hidden.example'
			})
		);

		const serialized = JSON.stringify(result);
		expect(serialized).not.toContain('secret-cookie');
		expect(serialized).not.toContain('secret-authorization');
		expect(serialized).not.toContain('203.0.113.77');
		expect(serialized).not.toContain('198.51.100.88');
		expect(serialized).not.toContain('hidden-client');
		expect(serialized).not.toContain('hidden.example');
	});

	it('rejects enabling TRUST_PROXY without explicit risk confirmation', async () => {
		const result = await runEnableTrustProxy(createEnableTrustProxyRequest(false));

		expect(result).toEqual({
			status: 400,
			data: {
				trustProxyError: 'Confirm the reverse-proxy header trust risk before enabling TRUST_PROXY.'
			}
		});
		expect(await getAppSetting(AppSettingsKey.TRUST_PROXY)).toBeNull();
	});

	it('rejects enabling TRUST_PROXY with a structurally abusive browser origin', async () => {
		const formData = new FormData();
		formData.set('browserOrigin', OVERSIZED_BROWSER_ORIGIN);
		formData.set('confirmRisk', 'true');

		const result = await runEnableTrustProxy(
			new Request('http://internal.local/onboarding/csrf', {
				method: 'POST',
				headers: {
					origin: 'https://wrapped.example.com',
					'x-forwarded-proto': 'https',
					'x-forwarded-host': 'wrapped.example.com'
				},
				body: formData
			})
		);

		expect(result).toEqual({
			status: 400,
			data: {
				trustProxyError: 'Confirm the reverse-proxy header trust risk before enabling TRUST_PROXY.'
			}
		});
		expect(await getAppSetting(AppSettingsKey.TRUST_PROXY)).toBeNull();
	});

	it('rejects enabling TRUST_PROXY when environment controlled', async () => {
		envRecord().TRUST_PROXY = 'true';

		const result = await runEnableTrustProxy(createEnableTrustProxyRequest(true));

		expect(result).toEqual({
			status: 400,
			data: {
				trustProxyError:
					'TRUST_PROXY is set via environment variable and must be changed in your environment or container configuration.'
			}
		});
		expect(await getAppSetting(AppSettingsKey.TRUST_PROXY)).toBeNull();
	});

	it('rejects enabling TRUST_PROXY when the request origin differs from the submitted browser origin', async () => {
		const formData = new FormData();
		formData.set('browserOrigin', 'https://wrapped.example.com');
		formData.set('confirmRisk', 'true');
		const mismatchedRequest = new Request('http://internal.local/onboarding/csrf', {
			method: 'POST',
			headers: {
				origin: 'https://other.example.com',
				'x-forwarded-proto': 'https',
				'x-forwarded-host': 'wrapped.example.com'
			},
			body: formData
		});

		const mismatchedResult = await runEnableTrustProxy(mismatchedRequest);

		expect(mismatchedResult).toEqual({
			status: 403,
			data: {
				trustProxyError: 'Reverse proxy header trust must be enabled from this browser origin'
			}
		});
		expect(await getAppSetting(AppSettingsKey.TRUST_PROXY)).toBeNull();
	});

	it('persists TRUST_PROXY only after confirmation and a current enable recommendation', async () => {
		const result = await runEnableTrustProxy(createEnableTrustProxyRequest(true));

		expect(result).toEqual({
			trustProxySuccess: true,
			trustProxyMessage: 'Reverse-proxy header trust enabled.'
		});
		expect(await getAppSetting(AppSettingsKey.TRUST_PROXY)).toBe('true');
		expect(await getOnboardingStep()).toBe(OnboardingSteps.CSRF);
	});

	it('rejects enabling TRUST_PROXY when the current diagnostic does not recommend it', async () => {
		const result = await runEnableTrustProxy(
			new Request(`${ORIGIN}/onboarding/csrf`, {
				method: 'POST',
				headers: { origin: ORIGIN },
				body: (() => {
					const formData = new FormData();
					formData.set('browserOrigin', ORIGIN);
					formData.set('confirmRisk', 'true');
					return formData;
				})()
			})
		);

		expect(result).toEqual({
			status: 400,
			data: {
				trustProxyError:
					'The current diagnostic does not recommend enabling reverse proxy header trust.'
			}
		});
		expect(await getAppSetting(AppSettingsKey.TRUST_PROXY)).toBeNull();
	});

	it('saveOrigin clears CSRF_ORIGIN_SKIPPED on success', async () => {
		await setAppSetting(AppSettingsKey.CSRF_ORIGIN_SKIPPED, 'true');

		await expectRedirect(() => runSaveOrigin(createFormRequest(ORIGIN)), '/onboarding/plex');

		expect(await getAppSetting(AppSettingsKey.CSRF_ORIGIN_SKIPPED)).toBeNull();
		expect(await getAppSetting(AppSettingsKey.CSRF_ORIGIN)).toBe(ORIGIN);
	});

	it('propagates unexpected claim errors for centralized sanitization', async () => {
		const unexpected = new Error('raw database path should stay server-side');
		cookies = createThrowingClaimCookies(unexpected);

		for (const run of [
			() => runTestOrigin(createFormRequest(ORIGIN)),
			() => runSaveOrigin(createFormRequest(ORIGIN)),
			() => runSkipCsrf(createFormRequest('not-a-url')),
			() => runDiagnoseReverseProxy(createReverseProxyDiagnosticRequest()),
			() => runEnableTrustProxy(createEnableTrustProxyRequest(true))
		]) {
			try {
				await run();
				expect.unreachable('Expected unexpected claim error to be thrown');
			} catch (err) {
				expect(err).toBe(unexpected);
			}
		}
	});

	describe('onboarding-step guard', () => {
		it('testOrigin returns 403 when onboarding is already complete', async () => {
			await setAppSetting(AppSettingsKey.ONBOARDING_COMPLETED, 'true');

			const result = await runTestOrigin(createFormRequest(ORIGIN));

			expect(result).toEqual({
				status: 403,
				data: { testError: 'Not allowed at this onboarding stage' }
			});
		});

		it('saveOrigin returns 403 when current step is past CSRF', async () => {
			await setOnboardingStep(OnboardingSteps.PLEX);

			const result = await runSaveOrigin(createFormRequest(ORIGIN));

			expect(result).toEqual({
				status: 403,
				data: { error: 'Not allowed at this onboarding stage' }
			});
			expect(await getAppSetting(AppSettingsKey.CSRF_ORIGIN)).toBeNull();
		});

		it('skipCsrf returns 403 when onboarding is complete', async () => {
			await setAppSetting(AppSettingsKey.ONBOARDING_COMPLETED, 'true');

			const result = await runSkipCsrf(createFormRequest('not-a-url'));

			expect(result).toEqual({
				status: 403,
				data: { error: 'Not allowed at this onboarding stage' }
			});
			expect(await getAppSetting(AppSettingsKey.CSRF_ORIGIN_SKIPPED)).toBeNull();
		});

		it('skipCsrf returns 403 when current step is past CSRF', async () => {
			await setOnboardingStep(OnboardingSteps.SETTINGS);

			const result = await runSkipCsrf(createFormRequest('not-a-url'));

			expect(result).toEqual({
				status: 403,
				data: { error: 'Not allowed at this onboarding stage' }
			});
			expect(await getAppSetting(AppSettingsKey.CSRF_ORIGIN_SKIPPED)).toBeNull();
		});

		it('diagnoseReverseProxy returns 403 when current step is past CSRF', async () => {
			await setOnboardingStep(OnboardingSteps.PLEX);

			const result = await runDiagnoseReverseProxy(createReverseProxyDiagnosticRequest());

			expect(result).toEqual({
				status: 403,
				data: { diagnosticError: 'Not allowed at this onboarding stage' }
			});
			expect(await getAppSetting(AppSettingsKey.TRUST_PROXY)).toBeNull();
		});

		it('enableTrustProxy returns 403 when onboarding is complete', async () => {
			await setAppSetting(AppSettingsKey.ONBOARDING_COMPLETED, 'true');

			const result = await runEnableTrustProxy(createEnableTrustProxyRequest(true));

			expect(result).toEqual({
				status: 403,
				data: { trustProxyError: 'Not allowed at this onboarding stage' }
			});
			expect(await getAppSetting(AppSettingsKey.TRUST_PROXY)).toBeNull();
		});
	});
});
