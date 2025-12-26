<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/stores';
	import * as Tabs from '$lib/components/ui/tabs';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { handleFormToast } from '$lib/utils/form-toast';
	import type { PageData, ActionData } from './$types';

	/**
	 * User Settings Page
	 *
	 * Personal settings management for non-admin users:
	 * - Privacy: Share mode controls (when permitted)
	 * - Display: Logo visibility preferences
	 * - Account: Read-only profile information
	 */

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// Tab state
	const validTabs = ['privacy', 'display', 'account'] as const;
	type TabValue = (typeof validTabs)[number];

	function getInitialTab(): TabValue {
		if (typeof window === 'undefined') return 'privacy';
		const urlTab = $page.url.searchParams.get('tab');
		if (urlTab && validTabs.includes(urlTab as TabValue)) {
			return urlTab as TabValue;
		}
		return 'privacy';
	}

	let activeTab = $state<TabValue>(getInitialTab());

	// Form state
	let selectedShareMode = $state(data.shareSettings.mode);
	let selectedLogoPreference = $state<'show' | 'hide'>(
		data.userLogoPreference === false ? 'hide' : 'show'
	);
	let isUpdating = $state(false);
	let isRegenerating = $state(false);

	// Copy state
	let copied = $state(false);
	let copyTimeout: ReturnType<typeof setTimeout> | null = null;

	// Regenerate token dialog
	let regenerateDialogOpen = $state(false);

	// Sync state with data on refresh
	$effect(() => {
		selectedShareMode = data.shareSettings.mode;
		selectedLogoPreference = data.userLogoPreference === false ? 'hide' : 'show';
	});

	// Show toast notifications
	$effect(() => {
		handleFormToast(form);
	});

	// Icon helpers
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

	// Share mode descriptions
	const shareModeDescriptions: Record<string, string> = {
		public: 'Anyone can view your wrapped page',
		'private-oauth': 'Only Plex server members can view',
		'private-link': 'Anyone with the special link can view'
	};

	// Generate share URL
	function getShareUrl(): string {
		const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
		if (data.shareSettings.mode === 'private-link' && data.shareSettings.shareToken) {
			return `${baseUrl}/wrapped/${data.currentYear}/u/${data.user.id}?token=${data.shareSettings.shareToken}`;
		}
		return `${baseUrl}/wrapped/${data.currentYear}/u/${data.user.id}`;
	}

	// Copy to clipboard
	async function copyShareUrl() {
		try {
			await navigator.clipboard.writeText(getShareUrl());
			copied = true;

			if (copyTimeout) clearTimeout(copyTimeout);
			copyTimeout = setTimeout(() => {
				copied = false;
			}, 2000);
		} catch (err) {
			console.error('Failed to copy:', err);
		}
	}

	// Format date helper
	function formatDate(date: Date | null): string {
		if (!date) return 'Unknown';
		return new Intl.DateTimeFormat('en-US', {
			dateStyle: 'medium',
			timeStyle: 'short'
		}).format(new Date(date));
	}

	// Format relative date
	function formatRelativeDate(date: Date | null): string {
		if (!date) return 'Unknown';
		const now = new Date();
		const target = new Date(date);
		const diffDays = Math.floor((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

		if (diffDays < 0) return 'Expired';
		if (diffDays === 0) return 'Today';
		if (diffDays === 1) return 'Tomorrow';
		if (diffDays < 7) return `In ${diffDays} days`;
		return formatDate(date);
	}

	// Logo mode display text
	function getLogoModeDescription(): string {
		switch (data.wrappedLogoMode) {
			case 'always_show':
				return 'The logo is always shown on all wrapped pages (set by admin)';
			case 'always_hide':
				return 'The logo is always hidden on all wrapped pages (set by admin)';
			default:
				return '';
		}
	}
</script>

<svelte:head>
	<title>Settings - Obzorarr</title>
</svelte:head>

<div class="settings-page">
	<header class="page-header">
		<h1>Settings</h1>
		<p class="subtitle">Manage your personal preferences</p>
	</header>

	<Tabs.Root bind:value={activeTab} class="settings-tabs">
		<Tabs.List class="tabs-list">
			<Tabs.Trigger value="privacy">Privacy</Tabs.Trigger>
			<Tabs.Trigger value="display">Display</Tabs.Trigger>
			<Tabs.Trigger value="account">Account</Tabs.Trigger>
		</Tabs.List>

		<!-- Privacy Tab -->
		<Tabs.Content value="privacy">
			<section class="section">
				<h2>Sharing Settings</h2>
				<p class="section-description">
					Control who can view your {data.currentYear} Wrapped page.
				</p>

				{#if data.shareSettings.canUserControl}
					<!-- User has control -->
					<form
						method="POST"
						action="?/updateShareMode"
						use:enhance={() => {
							isUpdating = true;
							return async ({ update }) => {
								await update();
								isUpdating = false;
							};
						}}
						class="share-form"
					>
						<div class="privacy-card-grid three-col">
							<label class="privacy-card" class:selected={selectedShareMode === 'public'}>
								<input
									type="radio"
									name="mode"
									value="public"
									bind:group={selectedShareMode}
									disabled={isUpdating}
								/>
								<span class="card-icon">{getShareIcon('public')}</span>
								<span class="card-title">Public</span>
								<span class="card-desc">{shareModeDescriptions['public']}</span>
							</label>

							<label class="privacy-card" class:selected={selectedShareMode === 'private-link'}>
								<input
									type="radio"
									name="mode"
									value="private-link"
									bind:group={selectedShareMode}
									disabled={isUpdating}
								/>
								<span class="card-icon">{getShareIcon('private-link')}</span>
								<span class="card-title">Private Link</span>
								<span class="card-desc">{shareModeDescriptions['private-link']}</span>
							</label>

							<label class="privacy-card" class:selected={selectedShareMode === 'private-oauth'}>
								<input
									type="radio"
									name="mode"
									value="private-oauth"
									bind:group={selectedShareMode}
									disabled={isUpdating}
								/>
								<span class="card-icon">{getShareIcon('private-oauth')}</span>
								<span class="card-title">Server Members</span>
								<span class="card-desc">{shareModeDescriptions['private-oauth']}</span>
							</label>
						</div>

						<div class="form-actions">
							<button type="submit" class="save-button" disabled={isUpdating}>
								{isUpdating ? 'Saving...' : 'Save Sharing Settings'}
							</button>
						</div>
					</form>

					<!-- Share URL Section -->
					<div class="share-url-section">
						<h3>Your Wrapped URL</h3>
						<div class="url-container">
							<input type="text" readonly value={getShareUrl()} class="url-input" />
							<button type="button" class="copy-button" class:copied onclick={copyShareUrl}>
								{#if copied}
									<svg
										xmlns="http://www.w3.org/2000/svg"
										width="18"
										height="18"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
									>
										<polyline points="20 6 9 17 4 12" />
									</svg>
									Copied!
								{:else}
									<svg
										xmlns="http://www.w3.org/2000/svg"
										width="18"
										height="18"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
									>
										<rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
										<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
									</svg>
									Copy
								{/if}
							</button>
						</div>

						{#if data.shareSettings.mode === 'private-link'}
							<div class="token-actions">
								<p class="token-hint">
									This link contains a private token. Only people with this exact link can view your
									wrapped page.
								</p>
								<button
									type="button"
									class="regenerate-button"
									onclick={() => (regenerateDialogOpen = true)}
								>
									🔄 Regenerate Link
								</button>
							</div>
						{/if}
					</div>
				{:else}
					<!-- User doesn't have control -->
					<div class="info-banner">
						<span class="info-icon">ℹ️</span>
						<div class="info-content">
							<strong>Sharing settings are managed by your server administrator</strong>
							<p>
								Your current sharing mode is: <span class="mode-badge"
									>{getShareIcon(data.shareSettings.mode)}
									{data.shareSettings.mode === 'private-oauth'
										? 'Server Members Only'
										: data.shareSettings.mode === 'private-link'
											? 'Private Link'
											: 'Public'}</span
								>
							</p>
						</div>
					</div>

					<!-- Still show share URL for copying -->
					<div class="share-url-section readonly">
						<h3>Your Wrapped URL</h3>
						<div class="url-container">
							<input type="text" readonly value={getShareUrl()} class="url-input" />
							<button type="button" class="copy-button" class:copied onclick={copyShareUrl}>
								{#if copied}
									<svg
										xmlns="http://www.w3.org/2000/svg"
										width="18"
										height="18"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
									>
										<polyline points="20 6 9 17 4 12" />
									</svg>
									Copied!
								{:else}
									<svg
										xmlns="http://www.w3.org/2000/svg"
										width="18"
										height="18"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
									>
										<rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
										<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
									</svg>
									Copy
								{/if}
							</button>
						</div>
					</div>
				{/if}
			</section>
		</Tabs.Content>

		<!-- Display Tab -->
		<Tabs.Content value="display">
			<section class="section">
				<h2>Logo Visibility</h2>
				<p class="section-description">
					Control whether the Obzorarr logo appears on your wrapped page.
				</p>

				{#if data.canControlLogo}
					<!-- User can control logo -->
					<form
						method="POST"
						action="?/updateLogoPreference"
						use:enhance={() => {
							isUpdating = true;
							return async ({ update }) => {
								await update();
								isUpdating = false;
							};
						}}
						class="logo-form"
					>
						<div class="privacy-card-grid two-col">
							<label class="privacy-card" class:selected={selectedLogoPreference === 'show'}>
								<input
									type="radio"
									name="logoPreference"
									value="show"
									bind:group={selectedLogoPreference}
									disabled={isUpdating}
								/>
								<span class="card-icon">✅</span>
								<span class="card-title">Show Logo</span>
								<span class="card-desc">Display the Obzorarr logo on your wrapped page</span>
							</label>

							<label class="privacy-card" class:selected={selectedLogoPreference === 'hide'}>
								<input
									type="radio"
									name="logoPreference"
									value="hide"
									bind:group={selectedLogoPreference}
									disabled={isUpdating}
								/>
								<span class="card-icon">🚫</span>
								<span class="card-title">Hide Logo</span>
								<span class="card-desc">Hide the logo for a cleaner presentation</span>
							</label>
						</div>

						<div class="form-actions">
							<button type="submit" class="save-button" disabled={isUpdating}>
								{isUpdating ? 'Saving...' : 'Save Display Settings'}
							</button>
						</div>
					</form>
				{:else}
					<!-- User doesn't have control -->
					<div class="info-banner">
						<span class="info-icon">ℹ️</span>
						<div class="info-content">
							<strong>Logo visibility is managed by your server administrator</strong>
							<p>{getLogoModeDescription()}</p>
						</div>
					</div>
				{/if}
			</section>
		</Tabs.Content>

		<!-- Account Tab -->
		<Tabs.Content value="account">
			<section class="section">
				<h2>Profile Information</h2>
				<p class="section-description">Your account details from Plex.</p>

				<div class="profile-card">
					<div class="profile-header">
						{#if data.user.thumb}
							<img src={data.user.thumb} alt="Profile" class="profile-avatar" />
						{:else}
							<div class="profile-avatar-placeholder">
								<span>{data.user.username.charAt(0).toUpperCase()}</span>
							</div>
						{/if}
						<div class="profile-info">
							<h3 class="profile-name">{data.user.username}</h3>
							{#if data.user.email}
								<p class="profile-email">{data.user.email}</p>
							{/if}
						</div>
					</div>

					<div class="profile-details">
						<div class="detail-row">
							<span class="detail-label">Member Since</span>
							<span class="detail-value">
								{data.user.createdAt ? formatDate(data.user.createdAt) : 'Unknown'}
							</span>
						</div>

						<div class="detail-row">
							<span class="detail-label">Session Expires</span>
							<span class="detail-value session-expiry">
								{formatRelativeDate(data.sessionExpiresAt)}
							</span>
						</div>

						<div class="detail-row">
							<span class="detail-label">User ID</span>
							<span class="detail-value mono">{data.user.id}</span>
						</div>
					</div>
				</div>

				<div class="account-actions">
					<a href="/wrapped/{data.currentYear}/u/{data.user.id}" class="view-wrapped-link">
						View My {data.currentYear} Wrapped →
					</a>
				</div>
			</section>
		</Tabs.Content>
	</Tabs.Root>

	<!-- Regenerate Token Confirmation Dialog -->
	<AlertDialog.Root bind:open={regenerateDialogOpen}>
		<AlertDialog.Content>
			<AlertDialog.Header>
				<AlertDialog.Title>Regenerate Share Link?</AlertDialog.Title>
				<AlertDialog.Description>
					This will create a new private link and invalidate the current one. Anyone using the old
					link will no longer have access to your wrapped page.
				</AlertDialog.Description>
			</AlertDialog.Header>
			<AlertDialog.Footer>
				<AlertDialog.Cancel disabled={isRegenerating}>Cancel</AlertDialog.Cancel>
				<form
					method="POST"
					action="?/regenerateToken"
					use:enhance={() => {
						isRegenerating = true;
						return async ({ update }) => {
							await update();
							isRegenerating = false;
							regenerateDialogOpen = false;
						};
					}}
					style="display: contents;"
				>
					<AlertDialog.Action type="submit" disabled={isRegenerating}>
						{#if isRegenerating}
							Regenerating...
						{:else}
							Regenerate Link
						{/if}
					</AlertDialog.Action>
				</form>
			</AlertDialog.Footer>
		</AlertDialog.Content>
	</AlertDialog.Root>
</div>

<style>
	.settings-page {
		max-width: 700px;
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
	}

	:global(.tabs-list button) {
		padding: 0.75rem 1.25rem;
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

	/* Section Styling */
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
		font-size: 0.95rem;
		font-weight: 600;
		color: hsl(var(--foreground));
		margin: 1.5rem 0 0.75rem;
	}

	.section-description {
		color: hsl(var(--muted-foreground));
		font-size: 0.875rem;
		margin: 0 0 1.25rem;
	}

	/* Privacy Card Grid */
	.privacy-card-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
		gap: 0.75rem;
		margin-bottom: 1rem;
	}

	.privacy-card-grid.two-col {
		grid-template-columns: repeat(2, 1fr);
	}

	.privacy-card-grid.three-col {
		grid-template-columns: repeat(3, 1fr);
	}

	.privacy-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 1rem 0.75rem;
		background: hsl(var(--muted));
		border: 2px solid hsl(var(--border));
		border-radius: var(--radius);
		cursor: pointer;
		transition: all 0.15s ease;
		text-align: center;
		min-height: 120px;
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
		margin-bottom: 0.5rem;
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
		line-height: 1.4;
	}

	/* Form Actions */
	.form-actions {
		margin-top: 1.25rem;
	}

	.save-button {
		padding: 0.625rem 1.25rem;
		background: hsl(var(--primary));
		color: hsl(var(--primary-foreground));
		border: none;
		border-radius: var(--radius);
		font-weight: 500;
		font-size: 0.875rem;
		cursor: pointer;
		transition: opacity 0.15s ease;
	}

	.save-button:hover:not(:disabled) {
		opacity: 0.9;
	}

	.save-button:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	/* Share URL Section */
	.share-url-section {
		margin-top: 1.5rem;
		padding-top: 1.5rem;
		border-top: 1px solid hsl(var(--border));
	}

	.share-url-section.readonly {
		margin-top: 1.25rem;
	}

	.url-container {
		display: flex;
		gap: 0.5rem;
	}

	.url-input {
		flex: 1;
		padding: 0.625rem 0.875rem;
		background: hsl(var(--muted));
		border: 1px solid hsl(var(--border));
		border-radius: var(--radius);
		color: hsl(var(--foreground));
		font-size: 0.8rem;
		font-family: monospace;
	}

	.copy-button {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.625rem 1rem;
		background: hsl(var(--secondary));
		color: hsl(var(--foreground));
		border: 1px solid hsl(var(--border));
		border-radius: var(--radius);
		font-size: 0.8rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s ease;
		white-space: nowrap;
	}

	.copy-button:hover {
		background: hsl(var(--muted));
	}

	.copy-button.copied {
		background: hsl(140 60% 40%);
		color: white;
		border-color: hsl(140 60% 40%);
	}

	/* Token Actions */
	.token-actions {
		margin-top: 1rem;
	}

	.token-hint {
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
		margin: 0 0 0.75rem;
	}

	.regenerate-button {
		padding: 0.5rem 0.875rem;
		background: hsl(var(--secondary));
		color: hsl(var(--foreground));
		border: 1px solid hsl(var(--border));
		border-radius: var(--radius);
		font-size: 0.8rem;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.regenerate-button:hover {
		background: hsl(var(--destructive));
		color: hsl(var(--destructive-foreground));
		border-color: hsl(var(--destructive));
	}

	/* Info Banner */
	.info-banner {
		display: flex;
		gap: 1rem;
		padding: 1rem 1.25rem;
		background: hsl(210 60% 50% / 0.1);
		border: 1px solid hsl(210 60% 50% / 0.25);
		border-radius: var(--radius);
		margin-bottom: 1rem;
	}

	.info-icon {
		font-size: 1.25rem;
		flex-shrink: 0;
	}

	.info-content {
		flex: 1;
	}

	.info-content strong {
		display: block;
		font-size: 0.875rem;
		color: hsl(var(--foreground));
		margin-bottom: 0.25rem;
	}

	.info-content p {
		font-size: 0.8rem;
		color: hsl(var(--muted-foreground));
		margin: 0;
	}

	.mode-badge {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.125rem 0.5rem;
		background: hsl(var(--muted));
		border-radius: calc(var(--radius) / 2);
		font-weight: 500;
	}

	/* Profile Card */
	.profile-card {
		background: hsl(var(--muted));
		border-radius: var(--radius);
		overflow: hidden;
	}

	.profile-header {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 1.25rem;
		background: linear-gradient(
			135deg,
			hsl(var(--primary) / 0.15) 0%,
			hsl(var(--primary) / 0.05) 100%
		);
		border-bottom: 1px solid hsl(var(--border));
	}

	.profile-avatar {
		width: 64px;
		height: 64px;
		border-radius: 50%;
		object-fit: cover;
		border: 3px solid hsl(var(--primary));
	}

	.profile-avatar-placeholder {
		width: 64px;
		height: 64px;
		border-radius: 50%;
		background: hsl(var(--primary));
		display: flex;
		align-items: center;
		justify-content: center;
		border: 3px solid hsl(var(--primary) / 0.5);
	}

	.profile-avatar-placeholder span {
		font-size: 1.75rem;
		font-weight: 700;
		color: hsl(var(--primary-foreground));
	}

	.profile-info {
		flex: 1;
	}

	.profile-name {
		font-size: 1.25rem;
		font-weight: 600;
		color: hsl(var(--foreground));
		margin: 0 0 0.25rem;
	}

	.profile-email {
		font-size: 0.875rem;
		color: hsl(var(--muted-foreground));
		margin: 0;
	}

	.profile-details {
		padding: 1rem 1.25rem;
	}

	.detail-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.625rem 0;
		border-bottom: 1px solid hsl(var(--border) / 0.5);
	}

	.detail-row:last-child {
		border-bottom: none;
	}

	.detail-label {
		font-size: 0.8rem;
		color: hsl(var(--muted-foreground));
	}

	.detail-value {
		font-size: 0.875rem;
		font-weight: 500;
		color: hsl(var(--foreground));
	}

	.detail-value.mono {
		font-family: monospace;
		font-size: 0.8rem;
	}

	.session-expiry {
		padding: 0.25rem 0.5rem;
		background: hsl(var(--primary) / 0.15);
		border-radius: calc(var(--radius) / 2);
		font-size: 0.8rem;
	}

	/* Account Actions */
	.account-actions {
		margin-top: 1.5rem;
	}

	.view-wrapped-link {
		display: inline-flex;
		align-items: center;
		padding: 0.75rem 1.25rem;
		background: hsl(var(--primary));
		color: hsl(var(--primary-foreground));
		border-radius: var(--radius);
		font-weight: 500;
		font-size: 0.875rem;
		text-decoration: none;
		transition: opacity 0.15s ease;
	}

	.view-wrapped-link:hover {
		opacity: 0.9;
	}

	/* Responsive */
	@media (max-width: 640px) {
		.settings-page {
			padding: 1.25rem;
		}

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
			padding: 1rem;
			gap: 0.875rem;
		}

		.privacy-card .card-icon {
			flex-shrink: 0;
			margin-bottom: 0;
		}

		.privacy-card .card-title,
		.privacy-card .card-desc {
			text-align: left;
		}

		.url-container {
			flex-direction: column;
		}

		.profile-header {
			flex-direction: column;
			text-align: center;
		}

		.detail-row {
			flex-direction: column;
			align-items: flex-start;
			gap: 0.25rem;
		}
	}
</style>
