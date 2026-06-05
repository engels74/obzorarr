import { describe, expect, it } from 'bun:test';
import { setPublicLandingLookupEnabled } from '$lib/server/admin/settings.service';
import { actions } from '../../src/routes/+page.server';

/**
 * Source-regression tests for the 2026-05-14 dogfood fixes. Each test pins
 * the structural change to the source so a future refactor can't silently
 * regress the dogfood-reported behaviour.
 */
async function readSource(path: string): Promise<string> {
	return Bun.file(path).text();
}

// dogfood ISSUE-003 — the monolith form's restoreLogSettings() + manual
// invalidate-on-failure pattern lived in the deleted /admin/settings/+page.svelte.
// The nested-route system tab (src/routes/admin/settings/system/+page.server.ts +
// +page.svelte) handles the same invariant through Superforms' built-in
// stateful update + the matching test cases in tests/unit/admin/system-actions.test.ts.
// The appVersion-from-load assertion re-points to the nested system route.
describe('dogfood ISSUE-003 — admin log settings persistence', () => {
	it('returns appVersion from the System tab load function', async () => {
		const source = await readSource('src/routes/admin/settings/system/+page.server.ts');
		expect(source).toContain("import { getAppVersion } from '$lib/server/version';");
		expect(source).toContain('appVersion: getAppVersion()');
	});
});

// dogfood ISSUE-002 — the monolith form's two-stage invalidateAll() +
// restoreServerWrappedSettings()/restoreUserDefaults() pattern is replaced by
// Superforms' resetForm: false + onUpdated re-fetch in the nested privacy tab.
// OCC settingsVersion refresh is covered end-to-end by
// tests/unit/admin/privacy-actions.test.ts (stale-version 409 paths).

describe('dogfood ISSUE-005 — Watch Again must return to slide 0', () => {
	it('server-wide wrapped clears the URL hash before remounting StoryMode', async () => {
		const source = await readSource('src/routes/wrapped/[year=year]/+page.svelte');

		const restartStart = source.indexOf('function handleRestart(): void {');
		expect(restartStart).toBeGreaterThan(-1);
		const restartSlice = source.slice(restartStart, restartStart + 600);
		expect(restartSlice).toContain('currentSlideIndex = 0;');
		expect(restartSlice).toContain("url.hash = '#slide=0';");
		expect(restartSlice).toContain('replaceState(url, {});');
		// Hash mutation must happen before the storyKey bump.
		expect(restartSlice.indexOf("url.hash = '#slide=0'")).toBeLessThan(
			restartSlice.indexOf('storyKey++')
		);
	});

	it('per-user wrapped clears the URL hash before remounting StoryMode', async () => {
		const source = await readSource('src/routes/wrapped/[year=year]/u/[identifier]/+page.svelte');

		const restartStart = source.indexOf('function handleRestart(): void {');
		expect(restartStart).toBeGreaterThan(-1);
		const restartSlice = source.slice(restartStart, restartStart + 600);
		expect(restartSlice).toContain('currentSlideIndex = 0;');
		expect(restartSlice).toContain("url.hash = '#slide=0';");
		expect(restartSlice).toContain('replaceState(url, {});');
		expect(restartSlice.indexOf("url.hash = '#slide=0'")).toBeLessThan(
			restartSlice.indexOf('storyKey++')
		);
	});

	it('SummaryPage buttons carry explicit aria-labels', async () => {
		const source = await readSource('src/lib/components/wrapped/SummaryPage.svelte');
		expect(source).toContain('aria-label="Watch Again"');
		expect(source).toContain('aria-label="Share"');
		expect(source).toContain('aria-label="Return Home"');
	});
});

describe('dogfood ISSUE-008 — StoryMode keydown throttle', () => {
	it('throttles keydown to one event per KEYDOWN_THROTTLE_MS window', async () => {
		const source = await readSource('src/lib/components/wrapped/StoryMode.svelte');

		expect(source).toContain('const KEYDOWN_THROTTLE_MS = 100;');
		expect(source).toContain('let lastKeyTime = 0;');

		const handleKeyDownStart = source.indexOf(
			'function handleKeyDown(event: KeyboardEvent): void {'
		);
		expect(handleKeyDownStart).toBeGreaterThan(-1);
		const handleKeyDownSlice = source.slice(handleKeyDownStart, handleKeyDownStart + 1200);
		expect(handleKeyDownSlice).toContain('const now = performance.now();');
		expect(handleKeyDownSlice).toContain('if (now - lastKeyTime < KEYDOWN_THROTTLE_MS) {');
		expect(handleKeyDownSlice).toContain('lastKeyTime = now;');
	});
});

