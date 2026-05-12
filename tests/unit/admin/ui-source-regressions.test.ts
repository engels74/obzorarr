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

	it('auto-runs the reverse-proxy diagnostic once on the security tab', async () => {
		const source = await readSource('src/routes/admin/settings/+page.svelte');

		expect(source).toContain('let isCheckingTrustProxyDiagnostic = $state(false);');
		expect(source).toContain('let trustProxyDiagnosticAutoRunStarted = $state(false);');
		expect(source).toContain(
			"if (activeTab !== 'security' || trustProxyDiagnosticAutoRunStarted) return;"
		);
		expect(source).toContain('trustProxyDiagnosticAutoRunStarted = true;');
		expect(source).toContain('void runTrustProxyDiagnostic();');
	});

	it('guards duplicate reverse-proxy diagnostic requests and exposes a manual check', async () => {
		const source = await readSource('src/routes/admin/settings/+page.svelte');

		expect(source).toContain('async function runTrustProxyDiagnostic()');
		expect(source).toContain('if (isCheckingTrustProxyDiagnostic) return;');
		expect(source).toContain('/api/security/reverse-proxy-diagnostic');
		expect(source).toContain("params.set('browserOrigin', browserOrigin);");
		expect(source).toContain('Check again');
		expect(source).toContain('disabled={isCheckingTrustProxyDiagnostic}');
		expect(source).toContain('What your browser used');
		expect(source).toContain('What Obzorarr sees');
		expect(source).toContain('Forwarded headers detected');
		expect(source).toContain('Recommendation');
	});

	it('keeps the diagnostic read-only while preserving the explicit enable flow', async () => {
		const source = await readSource('src/routes/admin/settings/+page.svelte');
		const diagnosticFunction = source.match(
			/async function runTrustProxyDiagnostic\(\) \{[\s\S]*?\n\}/
		)?.[0];

		expect(diagnosticFunction).toBeDefined();
		expect(diagnosticFunction).not.toContain('?/updateTrustProxy');
		expect(source).toContain('bind:open={trustProxyConfirmDialogOpen}');
		expect(source).toContain('name="confirmRisk" value="true"');
	});

	it('explains env-locked reverse-proxy trust and common setup examples', async () => {
		const source = await readSource('src/routes/admin/settings/+page.svelte');

		expect(source).toContain('Change');
		expect(source).toContain('it in your environment, container, or compose configuration');
		expect(source).toContain('Update your environment or');
		expect(source).toContain('container configuration to change it.');
		expect(source).toContain('Already controlled by environment');
		expect(source).toContain('Nginx Proxy Manager');
		expect(source).toContain('Nginx');
		expect(source).toContain('Caddy');
		expect(source).toContain('Traefik');
		expect(source).toContain('Pangolin');
		expect(source).toContain('Tailscale/headscale');
		expect(source).toContain('Docker bridge or host networking');
		expect(source).toContain('LAN/private IP access');
		expect(source).toContain('localhost setups');
		expect(source).toContain('strips visitor-supplied');
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
		expect(source).toContain(
			'function selectFrequencyMode(mode: typeof data.funFactFrequency.mode): void'
		);
		expect(source).toContain("checked={selectedFrequencyMode === 'few'}");
		expect(source).toContain("checked={selectedFrequencyMode === 'normal'}");
		expect(source).toContain("checked={selectedFrequencyMode === 'many'}");
		expect(source).toContain("checked={selectedFrequencyMode === 'custom'}");
		expect(source).toContain("onchange={() => selectFrequencyMode('few')}");
		expect(source).toContain("onchange={() => selectFrequencyMode('normal')}");
		expect(source).toContain("onchange={() => selectFrequencyMode('many')}");
		expect(source).toContain("onchange={() => selectFrequencyMode('custom')}");
		expect(source).not.toContain('bind:group={selectedFrequencyMode}');
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

	it('traps focus in the open mobile admin drawer and marks page content inert', async () => {
		const source = await readSource('src/routes/admin/+layout.svelte');

		expect(source).toContain(
			'let mainContentHiddenFromMobile = $derived(isMobileSidebar && sidebarOpen);'
		);
		expect(source).toContain('function trapSidebarFocus(event: KeyboardEvent)');
		expect(source).toContain(
			"if (!isMobileSidebar || !sidebarOpen || event.key !== 'Tab') return;"
		);
		expect(source).toContain(
			'(activeElement === last || !sidebarElement?.contains(activeElement))'
		);
		expect(source).toContain('if (focusableElements.length === 0) {');
		expect(source).toContain('sidebarElement?.focus();');
		expect(source).toMatch(/<aside[\s\S]*tabindex="-1"[\s\S]*bind:this=\{sidebarElement\}/);
		expect(source).toContain('onkeydown={trapSidebarFocus}');
		expect(source).toContain('bind:this={sidebarElement}');
		expect(source).toContain('function handleWindowKeydown(event: KeyboardEvent)');
		expect(source).toContain('void closeSidebar();');
		expect(source).toContain('inert={mainContentHiddenFromMobile}');
		expect(source).toContain("aria-hidden={mainContentHiddenFromMobile ? 'true' : undefined}");
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
		expect(source).toContain(
			'function hasVisibleAvatar(user: (typeof data.users)[number]): boolean'
		);
		expect(source).toContain('function markAvatarFailed(userId: number): void');
		expect(source).toContain('{#if hasVisibleAvatar(user)}');
		expect(source).toContain('onerror={() => markAvatarFailed(user.id)}');
		expect(source.match(/onerror=\{\(\) => markAvatarFailed\(user\.id\)\}/g)).toHaveLength(2);
		expect(source).toContain('<span class="user-avatar placeholder">&#9787;</span>');
		expect(source).toContain('{#if user.hasWatchHistory}');
		expect(source).toContain('<a href={user.wrappedHref} class="user-name">');
		expect(source).toContain('class="preview-link"');
	});

	it('does not render wrapped links for admin users without watch history', async () => {
		const [clientSource, serverSource] = await Promise.all([
			readSource('src/routes/admin/users/+page.svelte'),
			readSource('src/routes/admin/users/+page.server.ts')
		]);

		expect(serverSource).toContain('totalPlays: u.totalPlays');
		expect(serverSource).toContain('hasWatchHistory: u.hasWatchHistory');
		expect(clientSource).toContain("if (minutes === 0) return '0h';");
		expect(clientSource).toContain("if (minutes > 0 && minutes < 60) return '<1h';");
		expect(clientSource).toContain('{#if user.hasWatchHistory}');
		expect(clientSource).toContain('<span class="preview-link unavailable">No Wrapped yet</span>');
		expect(clientSource).toContain(
			'<span class="preview-link unavailable mobile-preview-link">No Wrapped yet</span>'
		);
		expect(clientSource).toContain('.preview-link.unavailable');
	});

	it('uses client navigation for unmodified admin links while preserving real hrefs', async () => {
		const [layoutSource, dashboardSource] = await Promise.all([
			readSource('src/routes/admin/+layout.svelte'),
			readSource('src/routes/admin/+page.svelte')
		]);

		for (const source of [layoutSource, dashboardSource]) {
			expect(source).toContain('import { goto');
			expect(source).toContain('function shouldUseClientNavigation');
			expect(source).toContain('event.button === 0');
			expect(source).toContain('!event.metaKey');
			expect(source).toContain('!event.ctrlKey');
			expect(source).toContain('!event.shiftKey');
			expect(source).toContain('!event.altKey');
		}

		expect(layoutSource).toContain('void goto(href, { keepFocus: shouldRestoreFocus });');
		expect(dashboardSource).toContain('void goto(href);');
		expect(layoutSource).toContain('href={item.href}');
		expect(layoutSource).toContain('onclick={handleAdminNavigation}');
		expect(dashboardSource).toContain('href="/admin/settings" class="action-card"');
		expect(dashboardSource).toContain('onclick={handleAdminNavigation}');
	});

	it('uses client navigation for wrapped config cards while preserving real hrefs', async () => {
		const source = await readSource('src/routes/admin/wrapped/+page.svelte');

		expect(source).toContain('import { goto }');
		expect(source).toContain('function shouldUseClientNavigation');
		expect(source).toContain('event.button === 0');
		expect(source).toContain('!event.metaKey');
		expect(source).toContain('!event.ctrlKey');
		expect(source).toContain('!event.shiftKey');
		expect(source).toContain('!event.altKey');
		expect(source).toContain('function handleConfigNavigation');
		expect(source).toContain('void goto(href);');
		expect(source).toContain(
			'<a href="/admin/slides" class="config-card" onclick={handleConfigNavigation}>'
		);
		expect(source).toContain(
			'<a href="/admin/settings?tab=privacy" class="config-card" onclick={handleConfigNavigation}>'
		);
		expect(source).toContain(
			'<a href="/admin/settings?tab=appearance" class="config-card" onclick={handleConfigNavigation}>'
		);
		expect(source).toContain('Theme and logo visibility');
		expect(source).not.toContain('Theme, logo visibility, and anonymization');
	});

	it('stacks the slide order header controls on narrow screens', async () => {
		const source = await readSource('src/routes/admin/slides/+page.svelte');

		expect(source).toContain('class="section-title-content"');
		expect(source).toContain('.section-title-content');
		expect(source).toContain('min-width: 0;');
		expect(source).toContain('@media (max-width: 430px)');
		expect(source).toContain('flex-direction: column;');
		expect(source).toContain('align-items: stretch;');
		expect(source).toContain('width: 100%;');
		expect(source).toContain('justify-content: center;');
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
		expect(source).toContain('localMode = mode;');
		expect(source).not.toContain('checked={isUpdating ?');
		expect(source).not.toContain('optimisticMode');
	});

	it('refreshes wrapped share modal data on open before enabling controls', async () => {
		const source = await readSource('src/lib/components/wrapped/ShareModal.svelte');

		expect(source).toContain("import { goto, invalidateAll } from '$app/navigation';");
		expect(source).toContain('let isRefreshing = $state(false);');
		expect(source).toContain('const controlsDisabled = $derived(isUpdating || isRefreshing);');
		expect(source).toContain('async function refreshShareData()');
		expect(source).toContain('await invalidateAll();');
		expect(source).toContain("console.warn('Failed to refresh share data:', error);");
		expect(source).toContain('void refreshShareData();');
		expect(source).toContain('disabled={controlsDisabled || isBelowFloor(mode as ShareModeType)}');
		expect(source).toContain('disabled={controlsDisabled}');
	});

	it('disables share modes that are more permissive than the server privacy floor', async () => {
		const [shareModalSource, dashboardSource] = await Promise.all([
			readSource('src/lib/components/wrapped/ShareModal.svelte'),
			readSource('src/routes/dashboard/settings/+page.svelte')
		]);

		for (const source of [shareModalSource, dashboardSource]) {
			expect(source).toContain('class:below-floor={isBelowFloor');
			expect(source).toContain('aria-disabled={isBelowFloor');
			expect(source).toContain('disabled={');
			expect(source).toContain('isBelowFloor');
			expect(source).toContain('floor-note');
		}
	});

	it('guards wrapped share modal onchange from submitting below-floor modes', async () => {
		const source = await readSource('src/lib/components/wrapped/ShareModal.svelte');

		expect(source).toContain('function submitModeChange(event: Event, mode: ShareModeType)');
		expect(source).toContain('if (controlsDisabled || isBelowFloor(mode))');
		expect(source).toContain('event.preventDefault();');
		expect(source).toContain('restoreLocalShareState();');
		expect(source).toContain('onchange={(e) => submitModeChange(e, mode as ShareModeType)}');
	});

	it('invalidates wrapped share modal page data after failed mode updates', async () => {
		const source = await readSource('src/lib/components/wrapped/ShareModal.svelte');
		const updateShareModeForm = source.match(
			/action="\?\/updateShareMode"[\s\S]*?<div class="mode-options"/
		)?.[0];

		expect(updateShareModeForm).toBeDefined();
		expect(updateShareModeForm).toContain('applyShareActionData(result.data);');
		expect(updateShareModeForm).toContain('await invalidateAll();');
		expect(updateShareModeForm).not.toContain('restoreLocalShareState();');
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

	it('keeps wrapped summary button actions from bubbling into slideshow handlers', async () => {
		const source = await readSource('src/lib/components/wrapped/SummaryPage.svelte');

		expect(source).toContain(
			'function handleActionClick(event: MouseEvent, action: () => void): void'
		);
		expect(source).toContain('event.preventDefault();');
		expect(source).toContain('event.stopPropagation();');
		expect(source).toContain('onclick={(event) => handleActionClick(event, onRestart)}');
		expect(source).toContain('onclick={(event) => handleActionClick(event, onShare)}');
		expect(source).toContain('onclick={(event) => handleActionClick(event, onHome)}');
	});

	it('returns server wrapped users home to the public root', async () => {
		const source = await readSource('src/routes/wrapped/[year]/+page.svelte');
		const handleHome = source.match(/function handleHome\(\): void \{[\s\S]*?\n\}/)?.[0];

		expect(handleHome).toBeDefined();
		expect(handleHome).toContain("goto('/');");
		expect(handleHome).not.toContain("goto('/admin');");
		expect(handleHome).not.toContain("goto('/dashboard');");
	});

	it('applies regenerated dashboard share URLs before reloading page data', async () => {
		const source = await readSource('src/routes/dashboard/settings/+page.svelte');

		expect(source).toContain('let wrappedHrefOverride = $state<string | null>(null);');
		expect(source).toContain('let syncedWrappedHref = $state(data.wrappedHref);');
		expect(source).toContain('wrappedHrefOverride ?? data.wrappedHref');
		expect(source).toContain("payload.action === 'regenerateToken'");
		expect(source).toContain("typeof payload.wrappedHref === 'string'");
		expect(source).toContain('wrappedHrefOverride = payload.wrappedHref;');
		expect(source).toContain('regenerateDialogOpen = false;');
		expect(source).toContain('await invalidateAll();');
	});

	it('renders accessible status feedback for data count actions', async () => {
		const source = await readSource('src/routes/admin/settings/+page.svelte');

		expect(source).toContain('let cacheCountResultElement: HTMLElement | undefined = $state();');
		expect(source).toContain('let historyCountResultElement: HTMLElement | undefined = $state();');
		expect(source).toContain('async function focusCountResult');
		expect(source).toContain("import { prefersReducedMotion } from 'svelte/motion';");
		expect(source).toContain("behavior: prefersReducedMotion.current ? 'auto' : 'smooth'");
		expect(source).toContain('element.focus({ preventScroll: true });');
		expect(source).toContain(
			'message: `$' + '{cacheCountResult.label}: $' + '{formatRecordCount(cacheCountResult.count)}`'
		);
		expect(source).toContain(
			'message: `$' +
				'{historyCountResult.label}: $' +
				'{formatRecordCount(historyCountResult.count)}`'
		);
		expect(source).toContain('bind:this={cacheCountResultElement}');
		expect(source).toContain('bind:this={historyCountResultElement}');
		expect(source.match(/role="status"/g)).toHaveLength(2);
		expect(source.match(/aria-live="polite"/g)).toHaveLength(2);
	});

	it('explains bootstrap and claim expiry on the onboarding claim page', async () => {
		const source = await readSource('src/routes/onboarding/claim/+page.svelte');

		expect(source).toContain('Active claims expire after 10 minutes');
		expect(source).toContain('bootstrap tokens expire after 15 minutes');
		expect(source).toContain('use the current console token');
		expect(source).toContain('restart the');
		expect(source).toContain('server to print a new banner');
	});

	it('renders invalid cron feedback inline while disabling schedule save', async () => {
		const source = await readSource('src/routes/admin/sync/+page.svelte');

		expect(source).toContain('const cronError = $derived(validateCron(cronExpression));');
		expect(source).toContain("aria-invalid={cronError ? 'true' : 'false'}");
		expect(source).toContain("aria-describedby={cronError ? 'cronExpression-error' : undefined}");
		expect(source).toContain('disabled={!!cronError}');
		expect(source).toContain('id="cronExpression-error"');
		expect(source).toContain('class="cron-error"');
		expect(source).toContain('role="alert"');
	});

	it('wires Clear All Logs through a visible confirmation dialog', async () => {
		const source = await readSource('src/routes/admin/logs/+page.svelte');

		expect(source).toContain('let clearLogsDialogOpen = $state(false);');
		expect(source).toContain('onclick={() => (clearLogsDialogOpen = true)}');
		expect(source).toContain('<AlertDialog.Root bind:open={clearLogsDialogOpen}>');
		expect(source).toContain('<AlertDialog.Title>Clear all logs?</AlertDialog.Title>');
		expect(source).toContain(
			'<AlertDialog.Cancel disabled={isClearingLogs}>Cancel</AlertDialog.Cancel>'
		);
		expect(source).toContain('action="?/clearLogs"');
		expect(source).toContain('isClearingLogs = true;');
		expect(source).toContain('await refreshAfterLogMutation(update);');
		expect(source).toContain('clearLogsDialogOpen = false;');
		expect(source).toContain("{isClearingLogs ? 'Clearing");
	});

	it('keeps wrapped keyboard focus visible on the mode toggle and StoryMode container', async () => {
		const [modeToggleSource, storyModeSource] = await Promise.all([
			readSource('src/lib/components/wrapped/ModeToggle.svelte'),
			readSource('src/lib/components/wrapped/StoryMode.svelte')
		]);

		expect(modeToggleSource).toContain('.mode-toggle:focus-visible');
		expect(modeToggleSource).toContain('outline: 3px solid #ffffff;');
		expect(modeToggleSource).toContain('box-shadow:');
		expect(modeToggleSource).toContain('0 0 0 8px var(--primary, #dc2626);');
		expect(storyModeSource).toContain('tabindex="0"');
		expect(storyModeSource).toContain('.story-mode:focus-visible');
		expect(storyModeSource).toContain('inset 0 0 0 3px #ffffff');
		expect(storyModeSource).toContain('inset 0 0 0 6px var(--primary, #dc2626)');
		expect(storyModeSource).toContain('class="focus-ring" aria-hidden="true"');
		expect(storyModeSource).toContain('.story-mode:focus-visible .focus-ring');
		expect(storyModeSource).toContain('z-index: 100;');
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
