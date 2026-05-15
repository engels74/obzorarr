import { describe, expect, it } from 'bun:test';

/**
 * Source-regression tests for the 2026-05-14 dogfood fixes. Each test pins
 * the structural change to the source so a future refactor can't silently
 * regress the dogfood-reported behaviour.
 */
async function readSource(path: string): Promise<string> {
	return Bun.file(path).text();
}

describe('dogfood ISSUE-003 — admin log settings persistence', () => {
	it('runs invalidateAll on success and restores state on failure', async () => {
		const source = await readSource('src/routes/admin/settings/+page.svelte');

		expect(source).toContain('function restoreLogSettings(): void {');
		expect(source).toContain('logRetentionDays = data.logSettings.retentionDays;');
		expect(source).toContain('logMaxCount = data.logSettings.maxCount;');
		expect(source).toContain('logDebugEnabled = data.logSettings.debugEnabled;');

		const enhanceStart = source.indexOf('action="?/updateLogSettings"');
		expect(enhanceStart).toBeGreaterThan(-1);
		const enhanceSlice = source.slice(enhanceStart, enhanceStart + 1200);
		expect(enhanceSlice).toContain('await update({ invalidateAll: true });');
		expect(enhanceSlice).toContain('await invalidateAll();');
		expect(enhanceSlice).toContain('restoreLogSettings();');
	});

	it('returns appVersion from the admin settings load function', async () => {
		const source = await readSource('src/routes/admin/settings/+page.server.ts');
		expect(source).toContain("import { getAppVersion } from '$lib/server/version';");
		expect(source).toContain('appVersion: getAppVersion()');
	});
});

describe('dogfood ISSUE-002 — server-wide wrapped + user defaults persistence', () => {
	it('invalidates on the failure path so OCC settingsVersion refreshes', async () => {
		const source = await readSource('src/routes/admin/settings/+page.svelte');

		const serverWrappedStart = source.indexOf('action="?/updateServerWrappedSettings"');
		expect(serverWrappedStart).toBeGreaterThan(-1);
		const serverWrappedSlice = source.slice(serverWrappedStart, serverWrappedStart + 1200);
		expect(serverWrappedSlice).toContain('restoreServerWrappedSettings();');
		// Two await invalidateAll() calls in the block: one in the success
		// branch, one after restore in the failure branch.
		const occurrences = serverWrappedSlice.match(/await invalidateAll\(\);/g);
		expect(occurrences?.length).toBeGreaterThanOrEqual(2);

		const userDefaultsStart = source.indexOf('action="?/updateUserDefaults"');
		expect(userDefaultsStart).toBeGreaterThan(-1);
		const userDefaultsSlice = source.slice(userDefaultsStart, userDefaultsStart + 1200);
		expect(userDefaultsSlice).toContain('restoreUserDefaults();');
		const userOccurrences = userDefaultsSlice.match(/await invalidateAll\(\);/g);
		expect(userOccurrences?.length).toBeGreaterThanOrEqual(2);
	});
});

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
		expect(handleKeyDownSlice).toContain('const now = Date.now();');
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

	it('applies the token to admin chrome controls', async () => {
		const layoutSource = await readSource('src/routes/admin/+layout.svelte');
		expect(layoutSource).toContain('width: var(--min-tap-size);');
		expect(layoutSource).toContain('height: var(--min-tap-size);');

		const settingsSource = await readSource('src/routes/admin/settings/+page.svelte');
		// `.tab-button` got a min-height floor; `.input-action` got both axes.
		const tabButtonIdx = settingsSource.indexOf('.tab-button {');
		expect(tabButtonIdx).toBeGreaterThan(-1);
		expect(settingsSource.slice(tabButtonIdx, tabButtonIdx + 600)).toContain(
			'min-height: var(--min-tap-size);'
		);
		const inputActionIdx = settingsSource.indexOf('.input-action {');
		expect(inputActionIdx).toBeGreaterThan(-1);
		const inputActionSlice = settingsSource.slice(inputActionIdx, inputActionIdx + 600);
		expect(inputActionSlice).toContain('min-width: var(--min-tap-size);');
		expect(inputActionSlice).toContain('min-height: var(--min-tap-size);');
	});
});
