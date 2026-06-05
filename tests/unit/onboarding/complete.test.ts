import { beforeEach, describe, expect, it } from 'bun:test';
import { type fail, isActionFailure, isRedirect } from '@sveltejs/kit';
import {
	AnonymizationMode,
	AppSettingsKey,
	FunFactFrequency,
	getAppSetting,
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
import { setGlobalShareDefaults } from '$lib/server/sharing/service';
import { actions, load } from '../../../src/routes/onboarding/complete/+page.server';
import {
	claimOnboardingCookies,
	createOnboardingCookies,
	createThrowingOnboardingCookies,
	onboardingAdminLocals,
	resetOnboardingTestState
} from '../../helpers/onboarding';

const COMPLETE_URL = new URL('http://localhost/onboarding/complete');
const adminLocals = onboardingAdminLocals as unknown as App.Locals;

async function runCompleteLoad(
	url = COMPLETE_URL,
	cookies: Parameters<typeof load>[0]['cookies'] = createOnboardingCookies()
) {
	return load({
		parent: async () => ({}),
		locals: adminLocals,
		url,
		cookies
	} as unknown as Parameters<typeof load>[0]);
}

describe('onboarding completion page', () => {
	beforeEach(resetOnboardingTestState);

	it('redirects to claim when the active onboarding claim is missing', async () => {
		try {
			await runCompleteLoad();
			expect.unreachable('Expected missing onboarding claim to redirect');
		} catch (error) {
			expect(isRedirect(error)).toBe(true);
			if (!isRedirect(error)) throw error;
			expect(error.status).toBe(303);
			expect(error.location).toBe('/onboarding/claim');
		}
	});

	it('propagates unexpected onboarding claim failures', async () => {
		const unexpected = new Error('unexpected claim cookie failure');
		try {
			await runCompleteLoad(COMPLETE_URL, createThrowingOnboardingCookies(unexpected));
			expect.unreachable('Expected unexpected claim error to be thrown');
		} catch (error) {
			expect(error).toBe(unexpected);
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

		const result = (await runCompleteLoad(COMPLETE_URL, await claimOnboardingCookies())) as {
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

	it.each([
		['passes through ai-key-missing notice', '?notice=ai-key-missing', 'ai-key-missing'],
		['rejects unknown notice values', '?notice=evil', null]
	] as const)('%s', async (_name, query, expectedNotice) => {
		const result = (await runCompleteLoad(
			new URL(`http://localhost/onboarding/complete${query}`),
			await claimOnboardingCookies()
		)) as { notice: string | null };

		expect(result.notice).toBe(expectedNotice);
	});

	it.each([
		[
			'Disabled when no OpenAI key is configured',
			undefined,
			false,
			'Disabled',
			async () => {
				await setFunFactFrequency(FunFactFrequency.MANY);
				await setAppSetting(AppSettingsKey.OPENAI_BASE_URL, 'https://api.example.com/v1');
			}
		],
		[
			'template mode when AI was requested without a key',
			'?notice=ai-key-missing',
			false,
			'Template mode — add an OpenAI key to enable AI',
			async () => {
				await setFunFactFrequency(FunFactFrequency.MANY);
				await setAppSetting(AppSettingsKey.OPENAI_BASE_URL, 'https://api.example.com/v1');
			}
		],
		[
			'configured frequency when OpenAI key is present',
			undefined,
			true,
			'Many (8)',
			async () => {
				await setFunFactFrequency(FunFactFrequency.MANY);
				await setAppSetting(AppSettingsKey.OPENAI_API_KEY, 'sk-test-key');
			}
		]
	] as const)('shows fun facts as %s', async (_name, query, enabled, summary, seed) => {
		await seed();
		const result = (await runCompleteLoad(
			new URL(`http://localhost/onboarding/complete${query ?? ''}`),
			await claimOnboardingCookies()
		)) as { configSummary: Record<string, string>; enableFunFacts: boolean };

		expect(result.enableFunFacts).toBe(enabled);
		expect(result.configSummary.funFacts).toBe(summary);
	});
});

describe('onboarding completion authorization', () => {
	beforeEach(resetOnboardingTestState);

	it('does not issue an admin session or complete onboarding for a non-owner', async () => {
		const cookies = await claimOnboardingCookies();
		cookies.sets.length = 0;

		const result = await actions.goToDashboard?.({
			locals: { user: { id: 2, plexId: 999, username: 'guest', isAdmin: false } } as App.Locals,
			cookies,
			url: COMPLETE_URL
		} as unknown as Parameters<NonNullable<typeof actions.goToDashboard>>[0]);

		expect(isActionFailure(result)).toBe(true);
		expect((result as ReturnType<typeof fail>).status).toBe(403);
		expect(cookies.sets.find((cookie) => cookie.name === 'session')).toBeUndefined();
		expect(await getAppSetting(AppSettingsKey.ONBOARDING_COMPLETED)).not.toBe('true');
	});
});
