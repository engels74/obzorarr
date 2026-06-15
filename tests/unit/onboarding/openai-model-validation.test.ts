import { beforeEach, describe, expect, it } from 'bun:test';
import { AppSettingsKey, getAppSetting } from '$lib/server/admin/settings.service';
import { initializeDefaultSlideConfig } from '$lib/server/slides/config.service';
import { actions } from '../../../src/routes/onboarding/settings/+page.server';
import {
	claimOnboardingCookies,
	expectRedirect,
	type OnboardingTestCookies,
	onboardingAdminLocals,
	resetOnboardingTestState
} from '../../helpers/onboarding';

// ISSUE-001: mirror of the connections page's false-accept-leaning OpenAI model
// rule, applied to onboarding's `saveSettings`. The rule is a NARROW reject-list
// (control chars + shell metacharacters only); provider slugs and INTERNAL
// SPACES in local aliases must PASS. A bad model degrades gracefully to template
// fun facts, so over-rejecting is strictly worse than over-accepting — hence one
// FAIL case (shell injection) and never a fail based solely on an internal space.
// (The admin-route PASS/FAIL table lives in tests/unit/admin/connections-actions.test.ts.)

const ORIGIN = 'http://localhost:5173';

type SaveSettingsAction = NonNullable<typeof actions.saveSettings>;

let cookies: OnboardingTestCookies;
const adminLocals = onboardingAdminLocals as unknown as App.Locals;

// Onboarding only persists OPENAI_MODEL when fun facts are enabled AND both an
// API key and a model are supplied (see +page.server.ts). So PASS cases must
// supply enableFunFacts + key + a valid HTTPS base URL for the model to land.
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

function aiOverrides(openaiModel: string): Record<string, string> {
	return {
		enableFunFacts: 'true',
		funFactFrequency: 'normal',
		openaiApiKey: 'test-openai-key',
		openaiBaseUrl: 'https://api.openai.example/v1',
		openaiModel
	};
}

describe('onboarding openaiModel validation (ISSUE-001)', () => {
	beforeEach(async () => {
		await resetOnboardingTestState();
		cookies = await claimOnboardingCookies();
		await initializeDefaultSlideConfig();
	});

	it.each([
		'gpt-4o-mini',
		'meta-llama/Llama-3.1-8B:free',
		'anthropic/claude-3.5'
	])('accepts and persists a valid OpenAI model id %s', async (openaiModel) => {
		await expectRedirect(
			() => runSaveSettings(createSettingsRequest(aiOverrides(openaiModel))),
			'/onboarding/complete'
		);
		expect(await getAppSetting(AppSettingsKey.OPENAI_MODEL)).toBe(openaiModel);
	});

	it('PASSES a space-containing local alias (internal-space alias PASSES)', async () => {
		const openaiModel = 'My Local Model 7B';
		await expectRedirect(
			() => runSaveSettings(createSettingsRequest(aiOverrides(openaiModel))),
			'/onboarding/complete'
		);
		expect(await getAppSetting(AppSettingsKey.OPENAI_MODEL)).toBe(openaiModel);
	});

	it('rejects a shell-metacharacter OpenAI model as 400 and does not persist', async () => {
		const result = await runSaveSettings(createSettingsRequest(aiOverrides('gpt; rm -rf')));

		// Onboarding surfaces the first Zod issue message via `error` (not a
		// fieldErrors map); the refinement fires before any persistence.
		expect(result).toMatchObject({ status: 400 });
		expect(await getAppSetting(AppSettingsKey.OPENAI_MODEL)).toBeNull();
	});
});
