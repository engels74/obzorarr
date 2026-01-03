<script lang="ts">
	import { enhance, deserialize } from '$app/forms';
	import { page } from '$app/stores';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import * as Tabs from '$lib/components/ui/tabs';
	import { handleFormToast } from '$lib/utils/form-toast';
	import type { PageData, ActionData } from './$types';

	// Lucide Icons
	import Settings from '@lucide/svelte/icons/settings';
	import Plug from '@lucide/svelte/icons/plug';
	import Palette from '@lucide/svelte/icons/palette';
	import Shield from '@lucide/svelte/icons/shield';
	import Database from '@lucide/svelte/icons/database';
	import Server from '@lucide/svelte/icons/server';
	import Eye from '@lucide/svelte/icons/eye';
	import EyeOff from '@lucide/svelte/icons/eye-off';
	import Zap from '@lucide/svelte/icons/zap';
	import Bot from '@lucide/svelte/icons/bot';
	import Monitor from '@lucide/svelte/icons/monitor';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import Users from '@lucide/svelte/icons/users';
	import UserCheck from '@lucide/svelte/icons/user-check';
	import VenetianMask from '@lucide/svelte/icons/venetian-mask';
	import Image from '@lucide/svelte/icons/image';
	import ImageOff from '@lucide/svelte/icons/image-off';
	import ToggleRight from '@lucide/svelte/icons/toggle-right';
	import Globe from '@lucide/svelte/icons/globe';
	import Lock from '@lucide/svelte/icons/lock';
	import Link from '@lucide/svelte/icons/link';
	import Calendar from '@lucide/svelte/icons/calendar';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import AlertTriangle from '@lucide/svelte/icons/alert-triangle';
	import ScrollText from '@lucide/svelte/icons/scroll-text';
	import Clock from '@lucide/svelte/icons/clock';
	import Hash from '@lucide/svelte/icons/hash';
	import Bug from '@lucide/svelte/icons/bug';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import Check from '@lucide/svelte/icons/check';
	import Loader2 from '@lucide/svelte/icons/loader-2';
	import ShieldCheck from '@lucide/svelte/icons/shield-check';
	import ShieldAlert from '@lucide/svelte/icons/shield-alert';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import BookOpen from '@lucide/svelte/icons/book-open';
	import CircleHelp from '@lucide/svelte/icons/circle-help';
	import Crosshair from '@lucide/svelte/icons/crosshair';
	import X from '@lucide/svelte/icons/x';

	import * as Tooltip from '$lib/components/ui/tooltip';

	// Valid tab values
	const validTabs = ['connections', 'appearance', 'privacy', 'security', 'data', 'system'] as const;
	type TabValue = (typeof validTabs)[number];

	// Active tab state - initialized from URL params if available
	let activeTab = $state<TabValue>('connections');

	// Sync tab from URL on mount
	$effect(() => {
		const urlTab = $page.url?.searchParams?.get('tab');
		if (urlTab && validTabs.includes(urlTab as TabValue)) {
			activeTab = urlTab as TabValue;
		}
	});

	/**
	 * Admin Settings Page - Command Center Design
	 *
	 * Manages application configuration with a modern,
	 * visually striking interface.
	 */

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// Local form state (initialized and synced via $effect)
	let plexServerUrl = $state('');
	let plexToken = $state('');
	let openaiApiKey = $state('');
	let openaiBaseUrl = $state('');
	let openaiModel = $state('');
	let showPlexToken = $state(false);
	let showOpenaiKey = $state(false);
	let selectedUITheme = $state('');
	let selectedWrappedTheme = $state('');
	let selectedAnonymization = $state('');
	let selectedWrappedLogoMode = $state('');
	let isTesting = $state(false);

	// Logging settings state
	let logRetentionDays = $state(7);
	let logMaxCount = $state(50000);
	let logDebugEnabled = $state(false);

	// Sharing settings state
	let selectedServerWrappedMode = $state('public');
	let selectedDefaultShareMode = $state('public');
	let allowUserControl = $state(true);

	// Track sources for display
	let plexServerUrlSource = $state<'env' | 'db' | 'default'>('default');
	let plexTokenSource = $state<'env' | 'db' | 'default'>('default');
	let openaiApiKeySource = $state<'env' | 'db' | 'default'>('default');
	let openaiBaseUrlSource = $state<'env' | 'db' | 'default'>('default');
	let openaiModelSource = $state<'env' | 'db' | 'default'>('default');

	// Track locked state (ENV takes precedence and cannot be changed via UI)
	let plexServerUrlLocked = $state(false);
	let plexTokenLocked = $state(false);
	let openaiApiKeyLocked = $state(false);
	let openaiBaseUrlLocked = $state(false);
	let openaiModelLocked = $state(false);
	let csrfOriginLocked = $state(false);

	// Sync local state with data (initial load and after form submission)
	$effect(() => {
		plexServerUrl = data.settings.plexServerUrl.value;
		plexToken = data.settings.plexToken.value;
		openaiApiKey = data.settings.openaiApiKey.value;
		openaiBaseUrl = data.settings.openaiBaseUrl.value;
		openaiModel = data.settings.openaiModel.value;
		plexServerUrlSource = data.settings.plexServerUrl.source;
		plexTokenSource = data.settings.plexToken.source;
		openaiApiKeySource = data.settings.openaiApiKey.source;
		openaiBaseUrlSource = data.settings.openaiBaseUrl.source;
		openaiModelSource = data.settings.openaiModel.source;
		plexServerUrlLocked = data.settings.plexServerUrl.isLocked;
		plexTokenLocked = data.settings.plexToken.isLocked;
		openaiApiKeyLocked = data.settings.openaiApiKey.isLocked;
		openaiBaseUrlLocked = data.settings.openaiBaseUrl.isLocked;
		openaiModelLocked = data.settings.openaiModel.isLocked;
		selectedUITheme = data.uiTheme;
		selectedWrappedTheme = data.wrappedTheme;
		selectedAnonymization = data.anonymizationMode;
		selectedWrappedLogoMode = data.wrappedLogoMode;
		logRetentionDays = data.logSettings.retentionDays;
		logMaxCount = data.logSettings.maxCount;
		logDebugEnabled = data.logSettings.debugEnabled;
		selectedServerWrappedMode = data.serverWrappedShareMode;
		selectedDefaultShareMode = data.globalDefaults.defaultShareMode;
		allowUserControl = data.globalDefaults.allowUserControl;
	});

	// Source label helper
	function getSourceLabel(source: 'env' | 'db' | 'default'): string {
		switch (source) {
			case 'env':
				return 'Environment';
			case 'db':
				return 'Database';
			default:
				return 'Default';
		}
	}

	// Theme display names
	const themeLabels: Record<string, string> = {
		'modern-minimal': 'Modern Minimal',
		supabase: 'Supabase',
		'doom-64': 'Doom 64',
		'amber-minimal': 'Amber Minimal',
		'soviet-red': 'Soviet Red'
	};

	// Anonymization descriptions
	const anonymizationDescriptions: Record<string, string> = {
		real: 'Show actual usernames in all statistics',
		anonymous: 'Replace usernames with "User #1", "User #2", etc.',
		hybrid: 'Users see their own name, others are anonymized'
	};

	// Wrapped logo mode descriptions
	const wrappedLogoDescriptions: Record<string, string> = {
		always_show: 'Logo always visible on wrapped pages',
		always_hide: 'Logo hidden on all wrapped pages',
		user_choice: 'Users can toggle logo visibility'
	};

	// Show toast notifications for form responses
	$effect(() => {
		handleFormToast(form);
	});

	// Cache clearing dialog state
	let cacheDialogOpen = $state(false);
	let pendingCacheYear = $state<number | undefined>(undefined);
	let pendingCacheCount = $state(0);
	let loadingCount = $state(false);
	let isClearing = $state(false);

	// Play history clearing dialog state
	let historyDialogOpen = $state(false);
	let pendingHistoryYear = $state<number | undefined>(undefined);
	let pendingHistoryCount = $state(0);
	let loadingHistoryCount = $state(false);
	let isClearingHistory = $state(false);

	// Open cache clearing confirmation dialog
	async function showCacheConfirmation(year?: number) {
		loadingCount = true;
		pendingCacheYear = year;

		const formData = new FormData();
		if (year !== undefined) {
			formData.append('year', year.toString());
		}

		try {
			const response = await fetch('?/getCacheCount', {
				method: 'POST',
				body: formData
			});
			const result = deserialize(await response.text());

			if (result.type === 'success' && result.data) {
				const data = result.data as { success: boolean; count: number; year?: number };
				pendingCacheCount = data.count;
				cacheDialogOpen = true;
			}
		} catch (error) {
			console.error('Failed to get cache count:', error);
		} finally {
			loadingCount = false;
		}
	}

	function handleCacheCleared() {
		cacheDialogOpen = false;
		pendingCacheYear = undefined;
		pendingCacheCount = 0;
	}

	function getCacheConfirmationMessage(): string {
		if (pendingCacheYear !== undefined) {
			return `This will permanently delete ${pendingCacheCount} cached statistics record${pendingCacheCount !== 1 ? 's' : ''} for ${pendingCacheYear}.`;
		}
		return `This will permanently delete ${pendingCacheCount} cached statistics record${pendingCacheCount !== 1 ? 's' : ''} across all years.`;
	}

	async function showHistoryConfirmation(year?: number) {
		loadingHistoryCount = true;
		pendingHistoryYear = year;

		const formData = new FormData();
		if (year !== undefined) {
			formData.append('year', year.toString());
		}

		try {
			const response = await fetch('?/getPlayHistoryCount', {
				method: 'POST',
				body: formData
			});
			const result = deserialize(await response.text());

			if (result.type === 'success' && result.data) {
				const data = result.data as { success: boolean; count: number; year?: number };
				pendingHistoryCount = data.count;
				historyDialogOpen = true;
			}
		} catch (error) {
			console.error('Failed to get history count:', error);
		} finally {
			loadingHistoryCount = false;
		}
	}

	function handleHistoryCleared() {
		historyDialogOpen = false;
		pendingHistoryYear = undefined;
		pendingHistoryCount = 0;
	}

	function getHistoryConfirmationMessage(): string {
		if (pendingHistoryYear !== undefined) {
			return `This will permanently delete ${pendingHistoryCount} play history record${pendingHistoryCount !== 1 ? 's' : ''} for ${pendingHistoryYear}.`;
		}
		return `This will permanently delete ${pendingHistoryCount} play history record${pendingHistoryCount !== 1 ? 's' : ''} across all years.`;
	}

	// Tab configuration with icons
	const tabConfig = [
		{ value: 'connections' as const, label: 'Connections', icon: Plug },
		{ value: 'appearance' as const, label: 'Appearance', icon: Palette },
		{ value: 'privacy' as const, label: 'Privacy', icon: Shield },
		{ value: 'security' as const, label: 'Security', icon: ShieldCheck },
		{ value: 'data' as const, label: 'Data', icon: Database },
		{ value: 'system' as const, label: 'System', icon: Server }
	];

	// Security state
	let isTestingCsrf = $state(false);
	let docsExpanded = $state(false);
	let csrfOriginValue = $state('');
	let csrfOriginSource = $state<'env' | 'db' | 'default'>('default');
	let isSavingCsrf = $state(false);
	let csrfClearDialogOpen = $state(false);
	let isClearingCsrf = $state(false);
	let isResettingCsrfWarning = $state(false);

	// Sync CSRF state from data
	$effect(() => {
		csrfOriginValue = data.security.originValue;
		csrfOriginSource = data.security.originSource;
		csrfOriginLocked = data.security.originLocked;
	});

	// Detect current URL for CSRF origin
	function detectCurrentUrl() {
		if (typeof window !== 'undefined') {
			csrfOriginValue = window.location.origin;
		}
	}
