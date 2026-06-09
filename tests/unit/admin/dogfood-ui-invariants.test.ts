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
const ONBOARDING_PLEX = 'src/routes/onboarding/plex/+page.svelte';
const WRAPPED_PAGE = 'src/routes/wrapped/[year=year]/u/[identifier]/+page.svelte';
const SHARE_MODAL = 'src/lib/components/wrapped/ShareModal.svelte';
const SLIDES_PAGE = 'src/routes/admin/slides/+page.svelte';
const ADMIN_DASHBOARD = 'src/routes/admin/+page.svelte';

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
		expect(modelBlock).toContain('placeholder="gpt-4o-mini (default)"');
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

	it('openai-settings-form has novalidate so malformed Base URLs reach the server validator (DF-09)', async () => {
		const src = await readSource(CONNECTIONS);
		// The Base URL input is type="url". Without novalidate the browser's native
		// constraint validation silently blocks submit for malformed values, so the
		// POST never fires, the server never runs normalizeOpenAIBaseUrl, and the
		// inline fieldError message never renders. novalidate delegates validation
		// entirely to the server-side Zod schema which already returns
		// fieldErrors.openaiBaseUrl for invalid URLs.
		const formBlock = src.slice(src.indexOf('id="openai-settings-form"'));
		expect(formBlock.slice(0, formBlock.indexOf('</form>'))).toContain('novalidate');
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
		expect(modelBlock).toContain('placeholder="gpt-4o-mini (default)"');
	});

	it('onboarding-settings-form has novalidate so malformed Base URLs reach the server validator (DF-09)', async () => {
		const src = await readSource(ONBOARDING);
		// Same pattern as the admin connections form: the Base URL input is type="url"
		// and baseUrlError is populated from the server failure response. Without
		// novalidate the browser blocks submit before the POST fires.
		const formBlock = src.slice(src.indexOf('id="onboarding-settings-form"'));
		expect(formBlock.slice(0, formBlock.indexOf('</form>'))).toContain('novalidate');
	});
});

describe('DF-03 source-guard — onboarding Plex ENV lock parity', () => {
	// The admin connections page already gates the Plex server URL input on
	// isLocked (ISSUE-001). The onboarding/plex step loads plexServerUrlLocked /
	// plexTokenLocked from the same getApiConfigWithSources() source flags and
	// renders ENV badges for locked fields. These guards pin that parity so a
	// regression cannot silently re-expose editable inputs for ENV-locked values.

	it('load() exposes plexServerUrlLocked and plexTokenLocked from getApiConfigWithSources()', async () => {
		// page.server.ts must export these flags so the template can gate on them.
		const serverSrc = await readSource('src/routes/onboarding/plex/+page.server.ts');
		expect(serverSrc).toContain('plexServerUrlLocked');
		expect(serverSrc).toContain('plexTokenLocked');
		// Both flags must originate from getApiConfigWithSources() — the same
		// source as the admin connections page — not from a separate ENV read.
		expect(serverSrc).toContain('getApiConfigWithSources');
	});

	it('template renders an ENV badge when plexServerUrlLocked is true (DF-03)', async () => {
		const src = await readSource(ONBOARDING_PLEX);
		// The badge block must be gated on data.plexServerUrlLocked.
		expect(src).toContain('{#if data.plexServerUrlLocked}');
		// Inside that block, "ENV" text must appear.
		const lockBlock = src.slice(src.indexOf('{#if data.plexServerUrlLocked}'));
		const endIdx = lockBlock.indexOf('{/if}');
		expect(lockBlock.slice(0, endIdx)).toContain('ENV');
	});

	it('template renders an ENV badge when plexTokenLocked is true (DF-03)', async () => {
		const src = await readSource(ONBOARDING_PLEX);
		expect(src).toContain('{#if data.plexTokenLocked}');
		const lockBlock = src.slice(src.indexOf('{#if data.plexTokenLocked}'));
		const endIdx = lockBlock.indexOf('{/if}');
		expect(lockBlock.slice(0, endIdx)).toContain('ENV');
	});

	it('server action blocks forceManualSelection when PLEX_SERVER_URL/PLEX_TOKEN env vars are set (DF-03)', async () => {
		// The server must guard forceManualSelection with hasPlexEnvConfig() and
		// return fail(400, ...) to prevent silently writing a DB value that the
		// application will ignore (env vars take precedence).
		const serverSrc = await readSource('src/routes/onboarding/plex/+page.server.ts');
		expect(serverSrc).toContain('hasPlexEnvConfig');
		// The guard must return a fail() — not redirect — so the UI can surface
		// the error message explaining the env-var restriction.
		const guardBlock = serverSrc.slice(serverSrc.indexOf('forceManualSelection'));
		expect(guardBlock).toContain('fail(400');
	});
});

describe('DF-06 source-guard — wrapped page logo toggle gated on isOwner && canUserControlLogo', () => {
	// Another worker changed +page.svelte to gate the toggleLogo form on
	// `{#if data.isOwner && data.canUserControlLogo}`. This guard fails if it
	// reverts to only `data.canUserControlLogo` (losing the isOwner check).

	it('toggleLogo form is inside {#if data.isOwner && data.canUserControlLogo} (DF-06)', async () => {
		const src = await readSource(WRAPPED_PAGE);
		// The condition must include BOTH flags joined with &&.
		// We find the toggleLogo action attribute and walk backwards to its
		// enclosing {#if} to verify the full gate.
		const toggleIdx = src.indexOf('action="?/toggleLogo"');
		expect(toggleIdx).toBeGreaterThan(-1);
		// The nearest {#if ...} before the toggleLogo form must contain isOwner.
		const before = src.slice(0, toggleIdx);
		const lastIfIdx = before.lastIndexOf('{#if ');
		const ifBlock = before.slice(lastIfIdx);
		expect(ifBlock).toContain('data.isOwner');
		expect(ifBlock).toContain('data.canUserControlLogo');
		// The two conditions must be ANDed (not ORed).
		expect(ifBlock).toContain('&&');
	});
});

