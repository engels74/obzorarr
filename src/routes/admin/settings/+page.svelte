<script lang="ts">
	import { enhance, deserialize } from '$app/forms';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import * as Tabs from '$lib/components/ui/tabs';
	import { handleFormToast } from '$lib/utils/form-toast';
	import type { PageData, ActionData } from './$types';

	/**
	 * Admin Settings Page
	 *
	 * Manages application configuration:
	 * - API settings (Plex, OpenAI)
	 * - Theme selection
	 * - Anonymization settings
	 * - Year/archive settings
	 *
	 * Implements Requirements:
	 * - 11.4: Theme configuration
	 * - 11.5: API configuration
	 * - 11.6: Year and archive settings
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
		selectedUITheme = data.uiTheme;
		selectedWrappedTheme = data.wrappedTheme;
		selectedAnonymization = data.anonymizationMode;
		selectedWrappedLogoMode = data.wrappedLogoMode;
		logRetentionDays = data.logSettings.retentionDays;
		logMaxCount = data.logSettings.maxCount;
		logDebugEnabled = data.logSettings.debugEnabled;
		// Sharing settings
		selectedServerWrappedMode = data.serverWrappedShareMode;
		selectedDefaultShareMode = data.globalDefaults.defaultShareMode;
		allowUserControl = data.globalDefaults.allowUserControl;
	});

	// Source label helper
	function getSourceLabel(source: 'env' | 'db' | 'default'): string {
		switch (source) {
			case 'env':
				return 'from environment variable';
			case 'db':
				return 'saved in database';
			default:
				return '';
		}
	}

	// Theme display names
	const themeLabels: Record<string, string> = {
		'soviet-red': 'Soviet Red (Default)',
		'midnight-blue': 'Midnight Blue',
		'forest-green': 'Forest Green',
		'royal-purple': 'Royal Purple'
	};

	// Anonymization descriptions
	const anonymizationDescriptions: Record<string, string> = {
		real: 'Show actual usernames in all statistics',
		anonymous: 'Replace all usernames with "User #1", "User #2", etc.',
		hybrid: 'Users see their own name, but others are anonymized'
	};

	// Wrapped logo mode descriptions
	const wrappedLogoDescriptions: Record<string, string> = {
		always_show: 'Logo is always visible on all wrapped pages',
		always_hide: 'Logo is hidden on all wrapped pages',
		user_choice: 'Users can choose to show or hide the logo on their wrapped page'
	};

	// Icon helpers for privacy cards
	function getAnonymizationIcon(mode: string): string {
		switch (mode) {
			case 'real':
				return '👤';
			case 'anonymous':
				return '🎭';
			case 'hybrid':
				return '👥';
			default:
				return '⚙️';
		}
	}

	function getLogoIcon(mode: string): string {
		switch (mode) {
			case 'always_show':
				return '✅';
			case 'always_hide':
				return '🚫';
			case 'user_choice':
				return '🔄';
			default:
				return '⚙️';
		}
	}

	function getShareIcon(mode: string): string {
		switch (mode) {
			case 'public':
				return '🌐';
			case 'private-oauth':
				return '🔐';
			case 'private-link':
				return '🔗';
			default:
				return '⚙️';
		}
	}

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

		// Fetch the count via form action
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

	// Handle confirmed cache clear
	function handleCacheCleared() {
		cacheDialogOpen = false;
		pendingCacheYear = undefined;
		pendingCacheCount = 0;
	}

	// Get confirmation message based on year
	function getCacheConfirmationMessage(): string {
		if (pendingCacheYear !== undefined) {
			return `This will permanently delete ${pendingCacheCount} cached statistics record${pendingCacheCount !== 1 ? 's' : ''} for ${pendingCacheYear}.`;
		}
		return `This will permanently delete ${pendingCacheCount} cached statistics record${pendingCacheCount !== 1 ? 's' : ''} across all years.`;
	}

	// Open play history clearing confirmation dialog
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

	// Handle confirmed history clear
	function handleHistoryCleared() {
		historyDialogOpen = false;
		pendingHistoryYear = undefined;
		pendingHistoryCount = 0;
	}

	// Get confirmation message for history clearing
	function getHistoryConfirmationMessage(): string {
		if (pendingHistoryYear !== undefined) {
			return `This will permanently delete ${pendingHistoryCount} play history record${pendingHistoryCount !== 1 ? 's' : ''} for ${pendingHistoryYear}.`;
		}
		return `This will permanently delete ${pendingHistoryCount} play history record${pendingHistoryCount !== 1 ? 's' : ''} across all years.`;
	}
</script>

<div class="settings-page">
	<header class="page-header">
		<h1>Settings</h1>
		<p class="subtitle">Configure application settings</p>
	</header>

	<Tabs.Root value="connections" class="settings-tabs">
		<Tabs.List class="tabs-list">
			<Tabs.Trigger value="connections">Connections</Tabs.Trigger>
			<Tabs.Trigger value="appearance">Appearance</Tabs.Trigger>
			<Tabs.Trigger value="privacy">Privacy</Tabs.Trigger>
			<Tabs.Trigger value="data">Data</Tabs.Trigger>
			<Tabs.Trigger value="system">System</Tabs.Trigger>
		</Tabs.List>

		<!-- Connections Tab: Plex & OpenAI Settings -->
		<Tabs.Content value="connections">
			<section class="section">
				<h2>API Configuration</h2>
				<p class="section-description">
					Configure connections to Plex and OpenAI (for fun facts generation).
				</p>

				<form method="POST" action="?/updateApiConfig" use:enhance class="api-form">
					<div class="form-group">
						<label for="plexServerUrl">
							Plex Server URL
							{#if plexServerUrlSource === 'env'}
								<span class="source-badge env">ENV</span>
							{:else if plexServerUrlSource === 'db'}
								<span class="source-badge db">Saved</span>
							{/if}
						</label>
						<input
							type="url"
							id="plexServerUrl"
							name="plexServerUrl"
							bind:value={plexServerUrl}
							placeholder="http://192.168.1.100:32400"
							class:from-env={plexServerUrlSource === 'env'}
						/>
						<span class="form-hint">
							The URL of your Plex Media Server
							{#if plexServerUrlSource === 'env'}
								<em class="source-hint">({getSourceLabel(plexServerUrlSource)})</em>
							{/if}
						</span>
					</div>

					<div class="form-group">
						<label for="plexToken">
							Plex Token
							{#if plexTokenSource === 'env'}
								<span class="source-badge env">ENV</span>
							{:else if plexTokenSource === 'db'}
								<span class="source-badge db">Saved</span>
							{/if}
						</label>
						<div class="password-input">
							<input
								type={showPlexToken ? 'text' : 'password'}
								id="plexToken"
								name="plexToken"
								bind:value={plexToken}
								placeholder="Enter Plex token"
								class:from-env={plexTokenSource === 'env'}
							/>
							<button
								type="button"
								class="toggle-visibility"
								onclick={() => (showPlexToken = !showPlexToken)}
							>
								{showPlexToken ? 'Hide' : 'Show'}
							</button>
						</div>
						<span class="form-hint">
							Your X-Plex-Token for authentication
							{#if plexTokenSource === 'env'}
								<em class="source-hint">({getSourceLabel(plexTokenSource)})</em>
							{/if}
						</span>
					</div>

					<div class="form-actions">
						<button type="submit" class="save-button">Save Plex Settings</button>
					</div>
				</form>

				<!-- Test Connection -->
				<form
					method="POST"
					action="?/testPlexConnection"
					use:enhance={() => {
						isTesting = true;
						return async ({ update }) => {
							isTesting = false;
							await update();
						};
					}}
					class="test-form"
				>
					<input type="hidden" name="plexServerUrl" value={plexServerUrl} />
					<input type="hidden" name="plexToken" value={plexToken} />
					<button
						type="submit"
						class="test-button"
						disabled={isTesting || !plexServerUrl || !plexToken}
					>
						{#if isTesting}
							Testing...
						{:else}
							Test Connection
						{/if}
					</button>
				</form>

				<hr class="section-divider" />

				<form method="POST" action="?/updateApiConfig" use:enhance class="api-form">
					<h3>OpenAI Configuration (Optional)</h3>
					<p class="subsection-description">
						For AI-generated fun facts. Leave empty to use predefined templates.
					</p>

					<div class="form-group">
						<label for="openaiApiKey">
							OpenAI API Key
							{#if openaiApiKeySource === 'env'}
								<span class="source-badge env">ENV</span>
							{:else if openaiApiKeySource === 'db'}
								<span class="source-badge db">Saved</span>
							{/if}
						</label>
						<div class="password-input">
							<input
								type={showOpenaiKey ? 'text' : 'password'}
								id="openaiApiKey"
								name="openaiApiKey"
								bind:value={openaiApiKey}
								placeholder="sk-..."
								class:from-env={openaiApiKeySource === 'env'}
							/>
							<button
								type="button"
								class="toggle-visibility"
								onclick={() => (showOpenaiKey = !showOpenaiKey)}
							>
								{showOpenaiKey ? 'Hide' : 'Show'}
							</button>
						</div>
						{#if openaiApiKeySource === 'env'}
							<span class="form-hint">
								<em class="source-hint">({getSourceLabel(openaiApiKeySource)})</em>
							</span>
						{/if}
					</div>

					<div class="form-group">
						<label for="openaiBaseUrl">
							OpenAI Base URL (Optional)
							{#if openaiBaseUrlSource === 'env'}
								<span class="source-badge env">ENV</span>
							{:else if openaiBaseUrlSource === 'db'}
								<span class="source-badge db">Saved</span>
							{/if}
						</label>
						<input
							type="url"
							id="openaiBaseUrl"
							name="openaiBaseUrl"
							bind:value={openaiBaseUrl}
							placeholder="https://api.openai.com/v1"
							class:from-env={openaiBaseUrlSource === 'env'}
						/>
						<span class="form-hint">
							For custom OpenAI-compatible endpoints
							{#if openaiBaseUrlSource === 'env'}
								<em class="source-hint">({getSourceLabel(openaiBaseUrlSource)})</em>
							{/if}
						</span>
					</div>

					<div class="form-group">
						<label for="openaiModel">
							OpenAI Model
							{#if openaiModelSource === 'env'}
								<span class="source-badge env">ENV</span>
							{:else if openaiModelSource === 'db'}
								<span class="source-badge db">Saved</span>
							{/if}
						</label>
						<input
							type="text"
							id="openaiModel"
							name="openaiModel"
							bind:value={openaiModel}
							placeholder="gpt-4o-mini"
							class:from-env={openaiModelSource === 'env'}
						/>
						<span class="form-hint">
							The model to use for fun facts generation (default: gpt-4o-mini)
							{#if openaiModelSource === 'env'}
								<em class="source-hint">({getSourceLabel(openaiModelSource)})</em>
							{/if}
						</span>
					</div>

					<div class="form-actions">
						<button type="submit" class="save-button">Save OpenAI Settings</button>
					</div>
				</form>
			</section>
		</Tabs.Content>

		<!-- Appearance Tab: UI Theme & Wrapped Theme -->
		<Tabs.Content value="appearance">
			<section class="section">
				<h2>UI Theme</h2>
				<p class="section-description">
					Select a color theme for the dashboard, admin pages, and all non-wrapped pages.
				</p>

				<form method="POST" action="?/updateUITheme" use:enhance class="theme-form">
					<div class="theme-options">
						{#each data.themeOptions as theme}
							<label class="theme-option" class:selected={selectedUITheme === theme.value}>
								<input type="radio" name="theme" value={theme.value} bind:group={selectedUITheme} />
								<span class="theme-preview {theme.value}"></span>
								<span class="theme-label">{themeLabels[theme.value] ?? theme.label}</span>
							</label>
						{/each}
					</div>

					<div class="form-actions">
						<button type="submit" class="save-button">Save UI Theme</button>
					</div>
				</form>
			</section>

			<!-- Wrapped Theme Section -->
			<section class="section">
				<h2>Wrapped Theme</h2>
				<p class="section-description">
					Select a color theme for the Year in Review slideshow pages (/wrapped/*).
				</p>

				<form method="POST" action="?/updateWrappedTheme" use:enhance class="theme-form">
					<div class="theme-options">
						{#each data.themeOptions as theme}
							<label class="theme-option" class:selected={selectedWrappedTheme === theme.value}>
								<input
									type="radio"
									name="theme"
									value={theme.value}
									bind:group={selectedWrappedTheme}
								/>
								<span class="theme-preview {theme.value}"></span>
								<span class="theme-label">{themeLabels[theme.value] ?? theme.label}</span>
							</label>
						{/each}
					</div>

					<div class="form-actions">
						<button type="submit" class="save-button">Save Wrapped Theme</button>
					</div>
				</form>
			</section>
		</Tabs.Content>

		<!-- Privacy Tab: Consolidated Form with Horizontal Cards -->
		<Tabs.Content value="privacy">
			<form method="POST" action="?/updatePrivacySettings" use:enhance class="privacy-form">
				<!-- GROUP 1: User Privacy -->
				<section class="section privacy-group">
					<h2>User Privacy</h2>
					<p class="section-description">
						Control how usernames and branding appear across the platform.
					</p>

					<!-- Anonymization Mode - Horizontal Cards -->
					<div class="privacy-subsection">
						<h3>Anonymization Mode</h3>
						<p class="subsection-description">
							Control how usernames appear in server-wide statistics.
						</p>
						<div class="privacy-card-grid">
							{#each data.anonymizationOptions as option}
								<label class="privacy-card" class:selected={selectedAnonymization === option.value}>
									<input
										type="radio"
										name="anonymizationMode"
										value={option.value}
										bind:group={selectedAnonymization}
									/>
									<span class="card-icon">{getAnonymizationIcon(option.value)}</span>
									<span class="card-title">{option.label}</span>
									<span class="card-desc">{anonymizationDescriptions[option.value]}</span>
								</label>
							{/each}
						</div>
					</div>

					<!-- Logo Mode - Horizontal Cards -->
					<div class="privacy-subsection">
						<h3>Wrapped Page Logo</h3>
						<p class="subsection-description">Control logo visibility on wrapped pages.</p>
						<div class="privacy-card-grid">
							{#each data.wrappedLogoOptions as option}
								<label
									class="privacy-card"
									class:selected={selectedWrappedLogoMode === option.value}
								>
									<input
										type="radio"
										name="logoMode"
										value={option.value}
										bind:group={selectedWrappedLogoMode}
									/>
									<span class="card-icon">{getLogoIcon(option.value)}</span>
									<span class="card-title">{option.label}</span>
									<span class="card-desc">{wrappedLogoDescriptions[option.value]}</span>
								</label>
							{/each}
						</div>
					</div>
				</section>

				<!-- GROUP 2: Sharing Access -->
				<section class="section privacy-group">
					<h2>Sharing Access</h2>
					<p class="section-description">Configure access controls for wrapped pages.</p>

					<!-- Server-Wide Wrapped Access - 2-column cards -->
					<div class="privacy-subsection">
						<h3>Server-Wide Wrapped Access</h3>
						<p class="subsection-description">
							Control who can access the server-wide Year in Review at <code
								>/wrapped/{data.currentYear}</code
							>.
						</p>
						<div class="privacy-card-grid two-col">
							<label class="privacy-card" class:selected={selectedServerWrappedMode === 'public'}>
								<input
									type="radio"
									name="serverWrappedShareMode"
									value="public"
									bind:group={selectedServerWrappedMode}
								/>
								<span class="card-icon">{getShareIcon('public')}</span>
								<span class="card-title">Public</span>
								<span class="card-desc">Anyone can view the server wrapped</span>
							</label>
							<label
								class="privacy-card"
								class:selected={selectedServerWrappedMode === 'private-oauth'}
							>
								<input
									type="radio"
									name="serverWrappedShareMode"
									value="private-oauth"
									bind:group={selectedServerWrappedMode}
								/>
								<span class="card-icon">{getShareIcon('private-oauth')}</span>
								<span class="card-title">Private OAuth</span>
								<span class="card-desc">Server members only</span>
							</label>
						</div>
					</div>

					<!-- Sharing Defaults - 3-column cards + checkbox -->
					<div class="privacy-subsection">
						<h3>User Sharing Defaults</h3>
						<p class="subsection-description">
							Set the minimum privacy floor for user wrapped pages.
						</p>
						<div class="privacy-card-grid three-col">
							<label class="privacy-card" class:selected={selectedDefaultShareMode === 'public'}>
								<input
									type="radio"
									name="defaultShareMode"
									value="public"
									bind:group={selectedDefaultShareMode}
								/>
								<span class="card-icon">{getShareIcon('public')}</span>
								<span class="card-title">Public</span>
								<span class="card-desc">Users can choose any mode</span>
							</label>
							<label
								class="privacy-card"
								class:selected={selectedDefaultShareMode === 'private-oauth'}
							>
								<input
									type="radio"
									name="defaultShareMode"
									value="private-oauth"
									bind:group={selectedDefaultShareMode}
								/>
								<span class="card-icon">{getShareIcon('private-oauth')}</span>
								<span class="card-title">Private OAuth</span>
								<span class="card-desc">Minimum: server members only</span>
							</label>
							<label
								class="privacy-card"
								class:selected={selectedDefaultShareMode === 'private-link'}
							>
								<input
									type="radio"
									name="defaultShareMode"
									value="private-link"
									bind:group={selectedDefaultShareMode}
								/>
								<span class="card-icon">{getShareIcon('private-link')}</span>
								<span class="card-title">Private Link</span>
								<span class="card-desc">Minimum: share link required</span>
							</label>
						</div>

						<!-- User Control Checkbox -->
						<div class="user-control-option">
							<label class="checkbox-label">
								<input
									type="checkbox"
									name="allowUserControl"
									value="true"
									bind:checked={allowUserControl}
								/>
								<span class="checkbox-text">Allow users to control their own sharing settings</span>
							</label>
							<span class="form-hint checkbox-hint">
								When enabled, users can adjust their wrapped page visibility (up to the privacy
								floor).
							</span>
						</div>
						<input type="hidden" name="allowUserControl" value={allowUserControl.toString()} />
					</div>
				</section>

				<!-- Single Save Button -->
				<div class="form-actions sticky-actions">
					<button type="submit" class="save-button primary-action">Save Privacy Settings</button>
				</div>
			</form>
		</Tabs.Content>

		<!-- Data Tab: Year/Archive & Clear Play History -->
		<Tabs.Content value="data">
			<section class="section">
				<h2>Year & Archive</h2>
				<p class="section-description">Manage available years and clear cached statistics.</p>

				<div class="years-info">
					<p><strong>Available Years:</strong> {data.availableYears.join(', ') || 'None'}</p>
					<p class="info-hint">Years are automatically detected from play history data.</p>
				</div>

				<h3>Clear Statistics Cache</h3>
				<p class="subsection-description">
					Force recalculation of statistics by clearing the cache.
				</p>

				<div class="cache-actions">
					{#each data.availableYears as year}
						<button
							type="button"
							class="cache-button"
							onclick={() => showCacheConfirmation(year)}
							disabled={loadingCount}
						>
							{loadingCount && pendingCacheYear === year ? 'Loading...' : `Clear ${year} Cache`}
						</button>
					{/each}

					<button
						type="button"
						class="cache-button all"
						onclick={() => showCacheConfirmation()}
						disabled={loadingCount}
					>
						{loadingCount && pendingCacheYear === undefined ? 'Loading...' : 'Clear All Cache'}
					</button>
				</div>
			</section>

			<!-- Danger Zone: Clear Play History -->
			<div class="danger-zone">
				<h2>Clear Play History</h2>
				<p class="section-description">
					Permanently delete viewing history from the database. Related statistics cache will be
					automatically cleared.
				</p>

				<div class="warning-box">
					<strong>Warning:</strong> This action is destructive and cannot be undone. All viewing history
					for the selected year(s) will be permanently deleted.
				</div>

				<h3>Delete Play History</h3>
				<p class="subsection-description">
					Remove viewing history for a specific year or all years.
				</p>

				<div class="cache-actions">
					{#each data.availableYears as year}
						<button
							type="button"
							class="cache-button danger"
							onclick={() => showHistoryConfirmation(year)}
							disabled={loadingHistoryCount}
						>
							{loadingHistoryCount && pendingHistoryYear === year ? 'Loading...' : `Clear ${year}`}
						</button>
					{/each}

					<button
						type="button"
						class="cache-button danger all"
						onclick={() => showHistoryConfirmation()}
						disabled={loadingHistoryCount}
					>
						{loadingHistoryCount && pendingHistoryYear === undefined
							? 'Loading...'
							: 'Clear All History'}
					</button>
				</div>
			</div>
		</Tabs.Content>

		<!-- System Tab: Logging -->
		<Tabs.Content value="system">
			<section class="section">
				<h2>Logging</h2>
				<p class="section-description">
					Configure log retention and debug settings. <a href="/admin/logs" class="section-link"
						>View logs</a
					>
				</p>

				<form method="POST" action="?/updateLogSettings" use:enhance class="logging-form">
					<div class="form-row">
						<div class="form-group half">
							<label for="retentionDays">Retention Period (days)</label>
							<input
								type="number"
								id="retentionDays"
								name="retentionDays"
								bind:value={logRetentionDays}
								min="1"
								max="365"
							/>
							<span class="form-hint"
								>Logs older than this will be automatically deleted (1-365)</span
							>
						</div>

						<div class="form-group half">
							<label for="maxCount">Maximum Log Count</label>
							<input
								type="number"
								id="maxCount"
								name="maxCount"
								bind:value={logMaxCount}
								min="1000"
								max="1000000"
								step="1000"
							/>
							<span class="form-hint">Maximum logs to retain (1,000-1,000,000)</span>
						</div>
					</div>

					<div class="form-group">
						<label class="checkbox-label">
							<input type="checkbox" name="debugEnabled" bind:checked={logDebugEnabled} />
							<span class="checkbox-text">Enable DEBUG level logging</span>
						</label>
						<span class="form-hint checkbox-hint">
							When enabled, detailed debug logs will be recorded. This may generate a large volume
							of logs.
						</span>
					</div>

					<input type="hidden" name="debugEnabled" value={logDebugEnabled.toString()} />

					<div class="form-actions">
						<button type="submit" class="save-button">Save Logging Settings</button>
					</div>
				</form>
			</section>
		</Tabs.Content>
	</Tabs.Root>

	<!-- Cache Clearing Confirmation Dialog -->
	<AlertDialog.Root bind:open={cacheDialogOpen}>
		<AlertDialog.Content>
			<AlertDialog.Header>
				<AlertDialog.Title>
					{pendingCacheYear !== undefined ? `Clear ${pendingCacheYear} Cache?` : 'Clear All Cache?'}
				</AlertDialog.Title>
				<AlertDialog.Description>
					{getCacheConfirmationMessage()}
					<br /><br />
					Statistics will be recalculated on next access. This action cannot be undone.
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
					<AlertDialog.Action type="submit" disabled={isClearing} class="gap-2">
						{#if isClearing}
							<span class="spinner small"></span>
							<span>Clearing...</span>
						{:else}
							Delete {pendingCacheCount} Record{pendingCacheCount !== 1 ? 's' : ''}
						{/if}
					</AlertDialog.Action>
				</form>
			</AlertDialog.Footer>
		</AlertDialog.Content>
	</AlertDialog.Root>

	<!-- Play History Clearing Confirmation Dialog -->
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
					<strong>This action cannot be undone.</strong> Statistics cache for affected years will also
					be cleared.
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
					<AlertDialog.Action
						type="submit"
						disabled={isClearingHistory}
						class="gap-2 destructive-action"
					>
						{#if isClearingHistory}
							<span class="spinner small"></span>
							<span>Deleting...</span>
						{:else}
							Delete {pendingHistoryCount} Record{pendingHistoryCount !== 1 ? 's' : ''}
						{/if}
					</AlertDialog.Action>
				</form>
			</AlertDialog.Footer>
		</AlertDialog.Content>
	</AlertDialog.Root>
</div>

<style>
	.settings-page {
		max-width: 800px;
		margin: 0 auto;
		padding: 2rem;
	}

	.page-header {
		margin-bottom: 2rem;
	}

	.page-header h1 {
		font-size: 2rem;
		font-weight: 700;
		color: hsl(var(--primary));
		margin: 0 0 0.5rem;
	}

	.subtitle {
		color: hsl(var(--muted-foreground));
		margin: 0;
	}

	/* Tabs Styling */
	.settings-tabs {
		margin-top: 1.5rem;
	}

	:global(.tabs-list) {
		display: flex;
		gap: 0.25rem;
		border-bottom: 1px solid hsl(var(--border));
		margin-bottom: 1.5rem;
		overflow-x: auto;
		scrollbar-width: thin;
		-webkit-overflow-scrolling: touch;
		padding-bottom: 0;
	}

	:global(.tabs-list button) {
		padding: 0.75rem 1rem;
		font-size: 0.875rem;
		font-weight: 500;
		color: hsl(var(--muted-foreground));
		background: transparent;
		border: none;
		border-bottom: 2px solid transparent;
		cursor: pointer;
		white-space: nowrap;
		transition: all 0.15s ease;
	}

	:global(.tabs-list button:hover) {
		color: hsl(var(--foreground));
	}

	:global(.tabs-list button[data-state='active']) {
		color: hsl(var(--primary));
		border-bottom-color: hsl(var(--primary));
	}

	/* Danger Zone Styling */
	.danger-zone {
		border: 2px solid hsl(0 60% 40% / 0.4);
		border-radius: var(--radius);
		padding: 1.5rem;
		margin-top: 1.5rem;
		background: hsl(0 60% 50% / 0.05);
	}

	.danger-zone h2 {
		color: hsl(0 70% 50%);
		font-size: 1.125rem;
		font-weight: 600;
		margin: 0 0 0.5rem;
	}

	.danger-zone h3 {
		color: hsl(0 70% 50%);
	}

	.section {
		background: hsl(var(--card));
		border: 1px solid hsl(var(--border));
		border-radius: var(--radius);
		padding: 1.5rem;
		margin-bottom: 1.5rem;
	}

	.section h2 {
		font-size: 1.125rem;
		font-weight: 600;
		color: hsl(var(--foreground));
		margin: 0 0 0.5rem;
	}

	.section h3 {
		font-size: 1rem;
		font-weight: 600;
		color: hsl(var(--foreground));
		margin: 1.5rem 0 0.5rem;
	}

	.section-description {
		color: hsl(var(--muted-foreground));
		font-size: 0.875rem;
		margin: 0 0 1rem;
	}

	.subsection-description {
		color: hsl(var(--muted-foreground));
		font-size: 0.8rem;
		margin: 0 0 1rem;
	}

	.section-divider {
		border: none;
		border-top: 1px solid hsl(var(--border));
		margin: 1.5rem 0;
	}

	/* Form Styles */
	.form-group {
		margin-bottom: 1rem;
	}

	.form-group label {
		display: block;
		font-size: 0.875rem;
		font-weight: 500;
		margin-bottom: 0.375rem;
		color: hsl(var(--foreground));
	}

	.form-group input {
		width: 100%;
		padding: 0.5rem 0.75rem;
		background: hsl(var(--input));
		border: 1px solid hsl(var(--border));
		border-radius: var(--radius);
		color: hsl(var(--foreground));
		font-size: 0.875rem;
	}

	.form-group input:focus {
		outline: none;
		border-color: hsl(var(--ring));
		box-shadow: 0 0 0 2px hsl(var(--ring) / 0.2);
	}

	.form-hint {
		display: block;
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
		margin-top: 0.25rem;
	}

	/* Source badges and indicators */
	.source-badge {
		display: inline-flex;
		align-items: center;
		padding: 0.125rem 0.375rem;
		font-size: 0.625rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.025em;
		border-radius: calc(var(--radius) / 2);
		margin-left: 0.5rem;
		vertical-align: middle;
	}

	.source-badge.env {
		background: hsl(210 80% 40% / 0.2);
		color: hsl(210 80% 50%);
		border: 1px solid hsl(210 80% 40% / 0.3);
	}

	.source-badge.db {
		background: hsl(140 50% 35% / 0.2);
		color: hsl(140 50% 45%);
		border: 1px solid hsl(140 50% 35% / 0.3);
	}

	.source-hint {
		color: hsl(210 80% 50%);
		font-style: italic;
	}

	.form-group input.from-env {
		border-color: hsl(210 80% 40% / 0.4);
		background: hsl(210 80% 50% / 0.05);
	}

	.form-group input.from-env:focus {
		border-color: hsl(210 80% 50%);
		box-shadow: 0 0 0 2px hsl(210 80% 50% / 0.2);
	}

	.password-input {
		display: flex;
		gap: 0.5rem;
	}

	.password-input input {
		flex: 1;
	}

	.toggle-visibility {
		padding: 0.5rem 0.75rem;
		background: hsl(var(--muted));
		color: hsl(var(--foreground));
		border: 1px solid hsl(var(--border));
		border-radius: var(--radius);
		font-size: 0.75rem;
		cursor: pointer;
	}

	.toggle-visibility:hover {
		background: hsl(var(--secondary));
	}

	.form-actions {
		margin-top: 1rem;
	}

	.save-button {
		padding: 0.5rem 1rem;
		background: hsl(var(--primary));
		color: hsl(var(--primary-foreground));
		border: none;
		border-radius: var(--radius);
		font-weight: 500;
		cursor: pointer;
		transition: opacity 0.15s ease;
	}

	.save-button:hover {
		opacity: 0.9;
	}

	.test-form {
		margin-top: 0.75rem;
	}

	.test-button {
		padding: 0.5rem 1rem;
		background: hsl(var(--secondary));
		color: hsl(var(--foreground));
		border: 1px solid hsl(var(--border));
		border-radius: var(--radius);
		font-size: 0.875rem;
		cursor: pointer;
	}

	.test-button:hover:not(:disabled) {
		background: hsl(var(--muted));
	}

	.test-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* Theme Options */
	.theme-options {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
		gap: 1rem;
		margin-bottom: 1rem;
	}

	.theme-option {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 1rem;
		background: hsl(var(--muted));
		border: 2px solid hsl(var(--border));
		border-radius: var(--radius);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.theme-option:hover {
		border-color: hsl(var(--primary) / 0.5);
	}

	.theme-option.selected {
		border-color: hsl(var(--primary));
		background: hsl(var(--primary) / 0.1);
	}

	.theme-option input {
		position: absolute;
		opacity: 0;
		pointer-events: none;
	}

	.theme-preview {
		width: 48px;
		height: 48px;
		border-radius: 50%;
		margin-bottom: 0.5rem;
		border: 2px solid hsl(var(--border));
	}

	.theme-preview.soviet-red {
		background: linear-gradient(135deg, #cc0000 50%, #8b0000 50%);
	}

	.theme-preview.midnight-blue {
		background: linear-gradient(135deg, #1e3a5f 50%, #0d1f3c 50%);
	}

	.theme-preview.forest-green {
		background: linear-gradient(135deg, #228b22 50%, #145214 50%);
	}

	.theme-preview.royal-purple {
		background: linear-gradient(135deg, #6b3fa0 50%, #4a2c6e 50%);
	}

	.theme-label {
		font-size: 0.75rem;
		font-weight: 500;
		text-align: center;
		color: hsl(var(--foreground));
	}

	/* Years/Archive */
	.years-info {
		margin-bottom: 1.5rem;
		padding: 1rem;
		background: hsl(var(--muted));
		border-radius: var(--radius);
	}

	.years-info p {
		margin: 0;
		font-size: 0.875rem;
	}

	.years-info .info-hint {
		margin-top: 0.5rem;
		color: hsl(var(--muted-foreground));
		font-size: 0.75rem;
	}

	.cache-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.cache-form {
		margin: 0;
	}

	.cache-button {
		padding: 0.5rem 1rem;
		background: hsl(var(--secondary));
		color: hsl(var(--foreground));
		border: 1px solid hsl(var(--border));
		border-radius: var(--radius);
		font-size: 0.75rem;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.cache-button:hover {
		background: hsl(var(--destructive));
		color: hsl(var(--destructive-foreground));
		border-color: hsl(var(--destructive));
	}

	.cache-button.all {
		background: hsl(var(--muted));
		font-weight: 500;
	}

	.cache-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.warning-box {
		padding: 0.75rem 1rem;
		background: hsl(0 60% 50% / 0.1);
		border: 1px solid hsl(0 60% 50% / 0.3);
		border-radius: var(--radius);
		margin-bottom: 1rem;
		font-size: 0.875rem;
		color: hsl(0 70% 45%);
	}

	.cache-button.danger {
		background: hsl(var(--secondary));
	}

	.cache-button.danger:hover:not(:disabled) {
		background: hsl(0 70% 45%);
		color: white;
		border-color: hsl(0 70% 45%);
	}

	.cache-button.danger.all {
		background: hsl(var(--muted));
	}

	/* Destructive AlertDialog button styling */
	:global(.destructive-action) {
		background-color: hsl(0 70% 45%) !important;
		color: white !important;
	}

	:global(.destructive-action:hover) {
		background-color: hsl(0 70% 40%) !important;
	}

	/* Section Link */
	.section-link {
		color: hsl(var(--primary));
		text-decoration: underline;
	}

	.section-link:hover {
		opacity: 0.8;
	}

	/* Form Row (for side-by-side inputs) */
	.form-row {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 1rem;
		margin-bottom: 1rem;
	}

	.form-group.half {
		margin-bottom: 0;
	}

	/* Checkbox Styles */
	.checkbox-label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		cursor: pointer;
		font-size: 0.875rem;
	}

	.checkbox-label input[type='checkbox'] {
		width: auto;
		accent-color: hsl(var(--primary));
		cursor: pointer;
	}

	.checkbox-text {
		font-weight: 500;
		color: hsl(var(--foreground));
	}

	.checkbox-hint {
		margin-left: 1.5rem;
	}

	/* Responsive */
	@media (max-width: 640px) {
		.settings-page {
			padding: 1rem;
		}

		.theme-options {
			grid-template-columns: repeat(2, 1fr);
		}

		.form-row {
			grid-template-columns: 1fr;
		}

		.form-group.half {
			margin-bottom: 1rem;
		}
	}

	/* Spinner for loading states */
	.spinner {
		width: 20px;
		height: 20px;
		border: 2px solid hsl(var(--primary) / 0.2);
		border-top-color: hsl(var(--primary));
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	.spinner.small {
		width: 14px;
		height: 14px;
		border-width: 2px;
		border-color: hsl(var(--destructive-foreground) / 0.3);
		border-top-color: hsl(var(--destructive-foreground));
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	/* ========================================
	 * Privacy Card Grid - Horizontal Layout
	 * ======================================== */
	.privacy-card-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
		gap: 0.75rem;
		margin-bottom: 1rem;
	}

	.privacy-card-grid.two-col {
		grid-template-columns: repeat(2, 1fr);
	}

	.privacy-card-grid.three-col {
		grid-template-columns: repeat(3, 1fr);
	}

	/* Privacy Card - Based on theme-option pattern */
	.privacy-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 1rem 0.75rem;
		background: hsl(var(--muted));
		border: 2px solid hsl(var(--border));
		border-radius: var(--radius);
		cursor: pointer;
		transition: all 0.15s ease;
		text-align: center;
		min-height: 110px;
	}

	.privacy-card:hover {
		border-color: hsl(var(--primary) / 0.5);
		background: hsl(var(--muted) / 0.8);
	}

	.privacy-card.selected {
		border-color: hsl(var(--primary));
		background: hsl(var(--primary) / 0.1);
	}

	.privacy-card input[type='radio'] {
		position: absolute;
		opacity: 0;
		pointer-events: none;
	}

	.privacy-card .card-icon {
		font-size: 1.5rem;
		margin-bottom: 0.375rem;
		line-height: 1;
	}

	.privacy-card .card-title {
		font-weight: 600;
		font-size: 0.875rem;
		color: hsl(var(--foreground));
		margin-bottom: 0.25rem;
	}

	.privacy-card .card-desc {
		font-size: 0.7rem;
		color: hsl(var(--muted-foreground));
		line-height: 1.3;
	}

	/* Privacy Subsections */
	.privacy-subsection {
		margin-bottom: 1.5rem;
	}

	.privacy-subsection:last-child {
		margin-bottom: 0;
	}

	.privacy-subsection h3 {
		font-size: 1rem;
		font-weight: 600;
		color: hsl(var(--foreground));
		margin: 0 0 0.375rem;
	}

	/* Privacy Groups */
	.privacy-group {
		margin-bottom: 1.5rem;
	}

	/* User Control Option Box */
	.user-control-option {
		padding: 1rem;
		background: hsl(var(--secondary));
		border-radius: var(--radius);
		border: 1px solid hsl(var(--border));
		margin-top: 1rem;
	}

	/* Sticky/prominent save button */
	.sticky-actions {
		position: sticky;
		bottom: 1rem;
		padding: 1rem;
		background: hsl(var(--card) / 0.95);
		backdrop-filter: blur(8px);
		border-radius: var(--radius);
		border: 1px solid hsl(var(--border));
		margin-top: 1rem;
	}

	.primary-action {
		width: 100%;
		padding: 0.75rem 1.5rem;
		font-size: 1rem;
		font-weight: 600;
	}

	/* Privacy Card Responsive Breakpoints */
	@media (max-width: 768px) {
		.privacy-card-grid,
		.privacy-card-grid.two-col,
		.privacy-card-grid.three-col {
			grid-template-columns: repeat(2, 1fr);
		}

		.privacy-card {
			min-height: 100px;
			padding: 0.75rem 0.5rem;
		}

		.privacy-card .card-icon {
			font-size: 1.25rem;
		}
	}

	@media (max-width: 480px) {
		.privacy-card-grid,
		.privacy-card-grid.two-col,
		.privacy-card-grid.three-col {
			grid-template-columns: 1fr;
		}

		.privacy-card {
			flex-direction: row;
			align-items: flex-start;
			text-align: left;
			min-height: auto;
			gap: 1rem;
		}

		.privacy-card .card-icon {
			flex-shrink: 0;
		}
	}
</style>
