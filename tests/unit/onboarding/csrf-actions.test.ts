import { beforeEach, describe, expect, it } from 'bun:test';
import { isRedirect } from '@sveltejs/kit';
import {
	AppSettingsKey,
	deleteAppSetting,
	getAppSetting
} from '$lib/server/admin/settings.service';
import { db } from '$lib/server/db/client';
import { appSettings } from '$lib/server/db/schema';
import { getOnboardingStep, OnboardingSteps } from '$lib/server/onboarding';
import { actions } from '../../../src/routes/onboarding/csrf/+page.server';

const ORIGIN = 'http://localhost:5173';
type SaveOriginAction = NonNullable<typeof actions.saveOrigin>;
type SkipCsrfAction = NonNullable<typeof actions.skipCsrf>;
type TestOriginAction = NonNullable<typeof actions.testOrigin>;

function createFormRequest(csrfOrigin: string, origin = ORIGIN): Request {
	const formData = new FormData();
	formData.set('csrfOrigin', csrfOrigin);

	return new Request(`${ORIGIN}/onboarding/csrf`, {
		method: 'POST',
		headers: { origin },
		body: formData
	});
}

async function runSaveOrigin(request: Request) {
	const saveOrigin = actions.saveOrigin as SaveOriginAction;
	return saveOrigin({ request } as Parameters<SaveOriginAction>[0]);
}

async function runTestOrigin(request: Request) {
	const testOrigin = actions.testOrigin as TestOriginAction;
	return testOrigin({ request } as Parameters<TestOriginAction>[0]);
}

async function runSkipCsrf(request: Request) {
	const skipCsrf = actions.skipCsrf as SkipCsrfAction;
	return skipCsrf({ request } as Parameters<SkipCsrfAction>[0]);
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
		await db.delete(appSettings);
	});

	it('test origin succeeds when the submitted origin matches the browser origin', async () => {
		const result = await runTestOrigin(createFormRequest(ORIGIN));

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

	it('skips CSRF setup, advances to Plex, and redirects', async () => {
		await deleteAppSetting(AppSettingsKey.CSRF_ORIGIN);

		await expectRedirect(() => runSkipCsrf(createFormRequest('not-a-url')), '/onboarding/plex');

		expect(await getAppSetting(AppSettingsKey.CSRF_ORIGIN)).toBeNull();
		expect(await getOnboardingStep()).toBe(OnboardingSteps.PLEX);
	});
});
