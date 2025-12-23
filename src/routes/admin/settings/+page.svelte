<script lang="ts">
	import { enhance, deserialize } from '$app/forms';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
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

	// Auto-dismiss state for success/error banners
	let dismissBanner = $state(false);

	// Auto-dismiss banners after 4 seconds when form result changes
	$effect(() => {
		if (form?.success || form?.error) {
			dismissBanner = false;
			const timeout = setTimeout(() => {
				dismissBanner = true;
			}, 4000);
			return () => clearTimeout(timeout);
		}
	});

	// Cache clearing dialog state
	let cacheDialogOpen = $state(false);
	let pendingCacheYear = $state<number | undefined>(undefined);
	let pendingCacheCount = $state(0);
	let loadingCount = $state(false);

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
</script>

<div class="settings-page">
	<header class="page-header">
		<h1>Settings</h1>
		<p class="subtitle">Configure application settings</p>
	</header>

	{#if form?.error && !dismissBanner}
		<div class="error-banner" role="alert">
			{form.error}
		</div>
	{/if}

	{#if form?.success && !dismissBanner}
		<div class="success-banner" role="status">
			{form.message ?? 'Settings updated successfully'}
		</div>
	{/if}

	<!-- API Configuration Section -->
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

	<!-- UI Theme Section -->
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

	<!-- Anonymization Section -->
	<section class="section">
		<h2>Privacy & Anonymization</h2>
		<p class="section-description">Control how usernames appear in server-wide statistics.</p>

		<form method="POST" action="?/updateAnonymization" use:enhance class="anonymization-form">
			<div class="anonymization-options">
				{#each data.anonymizationOptions as option}
					<label
						class="anonymization-option"
						class:selected={selectedAnonymization === option.value}
					>
						<input
							type="radio"
							name="anonymizationMode"
							value={option.value}
							bind:group={selectedAnonymization}
						/>
						<div class="option-content">
							<span class="option-label">{option.label}</span>
							<span class="option-desc">{anonymizationDescriptions[option.value]}</span>
						</div>
					</label>
				{/each}
			</div>

			<div class="form-actions">
				<button type="submit" class="save-button">Save Privacy Settings</button>
			</div>
		</form>
	</section>

	<!-- Wrapped Page Logo Section -->
	<section class="section">
		<h2>Wrapped Page Logo</h2>
		<p class="section-description">Control logo visibility on wrapped pages.</p>

		<form method="POST" action="?/updateWrappedLogoMode" use:enhance class="logo-mode-form">
			<div class="anonymization-options">
				{#each data.wrappedLogoOptions as option}
					<label
						class="anonymization-option"
						class:selected={selectedWrappedLogoMode === option.value}
					>
						<input
							type="radio"
							name="logoMode"
							value={option.value}
							bind:group={selectedWrappedLogoMode}
						/>
						<div class="option-content">
							<span class="option-label">{option.label}</span>
							<span class="option-desc">{wrappedLogoDescriptions[option.value]}</span>
						</div>
					</label>
				{/each}
			</div>

			<div class="form-actions">
				<button type="submit" class="save-button">Save Logo Settings</button>
			</div>
		</form>
	</section>

	<!-- Year/Archive Section -->
	<section class="section">
		<h2>Year & Archive</h2>
		<p class="section-description">Manage available years and clear cached statistics.</p>

		<div class="years-info">
			<p><strong>Available Years:</strong> {data.availableYears.join(', ') || 'None'}</p>
			<p class="info-hint">Years are automatically detected from play history data.</p>
		</div>

		<h3>Clear Statistics Cache</h3>
		<p class="subsection-description">Force recalculation of statistics by clearing the cache.</p>

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

	<!-- Cache Clearing Confirmation Dialog -->
	<AlertDialog.Root bind:open={cacheDialogOpen}>
		<AlertDialog.Content>
			<AlertDialog.Title>
				{pendingCacheYear !== undefined ? `Clear ${pendingCacheYear} Cache?` : 'Clear All Cache?'}
			</AlertDialog.Title>
			<AlertDialog.Description>
				{getCacheConfirmationMessage()}
				<br /><br />
				Statistics will be recalculated on next access. This action cannot be undone.
			</AlertDialog.Description>
			<div class="dialog-actions">
				<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
				<form
					method="POST"
					action="?/clearCache"
					use:enhance={() => {
						return async ({ update }) => {
							await update();
							handleCacheCleared();
						};
					}}
					style="display: inline;"
				>
					{#if pendingCacheYear !== undefined}
						<input type="hidden" name="year" value={pendingCacheYear} />
					{/if}
					<AlertDialog.Action type="submit">
						Delete {pendingCacheCount} Record{pendingCacheCount !== 1 ? 's' : ''}
					</AlertDialog.Action>
				</form>
			</div>
		</AlertDialog.Content>
	</AlertDialog.Root>

	<!-- Logging Section -->
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
					<span class="form-hint">Logs older than this will be automatically deleted (1-365)</span>
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
					When enabled, detailed debug logs will be recorded. This may generate a large volume of
					logs.
				</span>
			</div>

			<input type="hidden" name="debugEnabled" value={logDebugEnabled.toString()} />

			<div class="form-actions">
				<button type="submit" class="save-button">Save Logging Settings</button>
			</div>
		</form>
	</section>
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

	.error-banner {
		background: hsl(var(--destructive));
		color: hsl(var(--destructive-foreground));
		padding: 1rem;
		border-radius: var(--radius);
		margin-bottom: 1.5rem;
	}

	.success-banner {
		background: hsl(120 40% 30%);
		color: white;
		padding: 1rem;
		border-radius: var(--radius);
		margin-bottom: 1.5rem;
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

	/* Anonymization Options */
	.anonymization-options {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		margin-bottom: 1rem;
	}

	.anonymization-option {
		display: flex;
		align-items: flex-start;
		gap: 0.75rem;
		padding: 1rem;
		background: hsl(var(--muted));
		border: 2px solid hsl(var(--border));
		border-radius: var(--radius);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.anonymization-option:hover {
		border-color: hsl(var(--primary) / 0.5);
	}

	.anonymization-option.selected {
		border-color: hsl(var(--primary));
		background: hsl(var(--primary) / 0.1);
	}

	.anonymization-option input {
		margin-top: 0.25rem;
		accent-color: hsl(var(--primary));
	}

	.option-content {
		display: flex;
		flex-direction: column;
	}

	.option-label {
		font-weight: 600;
		color: hsl(var(--foreground));
		margin-bottom: 0.25rem;
	}

	.option-desc {
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
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

	/* Dialog Actions */
	.dialog-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
		margin-top: 1.5rem;
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
</style>
