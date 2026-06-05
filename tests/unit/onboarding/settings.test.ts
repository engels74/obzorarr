import { beforeEach, describe, expect, it } from 'bun:test';
import { join } from 'node:path';
import {
	AnonymizationMode,
	AppSettingsKey,
	FunFactFrequency,
	getAnonymizationMode,
	getAppSetting,
	getFunFactFrequency,
	getPublicLandingLookupEnabled,
	getUITheme,
	getWrappedLogoMode,
	getWrappedTheme,
	ThemePresets,
	WrappedLogoMode
} from '$lib/server/admin/settings.service';
import { getOnboardingStep, OnboardingSteps } from '$lib/server/onboarding';
import {
	getGlobalAllowUserControl,
	getGlobalDefaultShareMode,
	getServerWrappedShareMode
} from '$lib/server/sharing/service';
import { initializeDefaultSlideConfig } from '$lib/server/slides/config.service';
import { actions } from '../../../src/routes/onboarding/settings/+page.server';
import {
	claimOnboardingCookies,
	expectRedirect,
	type OnboardingTestCookies,
	onboardingAdminLocals,
	resetOnboardingTestState
} from '../../helpers/onboarding';

const ORIGIN = 'http://localhost:5173';
const pageSourcePath = join(
	import.meta.dir,
	'..',
	'..',
	'..',
	'src/routes/onboarding/settings/+page.svelte'
);

type SaveSettingsAction = NonNullable<typeof actions.saveSettings>;

let cookies: OnboardingTestCookies;
const adminLocals = onboardingAdminLocals as unknown as App.Locals;

async function readPageSource(): Promise<string> {
	return Bun.file(pageSourcePath).text();
}

function createSettingsRequest(overrides: Record<string, string> = {}): Request {
	const formData = new FormData();
	for (const [key, value] of Object.entries({
		uiTheme: 'modern-minimal',
		wrappedTheme: 'modern-minimal',
		anonymizationMode: 'real',
		logoMode: 'always_show',
		defaultShareMode: 'public',
		allowUserControl: 'false',
		serverWrappedShareMode: 'public',
		publicLandingLookup: 'true',
		enabledSlides: '',
		enableFunFacts: 'false',
		...overrides
	})) {
		formData.set(key, value);
	}

	return new Request(`${ORIGIN}/onboarding/settings`, {
		method: 'POST',
		headers: { origin: ORIGIN },
		body: formData
	});
}

async function runSaveSettings(request: Request) {
	const saveSettings = actions.saveSettings as SaveSettingsAction;
	return saveSettings({
		request,
		locals: adminLocals,
		cookies,
		url: new URL(request.url)
	} as unknown as Parameters<SaveSettingsAction>[0]);
}

