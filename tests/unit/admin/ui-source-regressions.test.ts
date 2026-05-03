import { describe, expect, it } from 'bun:test';

async function readSource(path: string): Promise<string> {
	return Bun.file(path).text();
}

describe('admin UI source regressions', () => {
	it('uses the effective visible log collection for empty filtered results', async () => {
		const source = await readSource('src/routes/admin/logs/+page.svelte');

		expect(source).toContain(
			'const visibleLogs = $derived(allLogs.filter(matchesVisibleFilters));'
		);
		expect(source).toContain('{#if visibleLogs.length === 0}');
		expect(source).not.toContain('{#if allLogs.length === 0}');
	});

	it('renders security help as real disclosure buttons', async () => {
		const source = await readSource('src/routes/admin/settings/+page.svelte');

		expect(source).toContain('aria-expanded={csrfHelpOpen}');
		expect(source).toContain('aria-controls="csrf-help-panel"');
		expect(source).toContain('aria-expanded={trustProxyHelpOpen}');
		expect(source).toContain('aria-controls="trust-proxy-help-panel"');
		expect(source).not.toContain('role="button"');
	});

	it('keeps the users table desktop-only and renders a mobile list', async () => {
		const source = await readSource('src/routes/admin/users/+page.svelte');

		expect(source).toContain('class="mobile-users-list"');
		expect(source).toContain('.users-table-wrapper');
		expect(source).toContain('display: none;');
		expect(source).toContain('@media (max-width: 430px)');
	});

	it('does not reset custom fun fact frequency selection on every local click', async () => {
		const source = await readSource('src/routes/admin/slides/+page.svelte');

		expect(source).toContain('syncedFrequencyKey');
		expect(source).toContain('frequencyKey === syncedFrequencyKey');
		expect(source).not.toContain('class="frequency-options" onclick');
	});

	it('guards wrapped story transitions against stale rapid navigation', async () => {
		const source = await readSource('src/lib/components/wrapped/StoryMode.svelte');

		expect(source).toContain('let transitionToken = 0;');
		expect(source).toContain('async function animateTransition');
		expect(source).toContain('await tick();');
		expect(source).toContain('token === transitionToken');
		expect(source).toContain('function startNavigation');
	});
});
