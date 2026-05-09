import { beforeEach, describe, expect, it } from 'bun:test';
import type { Cookies } from '@sveltejs/kit';
import { isRedirect } from '@sveltejs/kit';
import {
	AnonymizationMode,
	AppSettingsKey,
	FunFactFrequency,
	getAnonymizationMode,
	getAppSetting,
	getFunFactFrequency,
	getUITheme,
	getWrappedLogoMode,
	getWrappedTheme,
	ThemePresets,
	WrappedLogoMode
} from '$lib/server/admin/settings.service';
import { db } from '$lib/server/db/client';
import { appSettings, slideConfig } from '$lib/server/db/schema';
import { getOnboardingStep, OnboardingSteps } from '$lib/server/onboarding';
import {
	claimOnboardingInstance,
	clearBootstrapToken,
	createBootstrapToken
} from '$lib/server/onboarding/bootstrap';
import { getGlobalAllowUserControl, getGlobalDefaultShareMode } from '$lib/server/sharing/service';
import { initializeDefaultSlideConfig } from '$lib/server/slides/config.service';
import { actions } from '../../../src/routes/onboarding/settings/+page.server';

const ORIGIN = 'http://localhost:5173';
type SaveSettingsAction = NonNullable<typeof actions.saveSettings>;

const adminLocals = {
	user: { id: 1, plexId: 1, username: 'admin', isAdmin: true }
} as unknown as App.Locals;

let cookies: Cookies;

function createCookies(): Cookies {
	const values = new Map<string, string>();
	return {
		get: (name: string) => values.get(name),
		set: (name: string, value: string) => values.set(name, value),
		delete: (name: string) => values.delete(name)
	} as unknown as Cookies;
}

function createSettingsRequest(overrides: Record<string, string> = {}): Request {
	const formData = new FormData();
	// Required by SettingsSchema
	formData.set('uiTheme', 'modern-minimal');
	formData.set('wrappedTheme', 'modern-minimal');
	formData.set('anonymizationMode', 'real');
	formData.set('logoMode', 'always_show');
	formData.set('defaultShareMode', 'public');
	formData.set('allowUserControl', 'false');
	formData.set('enabledSlides', '');
	formData.set('enableFunFacts', 'false');

	for (const [key, value] of Object.entries(overrides)) {
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
	} as Parameters<SaveSettingsAction>[0]);
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

describe('onboarding settings actions', () => {
	beforeEach(async () => {
		await db.delete(appSettings);
		await db.delete(slideConfig);
		clearBootstrapToken();
		cookies = createCookies();
		const token = createBootstrapToken();
		expect(await claimOnboardingInstance(cookies, token)).toBe('claimed');
		await initializeDefaultSlideConfig();
	});

	it('redirects with ai-key-missing notice when enableFunFacts is true and openaiApiKey is missing', async () => {
		const request = createSettingsRequest({
			enableFunFacts: 'true',
			funFactFrequency: 'normal',
			aiPersona: 'witty',
			openaiApiKey: '   ' // whitespace-only -> coerced to undefined by optionalString trim
		});

		await expectRedirect(
			() => runSaveSettings(request),
			'/onboarding/complete?notice=ai-key-missing'
		);

		// Built-in fun-fact related settings still persist (frequency, persona)
		expect(await getFunFactFrequency()).toEqual({ mode: FunFactFrequency.NORMAL, count: 4 });
		expect(await getAppSetting(AppSettingsKey.FUN_FACTS_AI_PERSONA)).toBe('witty');
		// OpenAI key not written when missing
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
	])('rejects OpenAI base URL %s even when the API key is blank', async (openaiBaseUrl, error) => {
		const request = createSettingsRequest({
			enableFunFacts: 'true',
			funFactFrequency: 'normal',
			openaiApiKey: '',
			openaiBaseUrl
		});

		const result = await runSaveSettings(request);

		expect(result).toMatchObject({
			status: 400,
			data: { error }
		});
	});

	it('persists non-default settings before redirecting to completion', async () => {
		const request = createSettingsRequest({
			uiTheme: ThemePresets.SUPABASE,
			wrappedTheme: ThemePresets.DOOM_64,
			anonymizationMode: AnonymizationMode.HYBRID,
			logoMode: WrappedLogoMode.USER_CHOICE,
			defaultShareMode: 'private-link',
			allowUserControl: 'true',
			enableFunFacts: 'false'
		});

		await expectRedirect(() => runSaveSettings(request), '/onboarding/complete');

		expect(await getUITheme()).toBe(ThemePresets.SUPABASE);
		expect(await getWrappedTheme()).toBe(ThemePresets.DOOM_64);
		expect(await getAnonymizationMode()).toBe(AnonymizationMode.HYBRID);
		expect(await getWrappedLogoMode()).toBe(WrappedLogoMode.USER_CHOICE);
		expect(await getGlobalDefaultShareMode()).toBe('private-link');
		expect(await getGlobalAllowUserControl()).toBe(true);
		expect(await getOnboardingStep()).toBe(OnboardingSteps.COMPLETE);
	});

	it('persists enabled fun fact frequency when AI credentials are supplied', async () => {
		const request = createSettingsRequest({
			enableFunFacts: 'true',
			funFactFrequency: FunFactFrequency.MANY,
			openaiApiKey: 'test-openai-key',
			openaiBaseUrl: 'https://api.openai.example/v1',
			openaiModel: 'test-model'
		});

		await expectRedirect(() => runSaveSettings(request), '/onboarding/complete');

		expect(await getFunFactFrequency()).toEqual({ mode: FunFactFrequency.MANY, count: 8 });
		expect(await getAppSetting(AppSettingsKey.OPENAI_API_KEY)).toBe('test-openai-key');
		expect(await getAppSetting(AppSettingsKey.OPENAI_BASE_URL)).toBe(
			'https://api.openai.example/v1'
		);
	});
});