describe('onboarding settings actions', () => {
	beforeEach(async () => {
		await resetOnboardingTestState();
		cookies = await claimOnboardingCookies();
		await initializeDefaultSlideConfig();
	});

	it('redirects with ai-key-missing notice while persisting template-mode preferences', async () => {
		await expectRedirect(
			() =>
				runSaveSettings(
					createSettingsRequest({
						enableFunFacts: 'true',
						funFactFrequency: 'normal',
						aiPersona: 'witty',
						openaiApiKey: '   '
					})
				),
			'/onboarding/complete?notice=ai-key-missing'
		);

		expect(await getFunFactFrequency()).toEqual({ mode: FunFactFrequency.NORMAL, count: 4 });
		expect(await getAppSetting(AppSettingsKey.FUN_FACTS_AI_PERSONA)).toBe('witty');
		expect(await getAppSetting(AppSettingsKey.OPENAI_API_KEY)).toBeNull();
		expect(await getOnboardingStep()).toBe(OnboardingSteps.COMPLETE);
	});

	it.each([
		['not a url', 'Invalid OpenAI base URL'],
		['http://api.openai.example/v1', 'OpenAI base URL must use HTTPS.'],
		[
			'https://user:pass@api.openai.example/v1',
			'Configured base URLs must not include credentials.'
		],
		[
			'https://api.openai.example/v1?token=abc',
			'Configured base URLs must not include query strings or fragments.'
		],
		[
			'https://api.openai.example/v1#models',
			'Configured base URLs must not include query strings or fragments.'
		]
	] as const)('rejects OpenAI base URL %s even when the API key is blank', async (openaiBaseUrl, error) => {
		const result = await runSaveSettings(
			createSettingsRequest({
				enableFunFacts: 'true',
				funFactFrequency: 'normal',
				openaiApiKey: '',
				openaiBaseUrl
			})
		);

		expect(result).toMatchObject({ status: 400, data: { error } });
	});

	it('persists non-default visual/privacy settings before redirecting to completion', async () => {
		await expectRedirect(
			() =>
				runSaveSettings(
					createSettingsRequest({
						uiTheme: ThemePresets.SUPABASE,
						wrappedTheme: ThemePresets.DOOM_64,
						anonymizationMode: AnonymizationMode.HYBRID,
						logoMode: WrappedLogoMode.USER_CHOICE,
						defaultShareMode: 'private-link',
						allowUserControl: 'true'
					})
				),
			'/onboarding/complete'
		);

		expect(await getUITheme()).toBe(ThemePresets.SUPABASE);
		expect(await getWrappedTheme()).toBe(ThemePresets.DOOM_64);
		expect(await getAnonymizationMode()).toBe(AnonymizationMode.HYBRID);
		expect(await getWrappedLogoMode()).toBe(WrappedLogoMode.USER_CHOICE);
		expect(await getGlobalDefaultShareMode()).toBe('private-link');
		expect(await getGlobalAllowUserControl()).toBe(true);
		expect(await getOnboardingStep()).toBe(OnboardingSteps.COMPLETE);
	});

	it.each([
		[
			'private-oauth with lookup disabled',
			{
				anonymizationMode: AnonymizationMode.HYBRID,
				defaultShareMode: 'private-oauth',
				allowUserControl: 'true',
				serverWrappedShareMode: 'private-oauth',
				publicLandingLookup: 'false'
			},
			{
				mode: 'private-oauth',
				allowUserControl: true,
				serverMode: 'private-oauth',
				lookup: false,
				rawLookup: 'false'
			}
		],
		[
			'public lookup enabled',
			{ publicLandingLookup: 'true' },
			{
				mode: 'public',
				allowUserControl: false,
				serverMode: 'public',
				lookup: true,
				rawLookup: 'true'
			}
		]
	] as const)('persists privacy parity: %s', async (_name, overrides, expected) => {
		await expectRedirect(
			() => runSaveSettings(createSettingsRequest(overrides)),
			'/onboarding/complete'
		);

		expect(await getGlobalDefaultShareMode()).toBe(expected.mode);
		expect(await getGlobalAllowUserControl()).toBe(expected.allowUserControl);
		expect(await getServerWrappedShareMode()).toBe(expected.serverMode);
		expect(await getPublicLandingLookupEnabled()).toBe(expected.lookup);
		expect(await getAppSetting(AppSettingsKey.PUBLIC_LANDING_LOOKUP)).toBe(expected.rawLookup);
	});

	it('persists the dogfood combo: themes, user control, and landing lookup all non-default', async () => {
		await expectRedirect(
			() =>
				runSaveSettings(
					createSettingsRequest({
						uiTheme: ThemePresets.SUPABASE,
						wrappedTheme: ThemePresets.DOOM_64,
						allowUserControl: 'true',
						publicLandingLookup: 'true'
					})
				),
			'/onboarding/complete'
		);

		expect(await getUITheme()).toBe(ThemePresets.SUPABASE);
		expect(await getWrappedTheme()).toBe(ThemePresets.DOOM_64);
		expect(await getGlobalAllowUserControl()).toBe(true);
		expect(await getPublicLandingLookupEnabled()).toBe(true);
	});

	it('persists enabled fun fact frequency when AI credentials are supplied', async () => {
		await expectRedirect(
			() =>
				runSaveSettings(
					createSettingsRequest({
						enableFunFacts: 'true',
						funFactFrequency: FunFactFrequency.MANY,
						openaiApiKey: 'test-openai-key',
						openaiBaseUrl: 'https://api.openai.example/v1',
						openaiModel: 'test-model'
					})
				),
			'/onboarding/complete'
		);

		expect(await getFunFactFrequency()).toEqual({ mode: FunFactFrequency.MANY, count: 8 });
		expect(await getAppSetting(AppSettingsKey.OPENAI_API_KEY)).toBe('test-openai-key');
		expect(await getAppSetting(AppSettingsKey.OPENAI_BASE_URL)).toBe(
			'https://api.openai.example/v1'
		);
	});
});

describe('onboarding settings source guards', () => {
	it('declares the four substeps in order and derives last step from the final index', async () => {
		const src = await readPageSource();
		const ids = [...src.matchAll(/id:\s*'(appearance|privacy|slides|ai)'/g)].map(
			(match) => match[1]
		);
		expect(ids).toEqual(['appearance', 'privacy', 'slides', 'ai']);
		expect(src).toContain('let isLastSubStep = $derived(currentSubStep === totalSubSteps - 1);');
		expect(src).toContain('let currentSubStep = $state(0);');
	});

	it('gates the saveSettings submit button behind the final substep', async () => {
		const src = await readPageSource();
		const footerGate = src.match(/\{#if isLastSubStep\}([\s\S]*?)\{:else\}([\s\S]*?)\{\/if\}/);
		expect(footerGate).not.toBeNull();
		const ifBranch = footerGate?.[1] ?? '';
		const elseBranch = footerGate?.[2] ?? '';
		expect(ifBranch).toContain('Save & Continue');
		expect(elseBranch).toContain('onclick={nextSubStep}');
		expect(elseBranch).not.toContain('Save & Continue');
	});

	it('keeps nextSubStep monotonic and separate from save/navigation side effects', async () => {
		const src = await readPageSource();
		expect(src).toMatch(
			/function nextSubStep\(\)\s*\{[\s\S]*?currentSubStep < totalSubSteps - 1[\s\S]*?currentSubStep \+= 1;[\s\S]*?\}/
		);
		const nextFn = src.match(/function nextSubStep\(\)\s*\{[\s\S]*?\n\t\}/)?.[0] ?? '';
		expect(nextFn).not.toContain('saveSettings');
		expect(nextFn).not.toContain('goto');
	});

	it('keeps saveSettings as explicit form submit and force-serializes rune selections', async () => {
		const src = await readPageSource();
		expect(src).toContain('action="?/saveSettings"');
		expect(src).not.toMatch(/requestSubmit\s*\(/);

		const enhanceStart = src.indexOf('use:enhance={({ formData }) => {');
		expect(enhanceStart).toBeGreaterThan(-1);
		const enhanceSlice = src.slice(enhanceStart, enhanceStart + 1500);
		for (const key of [
			'uiTheme',
			'wrappedTheme',
			'anonymizationMode',
			'logoMode',
			'defaultShareMode',
			'serverWrappedShareMode'
		]) {
			expect(enhanceSlice).toContain(`formData.set('${key}'`);
		}
	});
});
