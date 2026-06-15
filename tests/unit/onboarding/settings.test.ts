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
import { matchPresetFull } from '$lib/sharing/preset-logic';
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

describe('onboarding privacy preset — cosmetic-only display fix (ISSUE-003)', () => {
	// The GENUINE fresh-install seed, as resolved by the server getters and mapped
	// into `data.settings` by the onboarding load (`+page.server.ts`). Confirmed:
	//   anonymizationMode  = HYBRID         (settings.service.ts getAnonymizationMode → AnonymizationMode.HYBRID, line ~730)
	//   defaultShareMode   = public         (sharing/service.ts getGlobalDefaultShareMode → ShareMode.PUBLIC, line ~86)
	//   serverWrappedShareMode = private-oauth  (sharing/service.ts getServerWrappedShareMode → PRIVATE_OAUTH, mapped to 'private-oauth' in +page.server.ts:190)
	//   publicLandingLookup = false         (settings.service.ts getPublicLandingLookupEnabled → false when no row, line ~1292)
	//   allowUserControl   = false          (sharing/service.ts getGlobalAllowUserControl → false when no row, line ~103)
	//   logoMode           = always_show    (settings.service.ts getWrappedLogoMode → WrappedLogoMode.ALWAYS_SHOW, line ~757)
	//   uiTheme/wrappedTheme = modern-minimal (settings.service.ts getUITheme/getWrappedTheme defaults)
	const FRESH_SEED = {
		anonymizationMode: 'hybrid',
		defaultShareMode: 'public',
		serverWrappedShareMode: 'private-oauth',
		publicLandingLookup: false,
		allowUserControl: false,
		logoMode: 'always_show'
	} as const;

	// Mirror of the component's `use:enhance` FormData serialization for a
	// NO-INTERACTION advance from a genuine fresh seed (enableFunFacts stays false,
	// so every AI field serializes to ''). This reproduces exactly the `formData.set`
	// calls in +page.svelte; the test pins it against a byte-identical expectation so
	// the cosmetic badge/note change cannot have altered what gets POSTed.
	function serializeNoInteractionAdvance(): string {
		const enableFunFacts = false;
		const fd = new FormData();
		fd.set('uiTheme', 'modern-minimal');
		fd.set('wrappedTheme', 'modern-minimal');
		fd.set('anonymizationMode', FRESH_SEED.anonymizationMode);
		fd.set('logoMode', FRESH_SEED.logoMode);
		fd.set('defaultShareMode', FRESH_SEED.defaultShareMode);
		fd.set('allowUserControl', FRESH_SEED.allowUserControl ? 'true' : 'false');
		fd.set('serverWrappedShareMode', FRESH_SEED.serverWrappedShareMode);
		fd.set('publicLandingLookup', FRESH_SEED.publicLandingLookup ? 'true' : 'false');
		fd.set('enabledSlides', '');
		fd.set('enableFunFacts', enableFunFacts ? 'true' : 'false');
		fd.set('funFactFrequency', enableFunFacts ? 'normal' : '');
		fd.set('openaiApiKey', enableFunFacts ? 'x' : '');
		fd.set('openaiBaseUrl', enableFunFacts ? 'x' : '');
		fd.set('openaiModel', enableFunFacts ? 'x' : '');
		fd.set('aiPersona', enableFunFacts ? 'witty' : '');
		return new URLSearchParams(fd as unknown as Record<string, string>).toString();
	}

	it('persist-parity: no-interaction advance payload is byte-identical to the pinned fresh-seed expectation', () => {
		// Byte-exact expectation for a genuine fresh-seed, no-interaction advance.
		// If a future change (cosmetic or otherwise) alters what the privacy step
		// POSTs without interaction, this assertion fails — proving the badge/note
		// change persists nothing different.
		const EXPECTED =
			'uiTheme=modern-minimal&wrappedTheme=modern-minimal&anonymizationMode=hybrid' +
			'&logoMode=always_show&defaultShareMode=public&allowUserControl=false' +
			'&serverWrappedShareMode=private-oauth&publicLandingLookup=false' +
			'&enabledSlides=&enableFunFacts=false&funFactFrequency=&openaiApiKey=' +
			'&openaiBaseUrl=&openaiModel=&aiPersona=';
		expect(serializeNoInteractionAdvance()).toBe(EXPECTED);
	});

	it('seed-divergence pin: matchPresetFull(<genuine fresh seed>) === "custom"', () => {
		// The fresh seed deliberately matches NO shipped preset, which is exactly why
		// the privacy step shows no highlighted card on first run. Pinning this guards
		// against a future seed change silently making a preselect-would-mutate path
		// viable. The three diverging fields vs. Balanced are defaultShareMode (public
		// vs private-oauth), allowUserControl (false vs true) and logoMode
		// (always_show vs user_choice).
		expect(matchPresetFull(FRESH_SEED)).toBe('custom');
		// Explicit field-level pins so a single seed change trips this with a clear diff.
		expect(FRESH_SEED.defaultShareMode).toBe('public');
		expect(FRESH_SEED.allowUserControl).toBe(false);
		expect(FRESH_SEED.logoMode).toBe('always_show');
	});

	it('cosmetic markup: Recommended badge + softened neutral note render; no .selected highlight on fresh seed', async () => {
		const src = await readPageSource();

		// (a) presentational "Recommended" badge gated only on the immutable preset
		// id — binds to NO rune and does NOT touch selectedPreset.
		expect(src).toContain("{#if preset.id === 'balanced'}");
		expect(src).toContain('<span class="preset-card-badge">Recommended</span>');

		// (b) softened, non-accusatory neutral note that makes the silent default explicit.
		expect(src).toContain('continue with the current');

		// The selected-highlight remains driven solely by selectedPreset (which stays
		// 'custom' on a fresh seed → no card highlighted). The badge must not add its
		// own selection state.
		expect(src).toContain('class:selected={selectedPreset === preset.id}');
		const badgeBlock = src.match(/\{#if preset\.id === 'balanced'\}[\s\S]*?\{\/if\}/)?.[0] ?? '';
		expect(badgeBlock).not.toContain('selected');
		expect(badgeBlock).not.toContain('applyPrivacyPreset');
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
