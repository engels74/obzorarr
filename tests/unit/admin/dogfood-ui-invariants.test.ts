import { describe, expect, it } from 'bun:test';
import { join } from 'node:path';

// Source guards for dogfood UI invariants that have no DOM-render harness in
// this Bun-only suite. Each pins a template attribute/wiring that a behavior
// test cannot observe without a component runner. Registered in
// tests/SOURCE_GUARDS.md under `dogfood-ui-invariants`.

const PROJECT_ROOT = join(import.meta.dir, '..', '..', '..');

async function readSource(relPath: string): Promise<string> {
	return Bun.file(join(PROJECT_ROOT, relPath)).text();
}

const CONNECTIONS = 'src/routes/admin/settings/connections/+page.svelte';
const ONBOARDING = 'src/routes/onboarding/settings/+page.svelte';

describe('dogfood UI invariants — admin connections page', () => {
	it('caps the OpenAI Base URL input at maxlength=512 (ISSUE-008)', async () => {
		const src = await readSource(CONNECTIONS);
		// The Base URL <Input> must forward a client maxlength so the field can't
		// silently exceed the server zod cap. shadcn Input spreads restProps onto
		// the real <input>, so maxlength={512} reaches the DOM.
		const baseUrlBlock = src.slice(src.indexOf('id="openaiBaseUrl"'));
		expect(baseUrlBlock).toContain('maxlength={512}');
	});

	it('communicates the effective default in the model placeholder (ISSUE-003)', async () => {
		const src = await readSource(CONNECTIONS);
		const modelBlock = src.slice(src.indexOf('id="openaiModel"'));
		expect(modelBlock).toContain('placeholder="gpt-5-mini (default)"');
	});

	it('gates the Plex server URL ENV pill + disabled input on isLocked (ISSUE-001)', async () => {
		const src = await readSource(CONNECTIONS);
		// The pill/disable wiring is what surfaces an env-locked value. A regression
		// that drops it would reintroduce the "no badge for env-set value" symptom.
		expect(src).toContain('const plexServerUrlLocked = $derived(settings.plexServerUrl.isLocked);');
		expect(src).toContain('disabled={plexServerUrlLocked}');
		const pillBlock = src.slice(src.indexOf('for="plexServerUrl"'));
		expect(pillBlock).toMatch(
			/{#if plexServerUrlLocked}[\s\S]*?<SettingsStatusPill tone="warning">ENV<\/SettingsStatusPill>/
		);
	});
});

describe('dogfood UI invariants — onboarding settings page', () => {
	it('caps the OpenAI Base URL input at maxlength=512 (ISSUE-008)', async () => {
		const src = await readSource(ONBOARDING);
		const baseUrlBlock = src.slice(src.indexOf('id="onboarding-openai-base-url"'));
		expect(baseUrlBlock).toContain('maxlength="512"');
	});

	it('communicates the effective default in the model placeholder (ISSUE-003)', async () => {
		const src = await readSource(ONBOARDING);
		const modelBlock = src.slice(src.indexOf('id="onboarding-openai-model"'));
		expect(modelBlock).toContain('placeholder="gpt-5-mini (default)"');
	});
});