describe('dogfood ISSUE-004 — Update Preview renders markdown', () => {
	it('short-circuits empty content and renders an empty-result message when needed', async () => {
		const source = await readSource('src/routes/admin/slides/+page.svelte');

		expect(source).toContain('Enter some Markdown content first.');
		expect(source).toContain('Markdown rendered to an empty result.');
		// previewRendered is now always set on success (no more typeof-based gate
		// that flipped to false when the html came back undefined).
		expect(source).toContain('previewRendered = true;');
		expect(source).toContain('if (content.trim().length === 0) {');
	});
});

describe('dogfood ISSUE-007 — --min-tap-size token rolled out everywhere', () => {
	it('declares the token and a .tap-target utility in app.css', async () => {
		const source = await readSource('src/app.css');
		expect(source).toContain('--min-tap-size: 2.75rem;');
		expect(source).toContain('.tap-target {');
		expect(source).toContain('min-width: var(--min-tap-size);');
		expect(source).toContain('min-height: var(--min-tap-size);');
	});

	it('applies the token to wrapped close buttons and the mode toggle', async () => {
		for (const path of [
			'src/lib/components/wrapped/StoryMode.svelte',
			'src/lib/components/wrapped/ScrollMode.svelte',
			'src/lib/components/wrapped/ModeToggle.svelte'
		]) {
			const source = await readSource(path);
			expect(source).toContain('var(--min-tap-size)');
		}
	});

	it('applies the token to admin layout chrome (sidebar menu button)', async () => {
		const layoutSource = await readSource('src/routes/admin/+layout.svelte');
		expect(layoutSource).toContain('width: var(--min-tap-size);');
		expect(layoutSource).toContain('height: var(--min-tap-size);');
	});

	it('applies the token to nested-route settings submit buttons via the tap-target class', async () => {
		// US-022 replaced the monolith's `.tab-button` + `.input-action` rules
		// with `class="tap-target"` on the 24 shadcn Button + AlertDialog.Action
		// instances across the 6 nested-route settings tabs (commit e59d7e5).
		// Spot-check one button per tab so a regression that drops the class
		// is caught at the source-pin level.
		const tabs = [
			'src/routes/admin/settings/system/+page.svelte',
			'src/routes/admin/settings/appearance/+page.svelte',
			'src/routes/admin/settings/privacy/+page.svelte',
			'src/routes/admin/settings/data/+page.svelte',
			'src/routes/admin/settings/connections/+page.svelte',
			'src/routes/admin/settings/security/+page.svelte'
		];
		for (const path of tabs) {
			const source = await readSource(path);
			expect(source).toContain('class="tap-target"');
		}
	});
});

// dogfood 2026-05-29 F1 — the onboarding Done page rendered the visible
// "Setup Complete!" heading as <h2> while OnboardingCard emitted an empty
// <h1> (title=""), skipping the h1 level. Fix promotes the visible title to
// <h1> in place (preserving the class-based shimmer + showContent fade-in),
// guards the card header so the empty title emits no <h1>, and demotes the
// summary <h3> to <h2> so heading order is h1->h2 with no skip.
describe('dogfood 2026-05-29 F1 — onboarding Done page heading hierarchy', () => {
	it('promotes the visible Done-page title to <h1> in place', async () => {
		const source = await readSource('src/routes/onboarding/complete/+page.svelte');
		expect(source).toContain('<h1 class="completion-title">Setup Complete!</h1>');
		expect(source).not.toContain('<h2 class="completion-title">');
	});

	it('demotes the configuration summary heading to <h2> (no skipped level)', async () => {
		const source = await readSource('src/routes/onboarding/complete/+page.svelte');
		expect(source).toContain('<h2 class="summary-title">');
		expect(source).not.toContain('<h3 class="summary-title">');
	});

	it('guards the OnboardingCard header so an empty title emits no <h1>', async () => {
		const source = await readSource('src/lib/components/onboarding/OnboardingCard.svelte');
		const headerStart = source.indexOf('<header class="card-header">');
		expect(headerStart).toBeGreaterThan(-1);
		const headerSlice = source.slice(headerStart, headerStart + 200);
		expect(headerSlice).toContain('{#if title}');
		expect(headerSlice).toContain('<h1 class="card-title">{title}</h1>');
	});
});

