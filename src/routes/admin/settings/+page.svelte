<script lang="ts">
	import { enhance } from '$app/forms';
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
	let showPlexToken = $state(false);
	let showOpenaiKey = $state(false);
	let selectedTheme = $state('');
	let selectedAnonymization = $state('');
	let isTesting = $state(false);

	// Sync local state with data (initial load and after form submission)
	$effect(() => {
		plexServerUrl = data.settings.plexServerUrl;
		plexToken = data.settings.plexToken;
		openaiApiKey = data.settings.openaiApiKey;
		openaiBaseUrl = data.settings.openaiBaseUrl;
		selectedTheme = data.currentTheme;
		selectedAnonymization = data.anonymizationMode;
	});

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
</script>

<div class="settings-page">
	<header class="page-header">
		<h1>Settings</h1>
		<p class="subtitle">Configure application settings</p>
	</header>

	{#if form?.error}
		<div class="error-banner" role="alert">
			{form.error}
		</div>
	{/if}

	{#if form?.success}
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
				<label for="plexServerUrl">Plex Server URL</label>
				<input
					type="url"
					id="plexServerUrl"
					name="plexServerUrl"
					bind:value={plexServerUrl}
					placeholder="http://192.168.1.100:32400"
				/>
				<span class="form-hint">The URL of your Plex Media Server</span>
			</div>

			<div class="form-group">
				<label for="plexToken">Plex Token</label>
				<div class="password-input">
					<input
						type={showPlexToken ? 'text' : 'password'}
						id="plexToken"
						name="plexToken"
						bind:value={plexToken}
						placeholder="Enter Plex token"
					/>
					<button type="button" class="toggle-visibility" onclick={() => (showPlexToken = !showPlexToken)}>
						{showPlexToken ? 'Hide' : 'Show'}
					</button>
				</div>
				<span class="form-hint">Your X-Plex-Token for authentication</span>
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
			<button type="submit" class="test-button" disabled={isTesting || !plexServerUrl || !plexToken}>
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
				<label for="openaiApiKey">OpenAI API Key</label>
				<div class="password-input">
					<input
						type={showOpenaiKey ? 'text' : 'password'}
						id="openaiApiKey"
						name="openaiApiKey"
						bind:value={openaiApiKey}
						placeholder="sk-..."
					/>
					<button type="button" class="toggle-visibility" onclick={() => (showOpenaiKey = !showOpenaiKey)}>
						{showOpenaiKey ? 'Hide' : 'Show'}
					</button>
				</div>
			</div>

			<div class="form-group">
				<label for="openaiBaseUrl">OpenAI Base URL (Optional)</label>
				<input
					type="url"
					id="openaiBaseUrl"
					name="openaiBaseUrl"
					bind:value={openaiBaseUrl}
					placeholder="https://api.openai.com/v1"
				/>
				<span class="form-hint">For custom OpenAI-compatible endpoints</span>
			</div>

			<div class="form-actions">
				<button type="submit" class="save-button">Save OpenAI Settings</button>
			</div>
		</form>
	</section>

	<!-- Theme Section -->
	<section class="section">
		<h2>Theme</h2>
		<p class="section-description">
			Select a color theme for all wrapped pages.
		</p>

		<form method="POST" action="?/updateTheme" use:enhance class="theme-form">
			<div class="theme-options">
				{#each data.themeOptions as theme}
					<label class="theme-option" class:selected={selectedTheme === theme.value}>
						<input
							type="radio"
							name="theme"
							value={theme.value}
							bind:group={selectedTheme}
						/>
						<span class="theme-preview {theme.value}"></span>
						<span class="theme-label">{themeLabels[theme.value] ?? theme.label}</span>
					</label>
				{/each}
			</div>

			<div class="form-actions">
				<button type="submit" class="save-button">Save Theme</button>
			</div>
		</form>
	</section>

	<!-- Anonymization Section -->
	<section class="section">
		<h2>Privacy & Anonymization</h2>
		<p class="section-description">
			Control how usernames appear in server-wide statistics.
		</p>

		<form method="POST" action="?/updateAnonymization" use:enhance class="anonymization-form">
			<div class="anonymization-options">
				{#each data.anonymizationOptions as option}
					<label class="anonymization-option" class:selected={selectedAnonymization === option.value}>
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

	<!-- Year/Archive Section -->
	<section class="section">
		<h2>Year & Archive</h2>
		<p class="section-description">
			Manage available years and clear cached statistics.
		</p>

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
				<form method="POST" action="?/clearCache" use:enhance class="cache-form">
					<input type="hidden" name="year" value={year} />
					<button type="submit" class="cache-button">Clear {year} Cache</button>
				</form>
			{/each}

			<form method="POST" action="?/clearCache" use:enhance class="cache-form">
				<button type="submit" class="cache-button all">Clear All Cache</button>
			</form>
		</div>
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

	/* Responsive */
	@media (max-width: 640px) {
		.settings-page {
			padding: 1rem;
		}

		.theme-options {
			grid-template-columns: repeat(2, 1fr);
		}
	}
</style>
