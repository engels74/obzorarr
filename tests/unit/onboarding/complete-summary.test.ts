import { beforeEach, describe, expect, it } from 'bun:test';
import { type Cookies, isRedirect } from '@sveltejs/kit';
import {
	AnonymizationMode,
	AppSettingsKey,
	FunFactFrequency,
	setAnonymizationMode,
	setAppSetting,
	setCachedServerName,
	setFunFactFrequency,
	setUITheme,
	setWrappedLogoMode,
	setWrappedTheme,
	ThemePresets,
	WrappedLogoMode
} from '$lib/server/admin/settings.service';
import { db } from '$lib/server/db/client';
import { appSettings, playHistory, syncStatus } from '$lib/server/db/schema';
import {
	claimOnboardingInstance,
	clearBootstrapToken,
	createBootstrapToken
} from '$lib/server/onboarding/bootstrap';
import { setGlobalShareDefaults } from '$lib/server/sharing/service';
import { load } from '../../../src/routes/onboarding/complete/+page.server';

const adminLocals = {
	user: { id: 1, plexId: 1, username: 'admin', isAdmin: true }
} as unknown as App.Locals;

function createCookies(errorToThrow?: Error): Cookies {
	const values = new Map<string, string>();
	return {
		get: (name: string) => {
			if (errorToThrow) throw errorToThrow;
			return values.get(name);
		},
		set: (name: string, value: string) => values.set(name, value),
		delete: (name: string) => values.delete(name)
	} as unknown as Cookies;
}

async function createClaimedCookies(): Promise<Cookies> {
	clearBootstrapToken();
	const cookies = createCookies();
	const token = createBootstrapToken();
	expect(await claimOnboardingInstance(cookies, token)).toBe('claimed');
	return cookies;
}

describe('onboarding completion summary', () => {
	beforeEach(async () => {
		await db.delete(appSettings);
		await db.delete(playHistory);
		await db.delete(syncStatus);
	});

	it('redirects to claim when the active onboarding claim is missing', async () => {
		try {
			await load({
				parent: async () => ({}),
				locals: adminLocals,
				url: new URL('http://localhost/onboarding/complete'),
				cookies: createCookies()
			} as Parameters<typeof load>[0]);
			expect.unreachable('Expected missing onboarding claim to redirect');
		} catch (err) {
			expect(isRedirect(err)).toBe(true);
			if (!isRedirect(err)) throw err;
			expect(err.status).toBe(303);
			expect(err.location).toBe('/onboarding/claim');
		}
	});

	it('propagates unexpected onboarding claim failures', async () => {
		const unexpected = new Error('unexpected claim cookie failure');

		try {
			await load({
				parent: async () => ({}),
				locals: adminLocals,
				url: new URL('http://localhost/onboarding/complete'),
				cookies: createCookies(unexpected)
			} as Parameters<typeof load>[0]);
			expect.unreachable('Expected unexpected claim error to be thrown');
		} catch (err) {
			expect(err).toBe(unexpected);
		}
	});

	it('reflects the persisted onboarding configuration', async () => {
		await setCachedServerName('QA Plex');
		await setUITheme(ThemePresets.SUPABASE);
		await setWrappedTheme(ThemePresets.DOOM_64);
		await setAnonymizationMode(AnonymizationMode.HYBRID);
		await setWrappedLogoMode(WrappedLogoMode.USER_CHOICE);
		await setGlobalShareDefaults({ defaultShareMode: 'private-link', allowUserControl: true });
		await setFunFactFrequency(FunFactFrequency.CUSTOM, 7);
		await setAppSetting(AppSettingsKey.OPENAI_API_KEY, 'test-openai-key');

		const result = (await load({
			parent: async () => ({}),
			locals: adminLocals,
			url: new URL('http://localhost/onboarding/complete'),
			cookies: await createClaimedCookies()
		} as Parameters<typeof load>[0])) as {
			configSummary: Record<string, string>;
		};

		expect(result.configSummary).toEqual({
			serverName: 'QA Plex',
			uiTheme: 'Supabase',
			wrappedTheme: 'Doom 64',
			anonymizationMode: 'Hybrid',
			logoMode: 'User Choice',
			shareMode: 'Private Link',
			allowUserControl: 'Allowed',
			funFacts: 'Custom (7)'
		});
	});

	it('passes through ai-key-missing notice when present in url', async () => {
		const result = (await load({
			parent: async () => ({}),
			locals: adminLocals,
			url: new URL('http://localhost/onboarding/complete?notice=ai-key-missing'),
			cookies: await createClaimedCookies()
		} as Parameters<typeof load>[0])) as { notice: string | null };

		expect(result.notice).toBe('ai-key-missing');
	});

	it('rejects unknown notice values (returns null)', async () => {
		const result = (await load({
			parent: async () => ({}),
			locals: adminLocals,
			url: new URL('http://localhost/onboarding/complete?notice=evil'),
			cookies: await createClaimedCookies()
		} as Parameters<typeof load>[0])) as { notice: string | null };

		expect(result.notice).toBeNull();
	});

	it('shows the configured fun fact frequency when OpenAI key is missing', async () => {
		await setFunFactFrequency(FunFactFrequency.MANY);
		await setAppSetting(AppSettingsKey.OPENAI_BASE_URL, 'https://api.example.com/v1');

		const result = (await load({
			parent: async () => ({}),
			locals: adminLocals,
			url: new URL('http://localhost/onboarding/complete'),
			cookies: await createClaimedCookies()
		} as Parameters<typeof load>[0])) as {
			configSummary: Record<string, string>;
		};

		expect(result.configSummary.funFacts).toBe('Many (8)');
	});
});
