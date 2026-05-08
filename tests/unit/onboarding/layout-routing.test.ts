import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { type Cookies, isRedirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { AppSettingsKey, setAppSetting } from '$lib/server/admin/settings.service';
import { db } from '$lib/server/db/client';
import { appSettings } from '$lib/server/db/schema';
import {
	claimOnboardingInstance,
	clearBootstrapToken,
	createBootstrapToken
} from '$lib/server/onboarding/bootstrap';
import { OnboardingSteps, setOnboardingStep } from '$lib/server/onboarding/status';
import { load } from '../../../src/routes/onboarding/+layout.server';

const adminLocals = {
	user: { id: 1, plexId: 1, username: 'admin', isAdmin: true }
} as unknown as App.Locals;

function createCookies(): Cookies {
	const values = new Map<string, string>();
	return {
		get: (name: string) => values.get(name),
		set: (name: string, value: string) => values.set(name, value),
		delete: (name: string) => values.delete(name)
	} as unknown as Cookies;
}

async function createClaimedCookies(): Promise<Cookies> {
	const cookies = createCookies();
	const token = createBootstrapToken();
	expect(await claimOnboardingInstance(cookies, token)).toBe('claimed');
	return cookies;
}

async function runLayout(pathname: string, cookies: Cookies = createCookies()) {
	return load({
		cookies,
		locals: adminLocals,
		url: new URL(`http://localhost${pathname}`)
	} as Parameters<typeof load>[0]);
}

async function expectRedirect(run: () => Promise<unknown>, location: string) {
	try {
		await run();
		expect.unreachable('Expected onboarding layout to redirect');
	} catch (error) {
		expect(isRedirect(error)).toBe(true);
		if (!isRedirect(error)) throw error;
		expect(error.status).toBe(303);
		expect(error.location).toBe(location);
	}
}

describe('onboarding layout claim routing', () => {
	let previousPlexServerUrl: string | undefined;
	let previousPlexToken: string | undefined;

	beforeEach(async () => {
		await db.delete(appSettings);
		clearBootstrapToken();
		await setAppSetting(AppSettingsKey.ONBOARDING_COMPLETED, 'false');
		const dynamicEnv = env as Record<string, string | undefined>;
		previousPlexServerUrl = dynamicEnv.PLEX_SERVER_URL;
		previousPlexToken = dynamicEnv.PLEX_TOKEN;
		dynamicEnv.PLEX_SERVER_URL = '';
		dynamicEnv.PLEX_TOKEN = '';
	});

	afterEach(() => {
		const dynamicEnv = env as Record<string, string | undefined>;
		if (previousPlexServerUrl === undefined) delete dynamicEnv.PLEX_SERVER_URL;
		else dynamicEnv.PLEX_SERVER_URL = previousPlexServerUrl;
		if (previousPlexToken === undefined) delete dynamicEnv.PLEX_TOKEN;
		else dynamicEnv.PLEX_TOKEN = previousPlexToken;
	});

	it('lets a no-claim browser render the claim page after setup has advanced', async () => {
		await setOnboardingStep(OnboardingSteps.CSRF);

		const result = await runLayout('/onboarding/claim');
		if (!result) expect.unreachable('Expected onboarding layout data');

		expect(result.currentStep).toBe(OnboardingSteps.CLAIM);
		expect(result.currentStepIndex).toBe(0);
	});

	it('redirects no-claim browsers from guarded onboarding steps back to claim', async () => {
		await setOnboardingStep(OnboardingSteps.CSRF);

		await expectRedirect(() => runLayout('/onboarding/csrf'), '/onboarding/claim');
	});

	it('keeps active-claim browsers pinned to the current onboarding step', async () => {
		const cookies = await createClaimedCookies();
		await setOnboardingStep(OnboardingSteps.CSRF);

		await expectRedirect(() => runLayout('/onboarding/claim', cookies), '/onboarding/csrf');
	});
});
