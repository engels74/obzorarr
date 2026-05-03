import { describe, expect, it } from 'bun:test';
import { actions } from '../../../src/routes/onboarding/settings/+page.server';

const ORIGIN = 'http://localhost:5173';
type SaveSettingsAction = NonNullable<typeof actions.saveSettings>;

const adminLocals = {
	user: { id: 1, plexId: 1, username: 'admin', isAdmin: true }
} as unknown as App.Locals;

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
		url: new URL(request.url)
	} as Parameters<SaveSettingsAction>[0]);
}

describe('onboarding settings actions', () => {
	it('fails with 400 when enableFunFacts is true and openaiApiKey is missing', async () => {
		const request = createSettingsRequest({
			enableFunFacts: 'true',
			funFactFrequency: 'normal',
			openaiApiKey: '   ' // whitespace-only -> coerced to undefined by optionalString trim
		});

		const result = await runSaveSettings(request);

		expect(result).toMatchObject({
			status: 400,
			data: {
				error:
					'OpenAI API key is required when AI Fun Facts is enabled. Add a key or disable the toggle.'
			}
		});
		expect((result as { data: { error: string } }).data.error).toContain(
			'OpenAI API key is required'
		);
	});
});
