import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { AppSettingsKey, getAppSetting, setAppSetting } from '$lib/server/admin/settings.service';
import { logger } from '$lib/server/logging';
import {
	createBootstrapToken,
	getOnboardingStep,
	ONBOARDING_CLAIM_COOKIE,
	OnboardingSteps,
	RESET_BOOTSTRAP_TOKEN_TTL_MS,
	setOnboardingStep
} from '$lib/server/onboarding';
import { actions, load } from '../../../src/routes/onboarding/claim/+page.server';
import {
	claimOnboardingCookies,
	createOnboardingCookies,
	expectRedirect,
	type OnboardingTestCookies,
	resetOnboardingTestState
} from '../../helpers/onboarding';

type ClaimAction = NonNullable<typeof actions.claimInstance>;

const ALREADY_CLAIMED_MESSAGE =
	'Setup is already claimed in another browser. Wait for the claim to expire and try again.';

let cookies: OnboardingTestCookies;
let consoleWarnSpy: ReturnType<typeof spyOn>;

function claimRequest(token: string): Request {
	const formData = new FormData();
	formData.set('token', token);
	return new Request('http://localhost/onboarding/claim?/claimInstance', {
		method: 'POST',
		body: formData
	});
}

async function runClaim(token: string, jar: OnboardingTestCookies = cookies) {
	const handler = actions.claimInstance as ClaimAction;
	const request = claimRequest(token);
	return handler({
		request,
		cookies: jar,
		url: new URL(request.url)
	} as unknown as Parameters<ClaimAction>[0]);
}

/** The three keys a successful claim writes, read raw. */
async function claimKeys(): Promise<Array<string | null>> {
	return Promise.all([
		getAppSetting(AppSettingsKey.ONBOARDING_CLAIMED),
		getAppSetting(AppSettingsKey.ONBOARDING_CLAIM_PROOF_HASH),
		getAppSetting(AppSettingsKey.ONBOARDING_CLAIMED_AT)
	]);
}

beforeEach(async () => {
	await resetOnboardingTestState();
	cookies = createOnboardingCookies();
	consoleWarnSpy = spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(async () => {
	consoleWarnSpy.mockRestore();
	// The refusal warning is buffered behind a 100ms timer; drain it here so it
	// cannot flush into a later file's `logs` assertions.
	await logger.forceFlush();
});

describe('onboarding claim route', () => {
	it('delegates load to the onboarding layout parent', async () => {
		const parentData = { currentStep: OnboardingSteps.CLAIM };

		const result = await load({
			parent: async () => parentData
		} as unknown as Parameters<typeof load>[0]);

		expect(result).toBe(parentData);
	});

	it('does not export a default action alongside claimInstance', () => {
		expect('default' in actions).toBe(false);
		expect(actions.default).toBeUndefined();
		expect(typeof actions.claimInstance).toBe('function');
	});

	it('claims with a valid token, advances the step, and sets the claim cookie', async () => {
		const token = createBootstrapToken();

		await expectRedirect(() => runClaim(token), '/onboarding/csrf');

		expect(await getOnboardingStep()).toBe(OnboardingSteps.CSRF);
		expect(await getAppSetting(AppSettingsKey.ONBOARDING_CLAIMED)).toBe('true');
		expect(cookies.sets.map((entry) => entry.name)).toContain(ONBOARDING_CLAIM_COOKIE);
	});

	it('trims surrounding whitespace from a pasted token', async () => {
		const token = createBootstrapToken();

		await expectRedirect(() => runClaim(`  ${token}\n`), '/onboarding/csrf');

		expect(await getAppSetting(AppSettingsKey.ONBOARDING_CLAIMED)).toBe('true');
	});

	it('renews an existing claim and redirects, even with a junk token in the form', async () => {
		await claimOnboardingCookies(cookies);
		await setOnboardingStep(OnboardingSteps.PLEX);

		// The renew branch runs before token validation, so this proves the POST took
		// it. Documenting, not endorsing: the route sets CSRF unconditionally, so a
		// re-POST from a browser already further along is bumped back a step. That is
		// pre-existing behaviour and out of scope here.
		await expectRedirect(() => runClaim('not-a-real-token'), '/onboarding/csrf');

		expect(await getOnboardingStep()).toBe(OnboardingSteps.CSRF);
	});

	it('returns 409 with the browser-conflict message for a competing claimant', async () => {
		await claimOnboardingCookies(createOnboardingCookies());
		// A live token in a second browser: the claim slot, not the token, is what
		// refuses here.
		const token = createBootstrapToken();

		expect(await runClaim(token)).toEqual({
			status: 409,
			data: { error: ALREADY_CLAIMED_MESSAGE }
		});
		expect(cookies.sets).toHaveLength(0);
	});

	it('returns 400 for an invalid token without writing anything', async () => {
		expect(await runClaim('bogus-token-1')).toEqual({
			status: 400,
			data: { error: 'Invalid or expired bootstrap token' }
		});

		expect(await claimKeys()).toEqual([null, null, null]);
		expect(await getAppSetting(AppSettingsKey.ONBOARDING_CURRENT_STEP)).toBeNull();
		expect(cookies.sets).toHaveLength(0);
	});

	it('refuses a reset-minted token at the exact seam the layout load cannot cover', async () => {
		// This is the whole bug in one test. The onboarding layout `load` would 303 an
		// already-onboarded visitor away, but a form action never runs it, and
		// /onboarding is in onboardingHandle's skipPaths — so before the guard existed
		// this POST claimed a live instance with a token the admin had merely been
		// shown by a dismissed instance-reset dialog.
		await setAppSetting(AppSettingsKey.ONBOARDING_COMPLETED, 'true');
		const token = createBootstrapToken(RESET_BOOTSTRAP_TOKEN_TTL_MS);

		expect(await runClaim(token)).toEqual({
			status: 400,
			data: { error: 'Invalid or expired bootstrap token' }
		});

		expect(await claimKeys()).toEqual([null, null, null]);
		// The raw row, not getOnboardingStep(): that helper defaults to CLAIM when the
		// row is missing, so only the raw read proves setOnboardingStep(CSRF) was
		// never reached.
		expect(await getAppSetting(AppSettingsKey.ONBOARDING_CURRENT_STEP)).toBeNull();
		expect(cookies.sets).toHaveLength(0);
	});
});
