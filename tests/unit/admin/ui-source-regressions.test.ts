import { describe, expect, it } from 'bun:test';

async function readSource(path: string): Promise<string> {
	return Bun.file(path).text();
}

// US-022 disposition log — when the 4779-line monolith at
// src/routes/admin/settings/+page.svelte was deleted (commit cf958fa),
// 9 tests in this file fell out:
//
//   - renders security help as real disclosure buttons              → DELETED  (feature deferred from nested-route Security tab)
//   - labels mobile settings tab buttons                            → DELETED  (mobile tab UX not in nested layout)
//   - requires confirmation before enabling reverse-proxy header trust → RE-POINTED to security/+page.svelte
//   - auto-runs the reverse-proxy diagnostic                        → DELETED  (feature deferred)
//   - guards duplicate reverse-proxy diagnostic requests            → DELETED  (feature deferred)
//   - keeps the diagnostic read-only                                → DELETED  (feature deferred)
//   - explains env-locked reverse-proxy trust + setup examples      → DELETED  (docs section deferred)
//   - updates wrapped logo mode selection explicitly                → REPLACED (logo-mode RadioGroup spot-check in appearance/+page.svelte)
//   - renders accessible status feedback for data count             → RE-POINTED to data/+page.svelte
//
// The deletes correspond to features deliberately not carried over to the
// nested routes (the reverse-proxy diagnostic auto-run + dup-guard + read-only
// + env-locked docs section; the security-help disclosures; the mobile tab
// UX — those last two ate the monolith's tab nav, which the nested layout
// replaces with desktop-style tab links). Each is recoverable as a follow-up
// if any of those features turn out to be load-bearing.

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

	// MONOLITH-DELETED (US-022, commit replacing the 4779-line +page.svelte
	// with a redirect stub). The following monolith-pinned tests were
	// dispositioned per the in-file audit:
	//   - security-help disclosure buttons  → DELETED (feature not in nested route Security tab)
	//   - mobile settings tab button labels → DELETED (nested layout uses desktop tab nav)
	//   - reverse-proxy diagnostic auto-run + dup-guard + read-only + env-locked docs
	//     → DELETED (diagnostic + docs section intentionally not ported to nested route)
	// Trust-proxy confirmation dialog re-points to the nested Security route:
	it('requires confirmation before enabling reverse-proxy header trust (nested Security route)', async () => {
		const source = await readSource('src/routes/admin/settings/security/+page.svelte');

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

		// Server-syncing guard (still required so a load-time prop refresh
		// doesn't clobber an unsaved Custom selection).
		expect(source).toContain('syncedFrequencyKey');
		expect(source).toContain(
			'untrack(() => `$' + '{data.funFactFrequency.mode}:$' + '{data.funFactFrequency.count}`)'
		);
		expect(source).toContain('frequencyKey === syncedFrequencyKey');
		expect(source).toContain(
			'syncedFrequencyKey = `$' + '{frequency.mode}:$' + '{frequency.count}`;'
		);
		// Custom radio is now wired via Svelte 5's bind:group (canonical pattern
		// for radio groups). The previous manual checked={…} + onchange={…}
		// round-trip raced against Svelte's DOM update batching on rapid clicks
		// and silently dropped the Custom selection. Asserting the new pattern
		// guards against regressions back to the manual flow.
		expect(source).toContain('bind:group={selectedFrequencyMode}');
		expect(source).toContain('value="few"');
		expect(source).toContain('value="normal"');
		expect(source).toContain('value="many"');
		expect(source).toContain('value="custom"');
		expect(source).not.toContain("checked={selectedFrequencyMode === 'few'}");
		expect(source).not.toContain('onchange={() => selectFrequencyMode(');
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
		// The "Preview Wrapped" link now renders for every user row, including
		// the admin's own (who would otherwise be blocked by a No-Wrapped gate
		// even though they have a real tokenized wrapped URL). When the user has
		// no plays we still render the link but label it "Preview (no data)" so
		// the wrapped page handles the empty-state slide rendering.
		expect(clientSource).toContain(
			"user.hasWatchHistory ? 'Preview Wrapped' : 'Preview (no data)'"
		);
		expect(clientSource).not.toContain('No Wrapped yet');
		expect(clientSource).not.toContain('.preview-link.unavailable');
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

	// US-022 / monolith deletion — wrapped logo mode is now an Appearance tab
	// RadioGroup driven by use:enhance (commit a46279c). The monolith's
	// selectedWrappedLogoMode + syncedWrappedLogoMode state machine doesn't
	// exist anymore; the equivalent UX is handled by the RadioGroup
	// primitive's controlled value. Source assertion re-points to the nested
	// Appearance route:
	it('binds the wrapped logo mode RadioGroup in the Appearance route', async () => {
		const source = await readSource('src/routes/admin/settings/appearance/+page.svelte');

		expect(source).toContain('action="?/updateWrappedLogoMode"');
		expect(source).toContain('bind:value={selectedWrappedLogoMode}');
		expect(source).toContain('name="logoMode"');
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
		const copyUrlSource = source.match(
			/async function copyUrl\(\)[\s\S]*?async function refreshShareData/
		);
		const urlSection = source.match(/<!-- Copy URL Section -->[\s\S]*?<!-- Share Mode Controls/);

		expect(source).toContain("import { goto, invalidateAll } from '$app/navigation';");
		expect(source).toContain('let isRefreshing = $state(false);');
		expect(source).toContain('const controlsDisabled = $derived(isUpdating || isRefreshing);');
		expect(source).toContain('async function refreshShareData()');
		expect(source).toContain('await invalidateAll();');
		expect(source).toContain("console.warn('Failed to refresh share data:', error);");
		expect(source).toContain('void refreshShareData();');
		expect(source).toContain('disabled={controlsDisabled || isBelowFloor(mode as ShareModeType)}');
		expect(source).toContain('disabled={controlsDisabled}');
		expect(copyUrlSource).toBeDefined();
		expect(copyUrlSource?.[0]).toContain('if (controlsDisabled) return;');
		expect(urlSection).toBeDefined();
		expect(urlSection?.[0]).toContain('disabled={controlsDisabled}');
		expect(urlSection?.[0]).toContain("value={controlsDisabled ? '' : shareUrl}");
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

	it('restores wrapped share modal local state after error mode updates', async () => {
		const source = await readSource('src/lib/components/wrapped/ShareModal.svelte');
		const updateShareModeForm = source.match(
			/action="\?\/updateShareMode"[\s\S]*?<div class="mode-options"/
		)?.[0];

		expect(updateShareModeForm).toBeDefined();
		expect(updateShareModeForm).toContain('applyShareActionData(result.data);');
		expect(updateShareModeForm).toContain('await invalidateAll();');
		expect(updateShareModeForm).toContain(
			"console.warn('Failed to refresh share data after share mode update:', error);"
		);
		expect(updateShareModeForm).toContain('restoreLocalShareState();');
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

	it('routes server wrapped users home based on auth role', async () => {
		// Unified with the per-user wrapped page: admins → /admin, signed-in
		// non-admins → /dashboard, anonymous → /. Anything else strands an
		// admin viewer on the landing page they were redirected away from on
		// login (root redirects logged-in users back to /admin).
		const source = await readSource('src/routes/wrapped/[year]/+page.svelte');
		const handleHome = source.match(/function handleHome\(\): void \{[\s\S]*?\n\}/)?.[0];

		expect(handleHome).toBeDefined();
		expect(handleHome).toContain("goto('/admin')");
		expect(handleHome).toContain("goto('/dashboard')");
		expect(handleHome).toContain("goto('/')");
		expect(handleHome).toContain('data.isAdmin');
		expect(handleHome).toContain('data.isLoggedIn');
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

	// US-022 / monolith deletion — the Data tab's count result panels are
	// now in the nested Data route (commit 0b8685d). The monolith's
	// focusCountResult / prefersReducedMotion scroll-on-focus pattern was
	// not carried over (deliberate scope cut; the nested route uses
	// role="status" aria-live="polite" panels that update on result.data
	// without auto-scroll). Two role+aria-live regions still guarded:
	it('renders accessible status feedback for data count actions (nested Data route)', async () => {
		const source = await readSource('src/routes/admin/settings/data/+page.svelte');

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
		const [clientSource, serverSource, validationSource] = await Promise.all([
			readSource('src/routes/admin/sync/+page.svelte'),
			readSource('src/routes/admin/sync/+page.server.ts'),
			readSource('src/lib/cron/validation.ts')
		]);

		expect(clientSource).toContain(
			"import { validateCronExpression } from '$lib/cron/validation';"
		);
		expect(clientSource).toContain(
			'const clientCronError = $derived(validateCronExpression(cronExpression));'
		);
		expect(clientSource).toContain(
			'const serverCronError = $derived(submittedCronError(form, cronExpression));'
		);
		expect(clientSource).toContain(
			'const cronError = $derived(clientCronError || serverCronError);'
		);
		expect(clientSource).toContain('const serverCronExpression = $derived(');
		expect(clientSource).toContain(
			'data.schedulerStatus.cronExpression ?? DEFAULT_CRON_EXPRESSION'
		);
		expect(clientSource).toContain('const cronExpression = $derived(');
		expect(clientSource).toContain(
			'localCronExpression ?? submittedCronExpression(form) ?? serverCronExpression'
		);
		expect(clientSource).toContain('let localCronExpression = $state<string | null>(null);');
		expect(clientSource).not.toContain('submittedCronExpressionSnapshot');
		expect(clientSource).not.toContain('syncedCronExpression');
		expect(clientSource).toContain('oninput={handleCronExpressionInput}');
		expect(clientSource).toContain('onclick={() => updateCronExpression(preset.value)}');
		expect(clientSource).toContain("if (result.type === 'success')");
		expect(clientSource).toContain('localCronExpression = null;');
		expect(clientSource).toContain("aria-invalid={cronError ? 'true' : 'false'}");
		expect(clientSource).toContain(
			"aria-describedby={cronError ? 'cronExpression-error' : undefined}"
		);
		expect(clientSource).toContain('disabled={!!cronError}');
		expect(clientSource).toContain("aria-label={cronError ? 'Fix cron expression before saving'");
		expect(clientSource).toContain('id="cronExpression-error"');
		expect(clientSource).toContain('class="cron-error"');
		expect(clientSource).toContain('role="alert"');
		expect(clientSource).toContain('Save disabled: {cronError}');
		expect(serverSource).toContain(
			"import { CRON_REQUIRED_MESSAGE, validateCronExpression } from '$lib/cron/validation';"
		);
		expect(serverSource).toContain('const UpdateScheduleSchema = z.object');
		expect(serverSource).toContain('cronError: error');
		expect(serverSource).toContain('cronExpression');
		expect(validationSource).toContain("'Only digits, spaces, and * / - , are allowed'");
		expect(validationSource).toContain("'Cron expression must have exactly 5 fields'");
	});

	it('wires server wrapped SummaryPage sharing into ShareModal', async () => {
		const source = await readSource('src/routes/wrapped/[year]/+page.svelte');

		expect(source).toContain('let showShareModal = $state(false);');
		expect(source).toContain('function handleShare(): void');
		expect(source).toContain('showShareModal = true;');
		expect(source).toMatch(/<SummaryPage[\s\S]*onShare=\{handleShare\}[\s\S]*\/>/);
		expect(source).toMatch(/<ShareModal[\s\S]*bind:open=\{showShareModal\}/);
		expect(source).toContain('currentUrl={data.currentUrl}');
		expect(source).toContain('isAdmin={data.isAdmin}');
		expect(source).toContain('isServerWrapped={true}');
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