describe('DF-11 source-guard — ShareModal updateShareMode enhance uses update({ reset: false })', () => {
	// Another worker changed ShareModal.svelte to call `update({ reset: false })`
	// in the updateShareMode enhance handler. This prevents the radio from
	// flashing unchecked during the use:enhance/update cycle (DF-11).
	// This guard fails if it reverts to bare `update()`.

	it('updateShareMode enhance handler calls update({ reset: false }) (DF-11)', async () => {
		const src = await readSource(SHARE_MODAL);
		// Find the updateShareMode form's enhance handler and assert reset:false.
		const updateShareModeIdx = src.indexOf('action="?/updateShareMode"');
		expect(updateShareModeIdx).toBeGreaterThan(-1);
		// The enhance block after the updateShareMode form must contain reset: false.
		const afterForm = src.slice(updateShareModeIdx);
		const enhanceBlock = afterForm.slice(afterForm.indexOf('use:enhance'));
		// The first update() call in the handler must pass reset: false.
		expect(enhanceBlock).toContain('update({ reset: false })');
	});

	it('bare update() without reset:false is NOT present in the updateShareMode enhance handler (DF-11)', async () => {
		const src = await readSource(SHARE_MODAL);
		const updateShareModeIdx = src.indexOf('action="?/updateShareMode"');
		const afterForm = src.slice(updateShareModeIdx);
		// Find the enhance block's closing brace (use the next form as delimiter).
		const nextFormIdx = afterForm.indexOf('</form>');
		const enhanceBlock = afterForm.slice(0, nextFormIdx > -1 ? nextFormIdx : undefined);
		// Must NOT have a bare `update()` call (without arguments).
		expect(enhanceBlock).not.toMatch(/\bawait update\(\s*\)/);
	});
});

describe('DF-15 source-guard — slides Add Custom Slide uses dialog/showEditor gate', () => {
	// openNewEditor sets showEditor = true which gates a modal overlay (role="dialog",
	// aria-modal="true"). The backdrop marks the rest of the page as inert so
	// keyboard/AT focus is trapped inside the modal. This guard fails if the
	// create flow is reverted to an inline below-fold form.

	it('openNewEditor sets showEditor = true (not an inline form append)', async () => {
		const src = await readSource(SLIDES_PAGE);
		// openNewEditor must set showEditor = true.
		const fnBlock = src.slice(src.indexOf('function openNewEditor('));
		const closingBrace = fnBlock.indexOf('\n}');
		expect(fnBlock.slice(0, closingBrace)).toContain('showEditor = true');
	});

	it('the editor is rendered inside {#if showEditor} (modal gate)', async () => {
		const src = await readSource(SLIDES_PAGE);
		expect(src).toContain('{#if showEditor}');
	});

	it('the editor container has role="dialog" and aria-modal="true" (accessibility)', async () => {
		const src = await readSource(SLIDES_PAGE);
		const dialogBlock = src.slice(src.indexOf('{#if showEditor}'));
		expect(dialogBlock).toContain('role="dialog"');
		expect(dialogBlock).toContain('aria-modal="true"');
	});

	it('the page content is marked inert while the editor is open (focus trap)', async () => {
		const src = await readSource(SLIDES_PAGE);
		// The main content wrapper must set inert when showEditor is true so
		// keyboard focus cannot escape the modal.
		expect(src).toMatch(/inert=\{showEditor\}/);
	});
});

describe('DF-16 source-guard — admin dashboard scheduler-cta callout', () => {
	// The .scheduler-cta callout renders when syncStatus === 'inactive'
	// (scheduler not configured). This guard fails if the callout is removed or
	// the condition is changed to hide it for the not-configured state.

	it('.scheduler-cta callout exists in the template (DF-16)', async () => {
		const src = await readSource(ADMIN_DASHBOARD);
		expect(src).toContain('class="scheduler-cta"');
	});

	it('.scheduler-cta is rendered inside {#if syncStatus === "inactive"} (DF-16)', async () => {
		const src = await readSource(ADMIN_DASHBOARD);
		// The callout must be gated on the inactive condition so it only shows
		// when the scheduler has not been configured.
		const inactiveBlock = src.slice(src.indexOf("{#if syncStatus === 'inactive'}"));
		expect(inactiveBlock).toContain('class="scheduler-cta"');
	});

	it('syncStatus derives "inactive" when schedulerStatus is not running and not paused (DF-16)', async () => {
		const src = await readSource(ADMIN_DASHBOARD);
		// The derived syncStatus must return 'inactive' as its fallback so the
		// CTA shows correctly for un-configured schedulers.
		const syncStatusBlock = src.slice(src.indexOf('const syncStatus = $derived'));
		const closingParen = syncStatusBlock.indexOf('});');
		expect(syncStatusBlock.slice(0, closingParen)).toContain("return 'inactive'");
	});
});