</script>

<div class="settings-command-center">
	<!-- Page Header -->
	<header class="page-header">
		<div class="header-content">
			<div class="header-icon">
				<Settings />
			</div>
			<div class="header-text">
				<h1>Settings</h1>
				<p class="header-subtitle">Application Configuration Center</p>
			</div>
		</div>
	</header>

	<!-- Tab Navigation -->
	<nav class="tab-nav">
		{#each tabConfig as tab}
			<button
				type="button"
				class="tab-button"
				class:active={activeTab === tab.value}
				onclick={() => (activeTab = tab.value)}
			>
				<tab.icon class="tab-icon" />
				<span class="tab-label">{tab.label}</span>
			</button>
		{/each}
	</nav>

	<!-- Tab Content -->
	<div class="tab-content">
		<!-- Connections Tab -->
		{#if activeTab === 'connections'}
			<div class="content-grid">
				<!-- Plex Configuration Panel -->
				<section class="panel plex-panel">
					<div class="panel-header">
						<div class="panel-title">
							<Zap class="panel-icon plex" />
							<h2>Plex Server</h2>
						</div>
						<div class="connection-status" class:connected={plexServerUrl && plexToken}>
							<span class="status-dot"></span>
							<span class="status-text"
								>{plexServerUrl && plexToken ? 'Configured' : 'Not configured'}</span
							>
						</div>
					</div>

					<form method="POST" action="?/updateApiConfig" use:enhance class="panel-form">
						<div class="form-field">
							<div class="field-header">
								<label for="plexServerUrl">Server URL</label>
								{#if plexServerUrlLocked}
									<span class="env-lock-badge">
										<Lock class="badge-icon" />
										Set via environment variable
									</span>
								{:else if plexServerUrlSource !== 'default'}
									<span class="source-badge" class:env={plexServerUrlSource === 'env'}>
										{getSourceLabel(plexServerUrlSource)}
									</span>
								{/if}
							</div>
							<input
								type="url"
								id="plexServerUrl"
								name="plexServerUrl"
								bind:value={plexServerUrl}
								placeholder="http://192.168.1.100:32400"
								class:from-env={plexServerUrlLocked}
								disabled={plexServerUrlLocked}
							/>
							{#if plexServerUrlLocked}
								<span class="field-hint env-hint"
									>This value is set via PLEX_SERVER_URL environment variable</span
								>
							{:else}
								<span class="field-hint">Your Plex Media Server address</span>
							{/if}
						</div>

						<div class="form-field">
							<div class="field-header">
								<label for="plexToken">Authentication Token</label>
								{#if plexTokenLocked}
									<span class="env-lock-badge">
										<Lock class="badge-icon" />
										Set via environment variable
									</span>
								{:else if plexTokenSource !== 'default'}
									<span class="source-badge" class:env={plexTokenSource === 'env'}>
										{getSourceLabel(plexTokenSource)}
									</span>
								{/if}
							</div>
							<div class="input-with-action">
								<input
									type={showPlexToken ? 'text' : 'password'}
									id="plexToken"
									name="plexToken"
									bind:value={plexToken}
									placeholder="X-Plex-Token"
									class:from-env={plexTokenLocked}
									disabled={plexTokenLocked}
								/>
								<button
									type="button"
									class="input-action"
									onclick={() => (showPlexToken = !showPlexToken)}
									aria-label={showPlexToken ? 'Hide token' : 'Show token'}
									disabled={plexTokenLocked}
								>
									{#if showPlexToken}
										<EyeOff />
									{:else}
										<Eye />
									{/if}
								</button>
							</div>
							{#if plexTokenLocked}
								<span class="field-hint env-hint"
									>This value is set via PLEX_TOKEN environment variable</span
								>
							{/if}
						</div>

						<div class="plex-actions">
							{#if !plexServerUrlLocked || !plexTokenLocked}
								<button type="submit" class="btn-primary">
									<Check class="btn-icon" />
									Save Plex Settings
								</button>
							{/if}

							<button
								type="button"
								class="btn-secondary"
								disabled={isTesting || !plexServerUrl || !plexToken}
								onclick={async () => {
									isTesting = true;
									const formData = new FormData();
									formData.set('plexServerUrl', plexServerUrl);
									formData.set('plexToken', plexToken);
									try {
										const response = await fetch('?/testPlexConnection', {
											method: 'POST',
											body: formData
										});
										const result = deserialize(await response.text());
										if (result.type === 'success' || result.type === 'failure') {
											handleFormToast(result.data);
										} else if (result.type === 'error') {
											handleFormToast({
												error: result.error?.message ?? 'An error occurred while testing connection'
											});
										} else {
											handleFormToast({
												error: 'Unexpected response from server'
											});
										}
									} catch {
										handleFormToast({
											error: 'Failed to test connection. Please check your network and try again.'
										});
									} finally {
										isTesting = false;
									}
								}}
							>
								{#if isTesting}
									<Loader2 class="btn-icon spinning" />
									Testing...
								{:else}
									<Zap class="btn-icon" />
									Test Connection
								{/if}
							</button>
						</div>

						{#if plexServerUrlLocked && plexTokenLocked}
							<div class="panel-info">
								<span class="info-text"
									>All Plex settings are managed via environment variables</span
								>
							</div>
						{/if}
					</form>
				</section>

				<!-- OpenAI Configuration Panel -->
				<section class="panel openai-panel">
					<div class="panel-header">
						<div class="panel-title">
							<Bot class="panel-icon openai" />
							<h2>OpenAI</h2>
						</div>
						<span class="panel-badge optional">Optional</span>
					</div>

					<p class="panel-description">
						Configure AI-powered fun facts generation. Leave empty to use predefined templates.
					</p>

					<form method="POST" action="?/updateApiConfig" use:enhance class="panel-form">
						<div class="form-field">
							<div class="field-header">
								<label for="openaiApiKey">API Key</label>
								{#if openaiApiKeyLocked}
									<span class="env-lock-badge">
										<Lock class="badge-icon" />
										Set via environment variable
									</span>
								{:else if openaiApiKeySource !== 'default'}
									<span class="source-badge" class:env={openaiApiKeySource === 'env'}>
										{getSourceLabel(openaiApiKeySource)}
									</span>
								{/if}
							</div>
							<div class="input-with-action">
								<input
									type={showOpenaiKey ? 'text' : 'password'}
									id="openaiApiKey"
									name="openaiApiKey"
									bind:value={openaiApiKey}
									placeholder="sk-..."
									class:from-env={openaiApiKeyLocked}
									disabled={openaiApiKeyLocked}
								/>
								<button
									type="button"
									class="input-action"
									onclick={() => (showOpenaiKey = !showOpenaiKey)}
									aria-label={showOpenaiKey ? 'Hide key' : 'Show key'}
									disabled={openaiApiKeyLocked}
								>
									{#if showOpenaiKey}
										<EyeOff />
									{:else}
										<Eye />
									{/if}
								</button>
							</div>
							{#if openaiApiKeyLocked}
								<span class="field-hint env-hint"
									>This value is set via OPENAI_API_KEY environment variable</span
								>
							{/if}
						</div>

						<div class="form-row">
							<div class="form-field">
								<div class="field-header">
									<label for="openaiBaseUrl">Base URL</label>
									{#if openaiBaseUrlLocked}
										<span class="env-lock-badge">
											<Lock class="badge-icon" />
											Set via environment variable
										</span>
									{:else if openaiBaseUrlSource !== 'default'}
										<span class="source-badge" class:env={openaiBaseUrlSource === 'env'}>
											{getSourceLabel(openaiBaseUrlSource)}
										</span>
									{/if}
								</div>
								<input
									type="url"
									id="openaiBaseUrl"
									name="openaiBaseUrl"
									bind:value={openaiBaseUrl}
									placeholder="https://api.openai.com/v1"
									class:from-env={openaiBaseUrlLocked}
									disabled={openaiBaseUrlLocked}
								/>
								{#if openaiBaseUrlLocked}
									<span class="field-hint env-hint"
										>Set via OPENAI_API_URL environment variable</span
									>
								{:else}
									<span class="field-hint">Custom endpoint (optional)</span>
								{/if}
							</div>

							<div class="form-field">
								<div class="field-header">
									<label for="openaiModel">Model</label>
									{#if openaiModelLocked}
										<span class="env-lock-badge">
											<Lock class="badge-icon" />
											Set via environment variable
										</span>
									{:else if openaiModelSource !== 'default'}
										<span class="source-badge" class:env={openaiModelSource === 'env'}>
											{getSourceLabel(openaiModelSource)}
										</span>
									{/if}
								</div>
								<input
									type="text"
									id="openaiModel"
									name="openaiModel"
									bind:value={openaiModel}
									placeholder="gpt-4o-mini"
									class:from-env={openaiModelLocked}
									disabled={openaiModelLocked}
								/>
								{#if openaiModelLocked}
									<span class="field-hint env-hint">Set via OPENAI_MODEL environment variable</span>
								{:else}
									<span class="field-hint">Default: gpt-4o-mini</span>
								{/if}
							</div>
						</div>

						{#if !openaiApiKeyLocked || !openaiBaseUrlLocked || !openaiModelLocked}
							<div class="panel-actions">
								<button type="submit" class="btn-primary">
									<Check class="btn-icon" />
									Save OpenAI Settings
								</button>
							</div>
						{:else}
							<div class="panel-info">
								<span class="info-text"
									>All OpenAI settings are managed via environment variables</span
								>
							</div>
						{/if}
					</form>
				</section>
			</div>
		{/if}

		<!-- Appearance Tab -->
		{#if activeTab === 'appearance'}
			<div class="appearance-content">
				<!-- UI Theme Section -->
				<section class="panel theme-panel">
					<div class="panel-header">
						<div class="panel-title">
							<Monitor class="panel-icon" />
							<h2>UI Theme</h2>
						</div>
					</div>
					<p class="panel-description">
						Color theme for dashboard, admin pages, and all non-wrapped pages.
					</p>

					<form method="POST" action="?/updateUITheme" use:enhance>
						<div class="theme-grid">
							{#each data.themeOptions as theme}
								<label class="theme-card" class:selected={selectedUITheme === theme.value}>
									<input
										type="radio"
										name="theme"
										value={theme.value}
										bind:group={selectedUITheme}
									/>
									<div class="theme-preview {theme.value}">
										<div class="theme-gradient"></div>
									</div>
									<span class="theme-name">{themeLabels[theme.value] ?? theme.label}</span>
									{#if selectedUITheme === theme.value}
										<div class="theme-check">
											<Check />
										</div>
									{/if}
								</label>
							{/each}
						</div>
						<div class="panel-actions">
							<button type="submit" class="btn-primary">
								<Palette class="btn-icon" />
								Apply UI Theme
							</button>
						</div>
					</form>
				</section>

				<!-- Wrapped Theme Section -->
				<section class="panel theme-panel">
					<div class="panel-header">
						<div class="panel-title">
							<Sparkles class="panel-icon" />
							<h2>Wrapped Theme</h2>
						</div>
					</div>
					<p class="panel-description">
						Color theme for Year in Review slideshow pages at /wrapped/*.
					</p>

					<form method="POST" action="?/updateWrappedTheme" use:enhance>
						<div class="theme-grid">
							{#each data.themeOptions as theme}
								<label class="theme-card" class:selected={selectedWrappedTheme === theme.value}>
									<input
										type="radio"
										name="theme"
										value={theme.value}
										bind:group={selectedWrappedTheme}
									/>
									<div class="theme-preview {theme.value}">
										<div class="theme-gradient"></div>
									</div>
									<span class="theme-name">{themeLabels[theme.value] ?? theme.label}</span>
									{#if selectedWrappedTheme === theme.value}
										<div class="theme-check">
											<Check />
										</div>
									{/if}
								</label>
							{/each}
						</div>
						<div class="panel-actions">
							<button type="submit" class="btn-primary">
								<Sparkles class="btn-icon" />
								Apply Wrapped Theme
							</button>
						</div>
					</form>
				</section>
			</div>
		{/if}

		<!-- Privacy Tab -->
		{#if activeTab === 'privacy'}
			<form method="POST" action="?/updatePrivacySettings" use:enhance class="privacy-content">
				<!-- User Identity Section -->
				<section class="panel privacy-panel">
					<div class="panel-header">
						<div class="panel-title">
							<Users class="panel-icon" />
							<h2>User Identity</h2>
						</div>
					</div>
					<p class="panel-description">Control how usernames appear in server-wide statistics.</p>

					<h3 class="subsection-title">
						<VenetianMask class="subsection-icon" />
						Anonymization Mode
					</h3>

					<div class="option-cards">
						<label class="option-card" class:selected={selectedAnonymization === 'real'}>
							<input
								type="radio"
								name="anonymizationMode"
								value="real"
								bind:group={selectedAnonymization}
							/>
							<div class="option-icon">
								<UserCheck />
							</div>
							<div class="option-content">
								<span class="option-title">Real Names</span>
								<span class="option-desc">{anonymizationDescriptions.real}</span>
							</div>
							{#if selectedAnonymization === 'real'}
								<div class="option-check"><Check /></div>
							{/if}
						</label>

						<label class="option-card" class:selected={selectedAnonymization === 'anonymous'}>
							<input
								type="radio"
								name="anonymizationMode"
								value="anonymous"
								bind:group={selectedAnonymization}
							/>
							<div class="option-icon">
								<VenetianMask />
							</div>
							<div class="option-content">
								<span class="option-title">Anonymous</span>
								<span class="option-desc">{anonymizationDescriptions.anonymous}</span>
							</div>
							{#if selectedAnonymization === 'anonymous'}
								<div class="option-check"><Check /></div>
							{/if}
						</label>

						<label class="option-card" class:selected={selectedAnonymization === 'hybrid'}>
							<input
								type="radio"
								name="anonymizationMode"
								value="hybrid"
								bind:group={selectedAnonymization}
							/>
							<div class="option-icon">
								<Users />
							</div>
							<div class="option-content">
								<span class="option-title">Hybrid</span>
								<span class="option-desc">{anonymizationDescriptions.hybrid}</span>
							</div>
							{#if selectedAnonymization === 'hybrid'}
								<div class="option-check"><Check /></div>
							{/if}
						</label>
					</div>

					<h3 class="subsection-title">
						<Image class="subsection-icon" />
						Wrapped Page Logo
					</h3>

					<div class="option-cards">
						<label class="option-card" class:selected={selectedWrappedLogoMode === 'always_show'}>
							<input
								type="radio"
								name="logoMode"
								value="always_show"
								bind:group={selectedWrappedLogoMode}
							/>
							<div class="option-icon">
								<Image />
							</div>
							<div class="option-content">
								<span class="option-title">Always Show</span>
								<span class="option-desc">{wrappedLogoDescriptions.always_show}</span>
							</div>
							{#if selectedWrappedLogoMode === 'always_show'}
								<div class="option-check"><Check /></div>
							{/if}
						</label>

						<label class="option-card" class:selected={selectedWrappedLogoMode === 'always_hide'}>
							<input
								type="radio"
								name="logoMode"
								value="always_hide"
								bind:group={selectedWrappedLogoMode}
							/>
							<div class="option-icon">
								<ImageOff />
							</div>
							<div class="option-content">
								<span class="option-title">Always Hide</span>
								<span class="option-desc">{wrappedLogoDescriptions.always_hide}</span>
							</div>
							{#if selectedWrappedLogoMode === 'always_hide'}
								<div class="option-check"><Check /></div>
							{/if}
						</label>

						<label class="option-card" class:selected={selectedWrappedLogoMode === 'user_choice'}>
							<input
								type="radio"
								name="logoMode"
								value="user_choice"
								bind:group={selectedWrappedLogoMode}
							/>
							<div class="option-icon">
								<ToggleRight />
							</div>
							<div class="option-content">
								<span class="option-title">User Choice</span>
								<span class="option-desc">{wrappedLogoDescriptions.user_choice}</span>
							</div>
							{#if selectedWrappedLogoMode === 'user_choice'}
								<div class="option-check"><Check /></div>
							{/if}
						</label>
					</div>
				</section>

				<!-- Sharing Access Section -->
				<section class="panel privacy-panel">
					<div class="panel-header">
						<div class="panel-title">
							<Globe class="panel-icon" />
							<h2>Sharing Access</h2>
						</div>
					</div>
					<p class="panel-description">Configure access controls for wrapped pages.</p>

					<h3 class="subsection-title">
						<Server class="subsection-icon" />
						Server-Wide Wrapped Access
					</h3>
					<p class="subsection-hint">
						Control who can access the server-wide Year in Review at <code
							>/wrapped/{data.currentYear}</code
						>.
					</p>

					<div class="option-cards two-col">
						<label class="option-card" class:selected={selectedServerWrappedMode === 'public'}>
							<input
								type="radio"
								name="serverWrappedShareMode"
								value="public"
								bind:group={selectedServerWrappedMode}
							/>
							<div class="option-icon">
								<Globe />
							</div>
							<div class="option-content">
								<span class="option-title">Public</span>
								<span class="option-desc">Anyone can view</span>
							</div>
							{#if selectedServerWrappedMode === 'public'}
								<div class="option-check"><Check /></div>
							{/if}
						</label>

						<label
							class="option-card"
							class:selected={selectedServerWrappedMode === 'private-oauth'}
						>
							<input
								type="radio"
								name="serverWrappedShareMode"
								value="private-oauth"
								bind:group={selectedServerWrappedMode}
							/>
							<div class="option-icon">
								<Lock />
							</div>
							<div class="option-content">
								<span class="option-title">Private OAuth</span>
								<span class="option-desc">Server members only</span>
							</div>
							{#if selectedServerWrappedMode === 'private-oauth'}
								<div class="option-check"><Check /></div>
							{/if}
						</label>
					</div>

					<h3 class="subsection-title">
						<Users class="subsection-icon" />
						User Sharing Defaults
					</h3>
					<p class="subsection-hint">
						Minimum privacy level for user wrapped pages. Users cannot choose less restrictive
						settings.
					</p>

					<div class="option-cards three-col">
						<label class="option-card" class:selected={selectedDefaultShareMode === 'public'}>
							<input
								type="radio"
								name="defaultShareMode"
								value="public"
								bind:group={selectedDefaultShareMode}
							/>
							<div class="option-icon">
								<Globe />
							</div>
							<div class="option-content">
								<span class="option-title">Public</span>
								<span class="option-desc">Least restrictive</span>
							</div>
							{#if selectedDefaultShareMode === 'public'}
								<div class="option-check"><Check /></div>
							{/if}
						</label>

						<label class="option-card" class:selected={selectedDefaultShareMode === 'private-link'}>
							<input
								type="radio"
								name="defaultShareMode"
								value="private-link"
								bind:group={selectedDefaultShareMode}
							/>
							<div class="option-icon">
								<Link />
							</div>
							<div class="option-content">
								<span class="option-title">Private Link</span>
								<span class="option-desc">Secret share link</span>
							</div>
							{#if selectedDefaultShareMode === 'private-link'}
								<div class="option-check"><Check /></div>
							{/if}
						</label>

						<label
							class="option-card"
							class:selected={selectedDefaultShareMode === 'private-oauth'}
						>
							<input
								type="radio"
								name="defaultShareMode"
								value="private-oauth"
								bind:group={selectedDefaultShareMode}
							/>
							<div class="option-icon">
								<Lock />
							</div>
							<div class="option-content">
								<span class="option-title">Private OAuth</span>
								<span class="option-desc">Most restrictive</span>
							</div>
							{#if selectedDefaultShareMode === 'private-oauth'}
								<div class="option-check"><Check /></div>
							{/if}
						</label>
					</div>

					<!-- User Control Toggle -->
					<div class="toggle-option">
						<label class="toggle-label">
							<input
								type="checkbox"
								name="allowUserControlCheckbox"
								bind:checked={allowUserControl}
							/>
							<span class="toggle-switch"></span>
							<span class="toggle-text">Allow users to control their own sharing settings</span>
						</label>
						<p class="toggle-hint">
							When enabled, users can adjust privacy but cannot go below the minimum set above.
						</p>
					</div>
					<input type="hidden" name="allowUserControl" value={allowUserControl.toString()} />
				</section>

				<!-- Sticky Save Button -->
				<div class="sticky-save">
					<button type="submit" class="btn-primary btn-large">
						<Shield class="btn-icon" />
						Save Privacy Settings
					</button>
				</div>
			</form>
		{/if}

		<!-- Security Tab -->
		{#if activeTab === 'security'}
			<Tooltip.Provider delayDuration={200}>
				<div class="security-content">
					<!-- CSRF Protection Panel -->
					<section class="panel csrf-panel">
						<div class="panel-header">
							<div class="panel-title">
								<ShieldCheck class="panel-icon security" />
								<h2>CSRF Protection</h2>
								<Tooltip.Root>
									<Tooltip.Trigger>
										<span
											role="button"
											tabindex="0"
											class="help-trigger"
											aria-label="Learn how CSRF protection works"
										>
											<CircleHelp />
										</span>
									</Tooltip.Trigger>
									<Tooltip.Content side="right" sideOffset={8} class="csrf-tooltip">
										<div class="csrf-tooltip-inner">
											<strong>How CSRF Protection Works</strong>
											<p>
												When ORIGIN is set, Obzorarr validates that all state-changing requests
												(POST, PUT, PATCH, DELETE) originate from your domain. Combined with
												SameSite cookies, this provides robust protection without additional reverse
												proxy configuration.
											</p>
										</div>
									</Tooltip.Content>
								</Tooltip.Root>
							</div>
							<div class="connection-status" class:connected={data.security.csrfEnabled}>
								<span class="status-dot"></span>
								<span class="status-text">{data.security.csrfEnabled ? 'Enabled' : 'Disabled'}</span
								>
							</div>
						</div>

						<p class="panel-description">
							Cross-Site Request Forgery protection prevents malicious websites from making
							unauthorized requests on behalf of authenticated users.
						</p>

						<div class="panel-form">
							<div class="form-field">
								<div class="field-header">
									<label for="csrfOrigin">ORIGIN</label>
									{#if csrfOriginLocked}
										<span class="env-lock-badge">
											<Lock class="badge-icon" />
											Set via environment variable
										</span>
									{:else if csrfOriginSource !== 'default'}
										<span class="source-badge" class:env={csrfOriginSource === 'env'}>
											{getSourceLabel(csrfOriginSource)}
										</span>
									{/if}
								</div>
								<div class="input-with-action">
									<input
										type="url"
										id="csrfOrigin"
										bind:value={csrfOriginValue}
										placeholder="https://your-domain.com"
										class:from-env={csrfOriginLocked}
										disabled={csrfOriginLocked}
									/>
									{#if !csrfOriginLocked}
										<button
											type="button"
											class="input-action"
											onclick={detectCurrentUrl}
											aria-label="Detect current URL"
											title="Auto-detect from current browser URL"
										>
											<Crosshair />
										</button>
									{/if}
								</div>
								{#if csrfOriginLocked}
									<span class="field-hint env-hint">
										This value is set via ORIGIN environment variable and cannot be changed here.
									</span>
								{:else}
									<span class="field-hint">
										Your application's public URL. Environment variable takes priority over
										database.
									</span>
								{/if}
							</div>

							<div class="csrf-actions">
								{#if !csrfOriginLocked}
									<form
										method="POST"
										action="?/updateCsrfOrigin"
										use:enhance={() => {
											isSavingCsrf = true;
											return async ({ update }) => {
												isSavingCsrf = false;
												await update();
											};
										}}
									>
										<input type="hidden" name="csrfOrigin" value={csrfOriginValue} />
										<button type="submit" class="btn-primary" disabled={isSavingCsrf}>
											{#if isSavingCsrf}
												<Loader2 class="btn-icon spinning" />
												Saving...
											{:else}
												<Check class="btn-icon" />
												Save CSRF Origin
											{/if}
										</button>
									</form>
								{/if}

								<form
									method="POST"
									action="?/testCsrfProtection"
									use:enhance={() => {
										isTestingCsrf = true;
										return async ({ update }) => {
											isTestingCsrf = false;
											await update();
										};
									}}
								>
									<button type="submit" class="btn-secondary" disabled={isTestingCsrf}>
										{#if isTestingCsrf}
											<Loader2 class="btn-icon spinning" />
											Testing...
										{:else}
											<ShieldCheck class="btn-icon" />
											Test CSRF Protection
										{/if}
									</button>
								</form>

								{#if !csrfOriginLocked && csrfOriginSource === 'db'}
									<button
										type="button"
										class="btn-destructive"
										onclick={() => (csrfClearDialogOpen = true)}
									>
										<X class="btn-icon" />
										Clear Database Value
									</button>
								{/if}

								{#if data.security.warningDismissed}
									<form
										method="POST"
										action="?/resetCsrfWarning"
										use:enhance={() => {
											isResettingCsrfWarning = true;
											return async ({ update }) => {
												isResettingCsrfWarning = false;
												await update();
											};
										}}
									>
										<button type="submit" class="btn-secondary" disabled={isResettingCsrfWarning}>
											{#if isResettingCsrfWarning}
												<Loader2 class="btn-icon spinning" />
												Resetting...
											{:else}
												<ShieldAlert class="btn-icon" />
												Re-enable CSRF Warning
											{/if}
										</button>
									</form>
								{/if}
							</div>
						</div>
					</section>

					<!-- Reverse Proxy Documentation - Collapsible -->
					<div class="docs-collapsible">
						<button
							type="button"
							class="docs-toggle"
							onclick={() => (docsExpanded = !docsExpanded)}
							aria-expanded={docsExpanded}
						>
							<BookOpen class="docs-toggle-icon" />
							<span class="docs-toggle-text">Reverse Proxy Documentation</span>
							<span class="docs-chevron" class:expanded={docsExpanded}>
								<ChevronDown />
							</span>
						</button>

						{#if docsExpanded}
							<div class="docs-content">
								<p class="docs-hint">
									Ensure your reverse proxy forwards <code>X-Forwarded-*</code> headers correctly.
								</p>
								<div class="docs-links-inline">
									<a
										href="https://docs.nginx.com/nginx/admin-guide/web-server/reverse-proxy/"
										target="_blank"
										rel="noopener noreferrer"
									>
										Nginx
										<ExternalLink class="inline-link-icon" />
									</a>
									<span class="docs-separator">·</span>
									<a
										href="https://nginxproxymanager.com/advanced-config/"
										target="_blank"
										rel="noopener noreferrer"
									>
										NPM
										<ExternalLink class="inline-link-icon" />
									</a>
									<span class="docs-separator">·</span>
									<a
										href="https://httpd.apache.org/docs/2.4/howto/reverse_proxy.html"
										target="_blank"
										rel="noopener noreferrer"
									>
										Apache
										<ExternalLink class="inline-link-icon" />
									</a>
									<span class="docs-separator">·</span>
									<a
										href="https://caddyserver.com/docs/caddyfile/directives/reverse_proxy"
										target="_blank"
										rel="noopener noreferrer"
									>
										Caddy
										<ExternalLink class="inline-link-icon" />
									</a>
								</div>
							</div>
						{/if}
					</div>
				</div>
			</Tooltip.Provider>
		{/if}

		<!-- Data Tab -->
		{#if activeTab === 'data'}
			<div class="data-content">
				<!-- Year & Archive Panel -->
				<section class="panel data-panel">
					<div class="panel-header">
						<div class="panel-title">
							<Calendar class="panel-icon" />
							<h2>Year & Archive</h2>
						</div>
					</div>

					<div class="years-display">
						<div class="years-label">Available Years</div>
						<div class="years-list">
							{#each data.availableYears as year}
								<span class="year-badge">{year}</span>
							{:else}
								<span class="no-years">No data available</span>
							{/each}
						</div>
						<p class="years-hint">Years are automatically detected from play history data.</p>
					</div>

					<h3 class="subsection-title">
						<RefreshCw class="subsection-icon" />
						Clear Statistics Cache
					</h3>
					<p class="subsection-hint">Force recalculation of statistics by clearing the cache.</p>

					<div class="action-buttons">
						{#each data.availableYears as year}
							<button
								type="button"
								class="btn-secondary"
								onclick={() => showCacheConfirmation(year)}
								disabled={loadingCount}
							>
								{#if loadingCount && pendingCacheYear === year}
									<Loader2 class="btn-icon spinning" />
								{:else}
									<RefreshCw class="btn-icon" />
								{/if}
								Clear {year}
							</button>
						{/each}
						<button
							type="button"
							class="btn-secondary btn-all"
							onclick={() => showCacheConfirmation()}
							disabled={loadingCount}
						>
							{#if loadingCount && pendingCacheYear === undefined}
								<Loader2 class="btn-icon spinning" />
							{:else}
								<RefreshCw class="btn-icon" />
							{/if}
							Clear All Cache
						</button>
					</div>
				</section>

				<!-- Danger Zone -->
				<section class="panel danger-panel">
					<div class="panel-header danger">
						<div class="panel-title">
							<AlertTriangle class="panel-icon danger" />
							<h2>Danger Zone</h2>
						</div>
					</div>

					<div class="danger-warning">
						<AlertTriangle class="warning-icon" />
						<div class="warning-content">
							<strong>Destructive Action</strong>
							<p>
								Deleting play history is permanent and cannot be undone. Related statistics cache
								will also be cleared.
							</p>
						</div>
					</div>

					<h3 class="subsection-title danger">
						<Trash2 class="subsection-icon" />
						Delete Play History
					</h3>
					<p class="subsection-hint">
						Permanently remove viewing history for a specific year or all years.
					</p>

					<div class="action-buttons danger">
						{#each data.availableYears as year}
							<button
								type="button"
								class="btn-danger"
								onclick={() => showHistoryConfirmation(year)}
								disabled={loadingHistoryCount}
							>
								{#if loadingHistoryCount && pendingHistoryYear === year}
									<Loader2 class="btn-icon spinning" />
								{:else}
									<Trash2 class="btn-icon" />
								{/if}
								Delete {year}
							</button>
						{/each}
						<button
							type="button"
							class="btn-danger btn-all"
							onclick={() => showHistoryConfirmation()}
							disabled={loadingHistoryCount}
						>
							{#if loadingHistoryCount && pendingHistoryYear === undefined}
								<Loader2 class="btn-icon spinning" />
							{:else}
								<Trash2 class="btn-icon" />
							{/if}
							Delete All History
						</button>
					</div>
				</section>
			</div>
		{/if}

		<!-- System Tab -->
		{#if activeTab === 'system'}
			<div class="system-content">
				<section class="panel system-panel">
					<div class="panel-header">
						<div class="panel-title">
							<ScrollText class="panel-icon" />
							<h2>Logging</h2>
						</div>
						<a href="/admin/logs" class="panel-link">
							<ExternalLink class="link-icon" />
							View Logs
						</a>
					</div>
					<p class="panel-description">Configure log retention and debug settings.</p>

					<form method="POST" action="?/updateLogSettings" use:enhance class="panel-form">
						<div class="form-row">
							<div class="form-field">
								<div class="field-header">
									<label for="retentionDays">
										<Clock class="field-icon" />
										Retention Period
									</label>
								</div>
								<div class="input-with-suffix">
									<input
										type="number"
										id="retentionDays"
										name="retentionDays"
										bind:value={logRetentionDays}
										min="1"
										max="365"
									/>
									<span class="input-suffix">days</span>
								</div>
								<span class="field-hint">Auto-delete logs older than this (1-365)</span>
							</div>

							<div class="form-field">
								<div class="field-header">
									<label for="maxCount">
										<Hash class="field-icon" />
										Maximum Count
									</label>
								</div>
								<div class="input-with-suffix">
									<input
										type="number"
										id="maxCount"
										name="maxCount"
										bind:value={logMaxCount}
										min="1000"
										max="1000000"
										step="1000"
									/>
									<span class="input-suffix">logs</span>
								</div>
								<span class="field-hint">Maximum logs to retain</span>
							</div>
						</div>

						<div class="toggle-option">
							<label class="toggle-label">
								<input type="checkbox" name="debugEnabledCheckbox" bind:checked={logDebugEnabled} />
								<span class="toggle-switch"></span>
								<span class="toggle-text">
									<Bug class="toggle-icon" />
									Enable DEBUG level logging
								</span>
							</label>
							<p class="toggle-hint">
								Detailed debug logs will be recorded. May generate a large volume of logs.
							</p>
						</div>
						<input type="hidden" name="debugEnabled" value={logDebugEnabled.toString()} />

						<div class="panel-actions">
							<button type="submit" class="btn-primary">
								<Check class="btn-icon" />
								Save Logging Settings
							</button>
						</div>
					</form>
				</section>
			</div>
		{/if}
	</div>
</div>

<!-- Cache Clearing Dialog -->
<AlertDialog.Root bind:open={cacheDialogOpen}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>
				{pendingCacheYear !== undefined ? `Clear ${pendingCacheYear} Cache?` : 'Clear All Cache?'}
			</AlertDialog.Title>
			<AlertDialog.Description>
				{getCacheConfirmationMessage()}
				<br /><br />
				Statistics will be recalculated on next access.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel disabled={isClearing}>Cancel</AlertDialog.Cancel>
			<form
				method="POST"
				action="?/clearCache"
				use:enhance={() => {
					isClearing = true;
					return async ({ update }) => {
						await update();
						isClearing = false;
						handleCacheCleared();
					};
				}}
				style="display: contents;"
			>
				{#if pendingCacheYear !== undefined}
					<input type="hidden" name="year" value={pendingCacheYear} />
				{/if}
				<AlertDialog.Action type="submit" disabled={isClearing}>
					{#if isClearing}
						Clearing...
					{:else}
						Clear {pendingCacheCount} Record{pendingCacheCount !== 1 ? 's' : ''}
					{/if}
				</AlertDialog.Action>
			</form>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>

<!-- Play History Dialog -->
<AlertDialog.Root bind:open={historyDialogOpen}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>
				{pendingHistoryYear !== undefined
					? `Delete ${pendingHistoryYear} Play History?`
					: 'Delete All Play History?'}
			</AlertDialog.Title>
			<AlertDialog.Description>
				{getHistoryConfirmationMessage()}
				<br /><br />
				<strong>This action cannot be undone.</strong> Statistics cache for affected years will also be
				cleared.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel disabled={isClearingHistory}>Cancel</AlertDialog.Cancel>
			<form
				method="POST"
				action="?/clearPlayHistory"
				use:enhance={() => {
					isClearingHistory = true;
					return async ({ update }) => {
						await update();
						isClearingHistory = false;
						handleHistoryCleared();
					};
				}}
				style="display: contents;"
			>
				{#if pendingHistoryYear !== undefined}
					<input type="hidden" name="year" value={pendingHistoryYear} />
				{/if}
				<AlertDialog.Action type="submit" disabled={isClearingHistory} class="destructive-action">
					{#if isClearingHistory}
						Deleting...
					{:else}
						Delete {pendingHistoryCount} Record{pendingHistoryCount !== 1 ? 's' : ''}
					{/if}
				</AlertDialog.Action>
			</form>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>

<!-- CSRF Clear Dialog -->
<AlertDialog.Root bind:open={csrfClearDialogOpen}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Clear CSRF Origin?</AlertDialog.Title>
			<AlertDialog.Description>
				This will remove the CSRF origin value from the database. CSRF protection will be disabled
				unless an ORIGIN environment variable is set.
				<br /><br />
				You can reconfigure this setting at any time.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel disabled={isClearingCsrf}>Cancel</AlertDialog.Cancel>
			<form
				method="POST"
				action="?/clearCsrfOrigin"
				use:enhance={() => {
					isClearingCsrf = true;
					return async ({ update }) => {
						await update();
						isClearingCsrf = false;
						csrfClearDialogOpen = false;
					};
				}}
				style="display: contents;"
			>
				<AlertDialog.Action type="submit" disabled={isClearingCsrf} class="destructive-action">
					{#if isClearingCsrf}
						Clearing...
					{:else}
						Clear CSRF Origin
					{/if}
				</AlertDialog.Action>
			</form>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>

<style>
	/* ===== Base Layout ===== */
	.settings-command-center {
		max-width: 1000px;
		margin: 0 auto;
		padding: 1.5rem 2rem 3rem;
	}

	/* ===== Page Header ===== */
	.page-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1.5rem;
		padding-bottom: 1.5rem;
		border-bottom: 1px solid hsl(var(--border));
	}

	.header-content {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.header-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 56px;
		height: 56px;
		background: linear-gradient(135deg, hsl(var(--primary) / 0.15), hsl(var(--primary) / 0.05));
		border: 1px solid hsl(var(--primary) / 0.3);
		border-radius: 16px;
		color: hsl(var(--primary));
	}

	.header-icon :global(svg) {
		width: 28px;
		height: 28px;
	}

	.header-text h1 {
		font-size: 1.75rem;
		font-weight: 700;
		color: hsl(var(--foreground));
		margin: 0;
		letter-spacing: -0.02em;
	}

	.header-subtitle {
		font-size: 0.875rem;
		color: hsl(var(--muted-foreground));
		margin: 0.25rem 0 0;
	}

	/* ===== Tab Navigation ===== */
	.tab-nav {
		display: flex;
		gap: 0.5rem;
		padding: 0.5rem;
		background: hsl(var(--muted) / 0.3);
		border-radius: 12px;
		margin-bottom: 1.5rem;
		overflow-x: auto;
	}

	.tab-button {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem 1.25rem;
		background: transparent;
		border: none;
		border-radius: 8px;
		color: hsl(var(--muted-foreground));
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s ease;
		white-space: nowrap;
	}

	.tab-button:hover {
		color: hsl(var(--foreground));
		background: hsl(var(--muted) / 0.5);
	}

	.tab-button.active {
		color: hsl(var(--primary-foreground));
		background: hsl(var(--primary));
		box-shadow: 0 2px 8px hsl(var(--primary) / 0.3);
	}

	.tab-icon {
		width: 18px;
		height: 18px;
	}

	/* ===== Panel Base ===== */
	.panel {
		background: hsl(var(--card));
		border: 1px solid hsl(var(--border));
		border-radius: 16px;
		overflow: hidden;
		margin-bottom: 1.5rem;
	}

	.panel-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1rem 1.25rem;
		border-bottom: 1px solid hsl(var(--border));
		background: hsl(var(--muted) / 0.3);
	}

	.panel-title {
		display: flex;
		align-items: center;
		gap: 0.625rem;
	}

	.panel-title h2 {
		font-size: 1rem;
		font-weight: 600;
		color: hsl(var(--foreground));
		margin: 0;
	}

	.panel-icon {
		width: 20px;
		height: 20px;
		color: hsl(var(--primary));
	}

	.panel-icon.plex {
		color: hsl(45 100% 50%);
	}

	.panel-icon.openai {
		color: hsl(160 60% 50%);
	}

	.panel-icon.danger {
		color: hsl(0 70% 50%);
	}

	.panel-description {
		color: hsl(var(--muted-foreground));
		font-size: 0.875rem;
		margin: 0;
		padding: 1rem 1.25rem 0;
	}

	.panel-form {
		padding: 1.25rem;
	}

	.panel-actions {
		margin-top: 1.25rem;
		padding-top: 1rem;
		border-top: 1px solid hsl(var(--border) / 0.5);
	}

	.plex-actions {
		display: flex;
		gap: 0.75rem;
		align-items: center;
		flex-wrap: wrap;
		margin-top: 1.25rem;
		padding-top: 1rem;
		border-top: 1px solid hsl(var(--border) / 0.5);
	}

	.panel-badge {
		font-size: 0.6875rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		padding: 0.25rem 0.625rem;
		border-radius: 6px;
		background: hsl(var(--muted));
		color: hsl(var(--muted-foreground));
	}

	.panel-badge.optional {
		background: hsl(200 60% 20%);
		color: hsl(200 60% 70%);
	}

	.panel-link {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.8125rem;
		color: hsl(var(--primary));
		text-decoration: none;
		transition: opacity 0.15s ease;
	}

	.panel-link:hover {
		opacity: 0.8;
	}

	.link-icon {
		width: 14px;
		height: 14px;
	}

	/* ===== Connection Status ===== */
	.connection-status {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.375rem 0.75rem;
		background: hsl(var(--muted));
		border-radius: 20px;
		font-size: 0.75rem;
	}

	.status-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: hsl(var(--muted-foreground));
	}

	.connection-status.connected .status-dot {
		background: hsl(145 70% 50%);
		box-shadow: 0 0 8px hsl(145 70% 50% / 0.5);
	}

	.status-text {
		color: hsl(var(--muted-foreground));
	}

	.connection-status.connected .status-text {
		color: hsl(145 70% 50%);
	}

	/* ===== Form Fields ===== */
	.form-field {
		margin-bottom: 1rem;
	}

	.field-header {
		display: flex;
		align-items: flex-start;
		flex-wrap: wrap;
		gap: 0.25rem 0.5rem;
		min-height: 1.5rem;
		margin-bottom: 0.5rem;
	}

	.field-header label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.8125rem;
		font-weight: 500;
		color: hsl(var(--foreground));
	}

	.field-icon {
		width: 16px;
		height: 16px;
		color: hsl(var(--muted-foreground));
	}

	.form-field input {
		width: 100%;
		padding: 0.625rem 0.875rem;
		background: hsl(var(--input));
		border: 1px solid hsl(var(--border));
		border-radius: 8px;
		color: hsl(var(--foreground));
		font-size: 0.875rem;
		transition: all 0.15s ease;
	}

	.form-field input:focus {
		outline: none;
		border-color: hsl(var(--ring));
		box-shadow: 0 0 0 3px hsl(var(--ring) / 0.15);
	}

	.form-field input.from-env {
		border-color: hsl(210 80% 40% / 0.4);
		background: hsl(210 80% 50% / 0.05);
	}

	.field-hint {
		display: block;
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
		margin-top: 0.375rem;
	}

	.source-badge {
		font-size: 0.625rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		padding: 0.125rem 0.5rem;
		border-radius: 4px;
		background: hsl(140 50% 25%);
		color: hsl(140 50% 60%);
	}

	.source-badge.env {
		background: hsl(210 80% 25%);
		color: hsl(210 80% 65%);
	}

	/* Environment Lock Badge - indicates ENV-controlled settings */
	.env-lock-badge {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.25rem 0.625rem;
		background: linear-gradient(135deg, hsl(210 70% 25%), hsl(210 60% 20%));
		border: 1px solid hsl(210 60% 35%);
		border-radius: 6px;
		font-size: 0.6875rem;
		font-weight: 600;
		color: hsl(210 80% 70%);
		letter-spacing: 0.02em;
	}

	.env-lock-badge :global(.badge-icon) {
		width: 12px;
		height: 12px;
	}

	/* Locked input styling */
	.form-field input:read-only,
	.form-field input:disabled {
		background: hsl(var(--muted) / 0.3);
		border-color: hsl(210 60% 35% / 0.4);
		color: hsl(var(--muted-foreground));
		cursor: not-allowed;
		opacity: 0.8;
	}

	.field-hint.env-hint {
		color: hsl(210 60% 60%);
		font-style: italic;
	}

	/* Panel info message (when all fields are locked) */
	.panel-info {
		margin-top: 1.25rem;
		padding: 1rem;
		background: hsl(210 60% 50% / 0.08);
		border: 1px dashed hsl(210 60% 35% / 0.4);
		border-radius: 8px;
		text-align: center;
	}

	.panel-info .info-text {
		font-size: 0.8125rem;
		color: hsl(210 60% 60%);
		font-style: italic;
	}

	.input-with-action {
		display: flex;
		gap: 0.5rem;
	}

	.input-with-action input {
		flex: 1;
	}

	.input-action {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 42px;
		background: hsl(var(--muted));
		border: 1px solid hsl(var(--border));
		border-radius: 8px;
		color: hsl(var(--muted-foreground));
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.input-action:hover {
		background: hsl(var(--secondary));
		color: hsl(var(--foreground));
	}

	.input-action :global(svg) {
		width: 18px;
		height: 18px;
	}

	.input-action:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.input-with-suffix {
		display: flex;
		align-items: stretch;
	}

	.input-with-suffix input {
		border-top-right-radius: 0;
		border-bottom-right-radius: 0;
		border-right: none;
	}

	.input-suffix {
		display: flex;
		align-items: center;
		padding: 0 0.875rem;
		background: hsl(var(--muted));
		border: 1px solid hsl(var(--border));
		border-left: none;
		border-radius: 0 8px 8px 0;
		font-size: 0.8125rem;
		color: hsl(var(--muted-foreground));
	}

	.form-row {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 1.5rem;
		align-items: start;
	}

	.form-row .form-field {
		min-width: 0;
		margin-bottom: 0;
	}

	.form-row .form-field input {
		width: 100%;
		max-width: 100%;
		box-sizing: border-box;
	}

	/* ===== Buttons ===== */
	.btn-primary {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 0.625rem 1.25rem;
		background: hsl(var(--primary));
		color: hsl(var(--primary-foreground));
		border: none;
		border-radius: 8px;
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.btn-primary:hover {
		opacity: 0.9;
		transform: translateY(-1px);
	}

	.btn-secondary {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 0.5rem 1rem;
		background: hsl(var(--secondary));
		color: hsl(var(--foreground));
		border: 1px solid hsl(var(--border));
		border-radius: 8px;
		font-size: 0.8125rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.btn-secondary:hover:not(:disabled) {
		background: hsl(var(--muted));
		border-color: hsl(var(--primary) / 0.5);
	}

	.btn-secondary:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.btn-danger {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 0.5rem 1rem;
		background: hsl(var(--secondary));
		color: hsl(var(--foreground));
		border: 1px solid hsl(var(--border));
		border-radius: 8px;
		font-size: 0.8125rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.btn-danger:hover:not(:disabled) {
		background: hsl(0 70% 45%);
		color: white;
		border-color: hsl(0 70% 45%);
	}

	.btn-danger:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.btn-destructive {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 0.5rem 1rem;
		background: hsl(0 60% 25%);
		color: hsl(0 70% 70%);
		border: 1px solid hsl(0 50% 35%);
		border-radius: 8px;
		font-size: 0.8125rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.btn-destructive:hover:not(:disabled) {
		background: hsl(0 70% 45%);
		color: white;
		border-color: hsl(0 70% 45%);
	}

	.btn-destructive:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.btn-large {
		padding: 0.875rem 2rem;
		font-size: 1rem;
	}

	.btn-icon {
		width: 16px;
		height: 16px;
	}

	.btn-all {
		font-weight: 600;
	}

	.spinning {
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	/* ===== Content Grid ===== */
	.content-grid {
		display: grid;
		gap: 1.5rem;
	}

	/* ===== Theme Grid ===== */
	.theme-panel {
		padding-bottom: 0;
	}

	.theme-panel .panel-actions {
		padding: 0 1.25rem 1.25rem;
	}

	.theme-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
		gap: 0.875rem;
		padding: 1.25rem;
	}

	.theme-card {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 1rem 0.75rem;
		background: hsl(var(--muted) / 0.5);
		border: 2px solid hsl(var(--border));
		border-radius: 12px;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.theme-card:hover {
		border-color: hsl(var(--primary) / 0.5);
		transform: translateY(-2px);
	}

	.theme-card.selected {
		border-color: hsl(var(--primary));
		background: hsl(var(--primary) / 0.1);
	}

	.theme-card input {
		position: absolute;
		opacity: 0;
		pointer-events: none;
	}

	.theme-preview {
		width: 56px;
		height: 56px;
		border-radius: 50%;
		margin-bottom: 0.625rem;
		border: 2px solid hsl(var(--border));
		overflow: hidden;
		position: relative;
	}

	.theme-gradient {
		position: absolute;
		inset: 0;
	}

	.theme-preview.modern-minimal .theme-gradient {
		background: linear-gradient(135deg, #5b6ef5 50%, #3d4db7 50%);
	}

	.theme-preview.supabase .theme-gradient {
		background: linear-gradient(135deg, #3ecf8e 50%, #24b47e 50%);
	}

	.theme-preview.doom-64 .theme-gradient {
		background: linear-gradient(135deg, #d97706 50%, #92400e 50%);
	}

	.theme-preview.amber-minimal .theme-gradient {
		background: linear-gradient(135deg, #f59e0b 50%, #d97706 50%);
	}

	.theme-preview.soviet-red .theme-gradient {
		background: linear-gradient(135deg, #cc0000 50%, #8b0000 50%);
	}

	.theme-name {
		font-size: 0.75rem;
		font-weight: 500;
		color: hsl(var(--foreground));
		text-align: center;
	}

	.theme-check {
		position: absolute;
		top: 0.5rem;
		right: 0.5rem;
		width: 20px;
		height: 20px;
		background: hsl(var(--primary));
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		color: hsl(var(--primary-foreground));
	}

	.theme-check :global(svg) {
		width: 12px;
		height: 12px;
	}

	/* ===== Option Cards ===== */
	.option-cards {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.75rem;
		margin-bottom: 1.5rem;
	}

	.option-cards.two-col {
		grid-template-columns: repeat(2, 1fr);
	}

	.option-cards.three-col {
		grid-template-columns: repeat(3, 1fr);
	}

	.option-card {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		padding: 1rem 0.75rem;
		background: hsl(var(--muted) / 0.5);
		border: 2px solid hsl(var(--border));
		border-radius: 12px;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.option-card:hover {
		border-color: hsl(var(--primary) / 0.5);
		background: hsl(var(--muted) / 0.8);
	}

	.option-card.selected {
		border-color: hsl(var(--primary));
		background: hsl(var(--primary) / 0.1);
	}

	.option-card input {
		position: absolute;
		opacity: 0;
		pointer-events: none;
	}

	.option-icon {
		width: 40px;
		height: 40px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: hsl(var(--secondary));
		border-radius: 10px;
		margin-bottom: 0.625rem;
		color: hsl(var(--muted-foreground));
		transition: all 0.2s ease;
	}

	.option-card.selected .option-icon {
		background: hsl(var(--primary) / 0.2);
		color: hsl(var(--primary));
	}

	.option-icon :global(svg) {
		width: 20px;
		height: 20px;
	}

	.option-content {
		flex: 1;
	}

	.option-title {
		display: block;
		font-size: 0.875rem;
		font-weight: 600;
		color: hsl(var(--foreground));
		margin-bottom: 0.25rem;
	}

	.option-desc {
		display: block;
		font-size: 0.7rem;
		color: hsl(var(--muted-foreground));
		line-height: 1.4;
	}

	.option-check {
		position: absolute;
		top: 0.5rem;
		right: 0.5rem;
		width: 20px;
		height: 20px;
		background: hsl(var(--primary));
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		color: hsl(var(--primary-foreground));
	}

	.option-check :global(svg) {
		width: 12px;
		height: 12px;
	}

	/* ===== Subsections ===== */
	.subsection-title {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.9375rem;
		font-weight: 600;
		color: hsl(var(--foreground));
		margin: 1.5rem 0 0.5rem;
		padding: 0 1.25rem;
	}

	.subsection-title:first-of-type {
		margin-top: 1rem;
	}

	.subsection-title.danger {
		color: hsl(0 70% 50%);
	}

	.subsection-icon {
		width: 18px;
		height: 18px;
		color: hsl(var(--muted-foreground));
	}

	.subsection-hint {
		font-size: 0.8125rem;
		color: hsl(var(--muted-foreground));
		margin: 0 0 1rem;
		padding: 0 1.25rem;
	}

	.subsection-hint code {
		padding: 0.125rem 0.375rem;
		background: hsl(var(--muted));
		border-radius: 4px;
		font-size: 0.75rem;
	}

	/* Privacy panel option cards need padding */
	.privacy-panel .option-cards {
		padding: 0 1.25rem;
	}

	/* ===== Toggle Option ===== */
	.toggle-option {
		margin: 1rem 1.25rem;
		padding: 1rem;
		background: hsl(var(--secondary));
		border-radius: 10px;
		border: 1px solid hsl(var(--border));
	}

	.toggle-label {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		cursor: pointer;
	}

	.toggle-label input {
		position: absolute;
		opacity: 0;
		pointer-events: none;
	}

	.toggle-switch {
		position: relative;
		box-sizing: border-box;
		width: 44px;
		height: 24px;
		background: hsl(var(--muted) / 0.5);
		border: 1px solid hsl(var(--muted-foreground) / 0.4);
		border-radius: 12px;
		transition: all 0.2s ease;
		flex-shrink: 0;
	}

	.toggle-switch::after {
		content: '';
		position: absolute;
		top: 1px;
		left: 1px;
		width: 20px;
		height: 20px;
		background: hsl(var(--foreground));
		border-radius: 50%;
		transition: transform 0.2s ease;
	}

	.toggle-label input:checked + .toggle-switch {
		background: hsl(var(--primary));
		border-color: hsl(var(--primary));
	}

	.toggle-label input:checked + .toggle-switch::after {
		transform: translateX(20px);
	}

	.toggle-text {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.875rem;
		font-weight: 500;
		color: hsl(var(--foreground));
	}

	.toggle-icon {
		width: 16px;
		height: 16px;
		color: hsl(var(--muted-foreground));
	}

	.toggle-hint {
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
		margin: 0.5rem 0 0 3.25rem;
	}

	/* ===== Sticky Save ===== */
	.sticky-save {
		position: sticky;
		bottom: 1rem;
		display: flex;
		justify-content: center;
		padding: 1rem;
		background: hsl(var(--card) / 0.95);
		backdrop-filter: blur(8px);
		border-radius: 12px;
		border: 1px solid hsl(var(--border));
		margin-top: 1rem;
	}

	.sticky-save .btn-primary {
		width: 100%;
		max-width: 400px;
	}

	/* ===== Years Display ===== */
	.years-display {
		padding: 1.25rem;
		background: hsl(var(--muted) / 0.3);
		margin: 1rem 1.25rem;
		border-radius: 10px;
	}

	.years-label {
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: hsl(var(--muted-foreground));
		margin-bottom: 0.75rem;
	}

	.years-list {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-bottom: 0.75rem;
	}

	.year-badge {
		padding: 0.375rem 0.875rem;
		background: hsl(var(--primary) / 0.15);
		color: hsl(var(--primary));
		border-radius: 6px;
		font-size: 0.875rem;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}

	.no-years {
		color: hsl(var(--muted-foreground));
		font-style: italic;
		font-size: 0.875rem;
	}

	.years-hint {
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
		margin: 0;
	}

	/* ===== Action Buttons ===== */
	.action-buttons {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		padding: 0 1.25rem 1.25rem;
	}

	.action-buttons.danger {
		padding-top: 0;
	}

	/* ===== Danger Panel ===== */
	.danger-panel {
		border-color: hsl(0 60% 40% / 0.4);
		background: hsl(0 60% 50% / 0.03);
	}

	.panel-header.danger {
		background: hsl(0 60% 50% / 0.1);
		border-bottom-color: hsl(0 60% 40% / 0.3);
	}

	.panel-header.danger h2 {
		color: hsl(0 70% 55%);
	}

	/* Destructive Action Warning Callout - Subordinate to main header */
	.danger-warning {
		position: relative;
		display: flex;
		align-items: flex-start;
		gap: 0.875rem;
		margin: 1rem 1.25rem;
		padding: 0.875rem 1rem 0.875rem 1.125rem;
		background: hsl(0 50% 50% / 0.04);
		border: 1px dashed hsl(0 50% 45% / 0.25);
		border-left: none;
		border-radius: 0 8px 8px 0;
		overflow: hidden;
	}

	/* Left accent stripe with hazard pattern */
	.danger-warning::before {
		content: '';
		position: absolute;
		left: 0;
		top: 0;
		bottom: 0;
		width: 4px;
		background: repeating-linear-gradient(
			-45deg,
			hsl(0 70% 50%),
			hsl(0 70% 50%) 4px,
			hsl(45 100% 50%) 4px,
			hsl(45 100% 50%) 8px
		);
	}

	/* Subtle inner glow effect */
	.danger-warning::after {
		content: '';
		position: absolute;
		left: 4px;
		top: 0;
		bottom: 0;
		width: 40px;
		background: linear-gradient(90deg, hsl(0 70% 50% / 0.08), transparent);
		pointer-events: none;
	}

	.warning-icon {
		position: relative;
		z-index: 1;
		width: 18px;
		height: 18px;
		color: hsl(40 90% 55%);
		flex-shrink: 0;
		margin-top: 0.125rem;
	}

	.warning-content {
		position: relative;
		z-index: 1;
		flex: 1;
	}

	.warning-content strong {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.6875rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: hsl(40 85% 60%);
		background: hsl(40 70% 50% / 0.12);
		padding: 0.1875rem 0.5rem;
		border-radius: 3px;
		margin-bottom: 0.375rem;
	}

	.warning-content p {
		font-size: 0.8125rem;
		color: hsl(var(--muted-foreground));
		margin: 0;
		line-height: 1.5;
	}

	/* ===== AlertDialog Styling ===== */
	:global(.destructive-action) {
		background-color: hsl(0 70% 45%) !important;
		color: white !important;
	}

	:global(.destructive-action:hover) {
		background-color: hsl(0 70% 40%) !important;
	}

	/* ===== Security Tab ===== */
	.security-content {
		display: grid;
		gap: 1.5rem;
	}

	/* CSRF Panel - Shield icon with security green accent */
	.csrf-panel {
		position: relative;
	}

	.csrf-panel::before {
		content: '';
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: 3px;
		background: linear-gradient(
			90deg,
			hsl(145 70% 45%) 0%,
			hsl(145 70% 55%) 50%,
			hsl(160 60% 45%) 100%
		);
		border-radius: 16px 16px 0 0;
		opacity: 0.8;
	}

	.csrf-panel :global(.panel-icon.security) {
		color: hsl(145 70% 50%);
	}

	/* CSRF actions layout */
	.csrf-actions {
		display: flex;
		gap: 0.75rem;
		align-items: center;
		flex-wrap: wrap;
		margin-top: 1rem;
	}

	/* Help Trigger - Whisper-quiet info hint */
	.panel-title :global([data-slot='tooltip-trigger']) {
		all: unset;
		display: inline-flex;
		align-items: center;
		vertical-align: middle;
		margin-left: 0.375rem;
		cursor: pointer;
	}

	.help-trigger {
		all: unset;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		color: hsl(var(--muted-foreground) / 0.4);
		transition: color 0.2s ease;
	}

	.help-trigger:hover {
		color: hsl(var(--muted-foreground) / 0.75);
	}

	.help-trigger:focus-visible {
		color: hsl(210 60% 55%);
	}

	.help-trigger :global(svg) {
		width: 15px;
		height: 15px;
	}

	/* Documentation - Compact Collapsible */
	.docs-collapsible {
		border-radius: 10px;
		overflow: hidden;
	}

	.docs-toggle {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		width: 100%;
		padding: 0.75rem 1rem;
		background: hsl(var(--muted) / 0.25);
		border: 1px solid hsl(var(--border) / 0.6);
		border-radius: 10px;
		color: hsl(var(--muted-foreground));
		font-size: 0.8125rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.docs-toggle:hover {
		background: hsl(var(--muted) / 0.4);
		color: hsl(var(--foreground));
		border-color: hsl(var(--border));
	}

	.docs-toggle :global(.docs-toggle-icon) {
		width: 15px;
		height: 15px;
		opacity: 0.6;
	}

	.docs-toggle-text {
		flex: 1;
		text-align: left;
	}

	.docs-chevron {
		display: flex;
		align-items: center;
		justify-content: center;
		opacity: 0.5;
		transition: transform 0.2s ease;
	}

	.docs-chevron :global(svg) {
		width: 16px;
		height: 16px;
	}

	.docs-chevron.expanded {
		transform: rotate(180deg);
	}

	.docs-content {
		padding: 0.875rem 1rem;
		background: hsl(var(--muted) / 0.15);
		border: 1px solid hsl(var(--border) / 0.6);
		border-top: none;
		border-radius: 0 0 10px 10px;
		margin-top: -1px;
	}

	.docs-hint {
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
		margin: 0 0 0.75rem;
		line-height: 1.5;
	}

	.docs-hint code {
		padding: 0.125rem 0.375rem;
		background: hsl(var(--muted) / 0.6);
		border-radius: 4px;
		font-size: 0.6875rem;
		font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
	}

	.docs-links-inline {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
	}

	.docs-links-inline a {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		color: hsl(var(--primary));
		text-decoration: none;
		font-size: 0.8125rem;
		font-weight: 500;
		transition: opacity 0.15s ease;
	}

	.docs-links-inline a:hover {
		opacity: 0.75;
	}

	.docs-links-inline :global(.inline-link-icon) {
		width: 11px;
		height: 11px;
		opacity: 0.7;
	}

	.docs-separator {
		color: hsl(var(--muted-foreground) / 0.4);
		font-size: 0.75rem;
		user-select: none;
	}

	/* ===== Responsive ===== */
	@media (max-width: 768px) {
		.settings-command-center {
			padding: 1rem 1rem 2rem;
		}

		.page-header {
			flex-direction: column;
			align-items: flex-start;
			gap: 1rem;
		}

		.tab-nav {
			gap: 0.25rem;
			padding: 0.375rem;
		}

		.tab-button {
			padding: 0.625rem 1rem;
			font-size: 0.8125rem;
		}

		.tab-label {
			display: none;
		}

		.form-row {
			grid-template-columns: 1fr;
		}

		.theme-grid {
			grid-template-columns: repeat(2, 1fr);
		}

		.option-cards,
		.option-cards.two-col,
		.option-cards.three-col {
			grid-template-columns: repeat(2, 1fr);
		}
	}

	@media (max-width: 480px) {
		.tab-button {
			padding: 0.5rem 0.75rem;
		}

		.theme-grid {
			grid-template-columns: repeat(2, 1fr);
			gap: 0.625rem;
		}

		.theme-preview {
			width: 44px;
			height: 44px;
		}

		.option-cards,
		.option-cards.two-col,
		.option-cards.three-col {
			grid-template-columns: 1fr;
		}

		.option-card {
			flex-direction: row;
			text-align: left;
			gap: 1rem;
			padding: 1rem;
		}

		.option-icon {
			margin-bottom: 0;
		}

		.option-check {
			position: static;
			margin-left: auto;
		}
	}

	/* CSRF Tooltip - Global styles for portal-rendered content */
	:global(.csrf-tooltip) {
		max-width: 320px !important;
		padding: 0.875rem 1rem !important;
		background: hsl(var(--popover)) !important;
		border: 1px solid hsl(var(--border)) !important;
		border-radius: 10px !important;
		box-shadow:
			0 4px 12px hsl(0 0% 0% / 0.15),
			0 2px 4px hsl(0 0% 0% / 0.1) !important;
	}

	:global(.csrf-tooltip-inner) {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	:global(.csrf-tooltip-inner strong) {
		font-size: 0.8125rem;
		font-weight: 600;
		color: hsl(var(--foreground));
		letter-spacing: 0.01em;
	}

	:global(.csrf-tooltip-inner p) {
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
		line-height: 1.55;
		margin: 0;
	}
</style>
