import { describe, expect, it } from 'bun:test';

async function readSource(path: string): Promise<string> {
	return Bun.file(path).text();
}

describe('admin UI source regressions', () => {
	it('uses the effective visible log collection for empty filtered results', async () => {
		const source = await readSource('src/routes/admin/logs/+page.svelte');

		expect(source).toContain('const allLogs = $derived.by(() => {');
		expect(source).toContain('const seen = new Set<number>();');
		expect(source).toContain('if (seen.has(log.id)) continue;');
		expect(source).toContain(
			'const visibleLogs = $derived(allLogs.filter(matchesVisibleFilters));'
		);
		expect(source).toContain('{#if visibleLogs.length === 0}');
		expect(source).not.toContain('{#if allLogs.length === 0}');
	});

	it('exports logs through a temporary document anchor and reports failures', async () => {
		const source = await readSource('src/routes/admin/logs/+page.svelte');

		expect(source).toContain('document.body.append(a);');
		expect(source).toContain('a.click();');
		expect(source).toContain('a.remove();');
		expect(source).toContain('setTimeout(() => URL.revokeObjectURL(url), 1000);');
		expect(source).toContain("toast.error('Failed to export logs');");
	});

	it('normalizes admin log search before URL and local filtering', async () => {
		const clientSource = await readSource('src/routes/admin/logs/+page.svelte');
		const serverSource = await readSource('src/routes/admin/logs/+page.server.ts');

		expect(clientSource).toContain('let normalizedSearchText = $derived(searchText.trim());');
		expect(clientSource).toContain(
			'let normalizedSearchLower = $derived(normalizedSearchText.toLowerCase());'
		);
		expect(clientSource).toContain('const search = (overrides?.search ?? searchText).trim();');
		expect(clientSource).toContain(
			'if (normalizedSearchLower && !log.message.toLowerCase().includes(normalizedSearchLower))'
		);
		expect(serverSource).toContain('function normalizeSearchParam(search: string | null)');
		expect(serverSource).toContain('const normalized = search?.trim();');
		expect(serverSource).toContain(
			"const search = normalizeSearchParam(url.searchParams.get('search'));"
		);
	});

	it('renders security help as real disclosure buttons', async () => {
		const source = await readSource('src/routes/admin/settings/+page.svelte');

		expect(source).toContain('aria-expanded={csrfHelpOpen}');
		expect(source).toContain('aria-controls="csrf-help-panel"');
		expect(source).toContain('aria-expanded={trustProxyHelpOpen}');
		expect(source).toContain('aria-controls="trust-proxy-help-panel"');
		expect(source).not.toContain('role="button"');
	});

	it('labels mobile settings tab buttons and exposes their active state', async () => {
		const source = await readSource('src/routes/admin/settings/+page.svelte');

		expect(source).toContain('aria-label={`Open $' + '{tab.label} settings`}');
		expect(source).toContain('aria-pressed={activeTab === tab.value}');
		expect(source).toContain("aria-current={activeTab === tab.value ? 'page' : undefined}");
	});

	it('requires confirmation before enabling reverse-proxy header trust', async () => {
		const source = await readSource('src/routes/admin/settings/+page.svelte');

		expect(source).toContain('bind:open={trustProxyConfirmDialogOpen}');
		expect(source).toContain('name="confirmRisk" value="true"');
		expect(source).toContain('Enable reverse-proxy header trust?');
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
		expect(source).toContain(
			'untrack(() => `$' + '{data.funFactFrequency.mode}:$' + '{data.funFactFrequency.count}`)'
		);
		expect(source).toContain('frequencyKey === syncedFrequencyKey');
		expect(source).toContain(
			'syncedFrequencyKey = `$' + '{frequency.mode}:$' + '{frequency.count}`;'
		);
		expect(source).not.toContain('class="frequency-options" onclick');
	});

	it('traps focus in the custom slide modal and marks page content inert', async () => {
		const source = await readSource('src/routes/admin/slides/+page.svelte');

		expect(source).toContain('function trapEditorFocus(event: KeyboardEvent)');
		expect(source).toContain("if (event.key !== 'Tab') return;");
		expect(source).toContain('!event.shiftKey &&');
		expect(source).toContain(
			'(activeElement === last || !editorModalRef?.contains(activeElement))'
		);
		expect(source).toContain('bind:this={editorTitleInputRef}');
		expect(source).toContain('queueMicrotask(() => editorTitleInputRef?.focus());');
		expect(source).toContain('queueMicrotask(() => trigger?.focus());');
		expect(source).toContain('inert={showEditor}');
		expect(source).toContain("aria-hidden={showEditor ? 'true' : undefined}");
	});

	it('marks onboarding theme swatches as pressed when selected', async () => {
		const source = await readSource('src/routes/onboarding/settings/+page.svelte');

		expect(source).toContain('aria-pressed={uiTheme === option.value}');
		expect(source).toContain('aria-pressed={wrappedTheme === option.value}');
	});

	it('removes the closed mobile admin sidebar from the accessibility tree and tab order', async () => {
		const source = await readSource('src/routes/admin/+layout.svelte');

		expect(source).toContain("window.matchMedia('(max-width: 768px)')");
		expect(source).toContain(
			'let sidebarHiddenFromMobile = $derived(isMobileSidebar && !sidebarOpen);'
		);
		expect(source).toContain('inert={sidebarHiddenFromMobile}');
		expect(source).toContain("aria-hidden={sidebarHiddenFromMobile ? 'true' : undefined}");
		expect(source).toContain('visibility: hidden;');
		expect(source).toContain('pointer-events: none;');
		expect(source).toContain('visibility: visible;');
		expect(source).toContain('pointer-events: auto;');
	});

	it('keeps the open mobile admin drawer header self-contained', async () => {
		const source = await readSource('src/routes/admin/+layout.svelte');

		expect(source).toMatch(
			/<header\b(?=[^>]*\bclass="[^"]*\bmobile-header\b[^"]*")(?=[^>]*\bclass:sidebar-open=\{sidebarOpen\})[^>]*>/
		);
		expect(source).toContain('aria-label="Close navigation"');
		expect(source).toContain('class="sidebar-close-button"');
		expect(source).toContain('.mobile-header.sidebar-open');
		expect(source).toContain('visibility: hidden;');
		expect(source).toContain('pointer-events: none;');
		expect(source).toContain('min-width: 0;');
		expect(source).toContain('text-overflow: ellipsis;');
		expect(source).not.toMatch(/<a\b[^>]*>(?:(?!<\/a>).)*<a\b/s);
	});

	it('renders user avatars as decorative non-link artwork', async () => {
		const source = await readSource('src/routes/admin/users/+page.svelte');

		expect(source).toContain('<span class="user-avatar-link" aria-hidden="true">');
		expect(source).not.toContain('<a href={user.wrappedHref} class="user-avatar-link">');
		expect(source).toContain('<img src={user.thumb} alt="" class="user-avatar" />');
		expect(source).toContain('<a href={user.wrappedHref} class="user-name">');
		expect(source).toContain('class="preview-link"');
	});

	it('updates wrapped logo mode selection explicitly without resetting local clicks', async () => {
		const source = await readSource('src/routes/admin/settings/+page.svelte');

		expect(source).toContain(
			'let selectedWrappedLogoMode = $state<WrappedLogoModeValue>(untrack(() => data.wrappedLogoMode));'
		);
		expect(source).toContain(
			'let syncedWrappedLogoMode = $state<WrappedLogoModeValue>(untrack(() => data.wrappedLogoMode));'
		);
		expect(source).toContain('if (serverWrappedLogoMode === syncedWrappedLogoMode) return;');
		expect(source).toContain('function selectWrappedLogoMode(mode: WrappedLogoModeValue): void');
		expect(source).toContain('{#each data.wrappedLogoOptions as option}');
		expect(source).toContain('for={optionId}');
		expect(source).toContain('name="logoMode"');
		expect(source).toContain('checked={selectedWrappedLogoMode === option.value}');
		expect(source).toContain('onchange={() => selectWrappedLogoMode(option.value)}');
		expect(source).not.toContain('bind:group={selectedWrappedLogoMode}');
	});

	it('uses real onboarding privacy field names for submitted controls', async () => {
		const source = await readSource('src/routes/onboarding/settings/+page.svelte');

		expect(source).toContain('name="logoMode"');
		expect(source).toContain('name="defaultShareMode"');
		expect(source).toContain('name="allowUserControl"');
		expect(source).not.toContain('name="wrappedLogoModeRadio"');
		expect(source).not.toContain('name="shareModeRadio"');
	});

	it('keeps share modal radios checked from local state while updating', async () => {
		const source = await readSource('src/lib/components/wrapped/ShareModal.svelte');

		expect(source).toContain('let localMode = $state<ShareModeType>');
		expect(source).toContain('let localShareToken = $state<string | null | undefined>');
		expect(source).toContain('checked={displayMode === mode}');
		expect(source).toContain('localMode = mode as ShareModeType;');
		expect(source).not.toContain('checked={isUpdating ?');
		expect(source).not.toContain('optimisticMode');
	});

	it('does not log Plex auth payloads from app-owned browser auth code', async () => {
		const sources = await Promise.all([
			readSource('src/lib/client/plex-login.ts'),
			readSource('src/routes/auth/plex/redirect/+page.svelte')
		]);

		for (const source of sources) {
			expect(source).not.toContain('console.log');
			expect(source).not.toContain('console.debug');
			expect(source).not.toContain('console.info');
		}
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