// dogfood 2026-05-29 F3 — a 1001-char username submitted from the landing
// lookup form was reported as a "silent reset". Verified working in source:
// UsernameSchema caps length at 100 and the action returns fail(400), so the
// form surfaces "Username is too long" via handleFormToast. This behavioural
// test pins that path so it can't regress. The public-landing-lookup toggle is
// enabled first so the (newer) toggle guard doesn't short-circuit with a 403
// before the username-length validation runs.
describe('dogfood 2026-05-29 F3 — long username lookup returns fail(400)', () => {
	it('rejects a >100-char username with fail(400) "Username is too long"', async () => {
		await setPublicLandingLookupEnabled(true);
		const formData = new FormData();
		formData.set('username', 'a'.repeat(1001));
		const request = new Request('http://localhost/?/lookupUser', {
			method: 'POST',
			body: formData
		});
		const handler = actions.lookupUser as NonNullable<typeof actions.lookupUser>;
		const result = await handler({ request } as Parameters<
			NonNullable<typeof actions.lookupUser>
		>[0]);
		expect(result).toMatchObject({
			status: 400,
			data: { error: 'Username is too long', requiresAuth: false }
		});
	});
});

// dogfood 2026-06-04 ISSUE-005 — client inputs gained inline `maxlength` hints
// mirroring the server Zod caps (openaiModel.max(100), slide title.max(200)) so
// over-length values are impossible to type rather than silently rejected later.
describe('dogfood 2026-06-04 ISSUE-005 — maxlength mirrors server Zod caps', () => {
	it('OpenAI Model input caps at 100 chars', async () => {
		const source = await readSource('src/routes/admin/settings/connections/+page.svelte');
		const idx = source.indexOf('name="openaiModel"');
		expect(idx).toBeGreaterThan(-1);
		// The attribute sits within the same <Input> element as name="openaiModel".
		const slice = source.slice(idx - 80, idx + 200);
		expect(slice).toContain('maxlength={100}');
	});

	it('Custom slide Title input caps at 200 chars', async () => {
		const source = await readSource('src/routes/admin/slides/+page.svelte');
		const idx = source.indexOf('name="title"');
		expect(idx).toBeGreaterThan(-1);
		const slice = source.slice(idx - 120, idx + 200);
		expect(slice).toContain('maxlength="200"');
	});
});

// dogfood 2026-06-04 ISSUE-007 — expanding "Advanced options" on the privacy tab
// could push each section's Save button below the fold. On expand only, the
// freshly-revealed section is scrolled into view so its content + actions stay
// reachable (onOpenChange -> tick() -> scrollIntoView on a bound section ref).
describe('dogfood 2026-06-04 ISSUE-007 — Advanced options stays reachable on expand', () => {
	it('scrolls the expanded Advanced section into view', async () => {
		const source = await readSource('src/routes/admin/settings/privacy/+page.svelte');
		expect(source).toContain('onOpenChange={handleAdvancedToggle}');
		expect(source).toContain('bind:this={advancedSectionRef}');

		const handlerStart = source.indexOf('async function handleAdvancedToggle(');
		expect(handlerStart).toBeGreaterThan(-1);
		const handlerSlice = source.slice(handlerStart, handlerStart + 320);
		// Expand-only guard, DOM settle, then scroll the section into view.
		expect(handlerSlice).toContain('if (!open) return;');
		expect(handlerSlice).toContain('await tick();');
		expect(handlerSlice).toContain('advancedSectionRef?.scrollIntoView(');
	});
});

// dogfood 2026-06-05 DF-020 — anonymous hit on /dashboard redirected to /
// without preserving the intended destination, so the user had to navigate
// back manually after login. The fix carries a validated returnTo parameter
// (guarded by isSafeReturnPath to prevent open-redirect abuse) so the login
// page can send the user to the right place.
describe('dogfood DF-020 — /dashboard anonymous redirect carries returnTo', () => {
	it('imports isSafeReturnPath and uses it in the redirect', async () => {
		const source = await readSource('src/routes/dashboard/+layout.server.ts');
		// Guard import must be present.
		expect(source).toContain("import { isSafeReturnPath } from '$lib/client/plex-login'");
		// The load function must accept url from the event.
		expect(source).toContain('url');
		// The safe-path guard must wrap the returnTo value.
		expect(source).toContain('isSafeReturnPath(');
		expect(source).toContain('returnTo=');
		// Fallback must still be '/'.
		expect(source).toContain(": '/';");
	});

	it('encodes the pathname into the returnTo query param', async () => {
		const source = await readSource('src/routes/dashboard/+layout.server.ts');
		expect(source).toContain('encodeURIComponent(requestedPath)');
	});
});
