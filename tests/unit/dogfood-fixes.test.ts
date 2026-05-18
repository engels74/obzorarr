import { describe, expect, it } from 'bun:test';

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
		const source = await readSource('src/routes/wrapped/[year]/+page.svelte');

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
		const source = await readSource('src/routes/wrapped/[year]/u/[identifier]/+page.svelte');

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
