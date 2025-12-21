<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';

	/**
	 * Admin Users Page
	 *
	 * Manages Plex server users:
	 * - View all users with watch time stats
	 * - Configure per-user permissions
	 * - Preview user wrapped pages
	 *
	 * Implements Requirements:
	 * - 11.2: User management with per-user permission settings
	 * - 11.7: Preview user wrapped without affecting settings
	 */

	let { data, form }: { data: PageData; form: ActionData } = $props();

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

	// Format watch time as hours
	function formatWatchTime(minutes: number): string {
		const hours = Math.round(minutes / 60);
		if (hours < 1) return '<1h';
		if (hours >= 24) {
			const days = (hours / 24).toFixed(1);
			return `${days}d`;
		}
		return `${hours}h`;
	}

	// Get share mode display label
	function getShareModeLabel(mode: string | null): string {
		switch (mode) {
			case 'public':
				return 'Public';
			case 'private-oauth':
				return 'OAuth';
			case 'private-link':
				return 'Link';
			default:
				return 'Default';
		}
	}
</script>

<div class="users-page">
	<header class="page-header">
		<h1>User Management</h1>
		<p class="subtitle">Manage server users and permissions for {data.year}</p>
	</header>

	{#if form?.error && !dismissBanner}
		<div class="error-banner" role="alert">
			{form.error}
		</div>
	{/if}

	{#if form?.success && !dismissBanner}
		<div class="success-banner" role="status">
			{form.message ?? 'Operation completed successfully'}
		</div>
	{/if}

	<!-- Global Defaults Section -->
	<section class="section">
		<h2>Global Sharing Defaults</h2>
		<p class="section-description">
			These settings apply to all users who haven't configured their own sharing preferences.
		</p>

		<form method="POST" action="?/updateGlobalDefaults" use:enhance class="defaults-form">
			<div class="form-row">
				<div class="form-group">
					<label for="defaultShareMode">Default Share Mode</label>
					<select id="defaultShareMode" name="defaultShareMode">
						<option value="public" selected={data.globalDefaults.defaultShareMode === 'public'}>
							Public (Anyone can view)
						</option>
						<option
							value="private-oauth"
							selected={data.globalDefaults.defaultShareMode === 'private-oauth'}
						>
							Private OAuth (Server members only)
						</option>
						<option
							value="private-link"
							selected={data.globalDefaults.defaultShareMode === 'private-link'}
						>
							Private Link (Share link required)
						</option>
					</select>
				</div>

				<div class="form-group checkbox-group">
					<label class="checkbox-label">
						<input
							type="checkbox"
							name="allowUserControl"
							value="true"
							checked={data.globalDefaults.allowUserControl}
						/>
						Allow users to control their own sharing settings
					</label>
				</div>
			</div>

			<button type="submit" class="save-button">Save Defaults</button>
		</form>
	</section>

	<!-- Users List Section -->
	<section class="section">
		<div class="section-header">
			<h2>Server Users</h2>
			<span class="user-count">{data.users.length} users</span>
		</div>

		{#if data.users.length === 0}
			<p class="empty-message">No users found. Users will appear after authenticating via Plex.</p>
		{:else}
			<div class="users-table-wrapper">
				<table class="users-table">
					<thead>
						<tr>
							<th>User</th>
							<th>Watch Time</th>
							<th>Share Mode</th>
							<th>Can Control</th>
							<th>Actions</th>
						</tr>
					</thead>
					<tbody>
						{#each data.users as user (user.id)}
							<tr>
								<td>
									<div class="user-cell">
										{#if user.thumb}
											<img src={user.thumb} alt="" class="user-avatar" />
										{:else}
											<span class="user-avatar placeholder">&#9787;</span>
										{/if}
										<div class="user-info">
											<span class="user-name">
												{user.username}
												{#if user.isAdmin}
													<span class="admin-badge">Admin</span>
												{/if}
											</span>
											{#if user.email}
												<span class="user-email">{user.email}</span>
											{/if}
										</div>
									</div>
								</td>
								<td>
									<span class="watch-time">{formatWatchTime(user.totalWatchTimeMinutes)}</span>
								</td>
								<td>
									<span
										class="share-mode"
										class:public={user.shareMode === 'public'}
										class:oauth={user.shareMode === 'private-oauth'}
										class:link={user.shareMode === 'private-link'}
									>
										{getShareModeLabel(user.shareMode)}
									</span>
								</td>
								<td>
									<form
										method="POST"
										action="?/updateUserPermission"
										use:enhance
										class="permission-form"
									>
										<input type="hidden" name="userId" value={user.id} />
										<input
											type="hidden"
											name="canUserControl"
											value={user.canUserControl ? 'false' : 'true'}
										/>
										<button
											type="submit"
											class="toggle-button"
											class:enabled={user.canUserControl}
											title={user.canUserControl
												? 'Click to revoke control'
												: 'Click to grant control'}
										>
											{user.canUserControl ? 'Yes' : 'No'}
										</button>
									</form>
								</td>
								<td>
									<a
										href="/wrapped/{data.year}/u/{user.id}"
										target="_blank"
										rel="noopener noreferrer"
										class="preview-link"
									>
										Preview Wrapped
									</a>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</section>

	<!-- Legend Section -->
	<section class="section legend-section">
		<h3>Legend</h3>
		<div class="legend-grid">
			<div class="legend-item">
				<span class="share-mode public">Public</span>
				<span class="legend-desc">Anyone can view the wrapped page</span>
			</div>
			<div class="legend-item">
				<span class="share-mode oauth">OAuth</span>
				<span class="legend-desc">Only authenticated server members can view</span>
			</div>
			<div class="legend-item">
				<span class="share-mode link">Link</span>
				<span class="legend-desc">Only those with the share link can view</span>
			</div>
			<div class="legend-item">
				<span class="share-mode">Default</span>
				<span class="legend-desc">Uses global default setting</span>
			</div>
		</div>
	</section>
</div>

<style>
	.users-page {
		max-width: 1000px;
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
		margin: 0 0 0.75rem;
	}

	.section-description {
		color: hsl(var(--muted-foreground));
		font-size: 0.875rem;
		margin: 0 0 1rem;
	}

	.section-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1rem;
	}

	.section-header h2 {
		margin: 0;
	}

	.user-count {
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
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

	.form-group select {
		width: 100%;
		padding: 0.5rem 0.75rem;
		background: hsl(var(--input));
		border: 1px solid hsl(var(--border));
		border-radius: var(--radius);
		color: hsl(var(--foreground));
		font-size: 0.875rem;
	}

	.form-row {
		display: flex;
		gap: 1.5rem;
		align-items: flex-start;
	}

	.form-row .form-group {
		flex: 1;
	}

	.checkbox-group {
		display: flex;
		align-items: center;
	}

	.checkbox-label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		cursor: pointer;
		font-size: 0.875rem;
		margin-top: 1.5rem;
	}

	.checkbox-label input {
		width: 1rem;
		height: 1rem;
		accent-color: hsl(var(--primary));
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

	/* Users Table */
	.users-table-wrapper {
		overflow-x: auto;
	}

	.users-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.875rem;
	}

	.users-table th,
	.users-table td {
		padding: 0.75rem;
		text-align: left;
		border-bottom: 1px solid hsl(var(--border));
	}

	.users-table th {
		font-weight: 600;
		color: hsl(var(--muted-foreground));
		font-size: 0.75rem;
		text-transform: uppercase;
	}

	.users-table tbody tr:hover {
		background: hsl(var(--muted) / 0.5);
	}

	.user-cell {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.user-avatar {
		width: 36px;
		height: 36px;
		border-radius: 50%;
		object-fit: cover;
	}

	.user-avatar.placeholder {
		display: flex;
		align-items: center;
		justify-content: center;
		background: hsl(var(--muted));
		color: hsl(var(--muted-foreground));
		font-size: 1.25rem;
	}

	.user-info {
		display: flex;
		flex-direction: column;
	}

	.user-name {
		font-weight: 500;
		color: hsl(var(--foreground));
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.user-email {
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
	}

	.admin-badge {
		display: inline-block;
		padding: 0.125rem 0.375rem;
		background: hsl(var(--primary));
		color: hsl(var(--primary-foreground));
		font-size: 0.625rem;
		font-weight: 600;
		border-radius: 9999px;
		text-transform: uppercase;
	}

	.watch-time {
		font-weight: 600;
		color: hsl(var(--foreground));
	}

	.share-mode {
		display: inline-block;
		padding: 0.25rem 0.5rem;
		border-radius: var(--radius);
		font-size: 0.75rem;
		font-weight: 500;
		background: hsl(var(--muted));
		color: hsl(var(--muted-foreground));
	}

	.share-mode.public {
		background: hsl(120 40% 25%);
		color: hsl(120 60% 90%);
	}

	.share-mode.oauth {
		background: hsl(220 60% 30%);
		color: hsl(220 80% 90%);
	}

	.share-mode.link {
		background: hsl(270 50% 30%);
		color: hsl(270 70% 90%);
	}

	.permission-form {
		margin: 0;
	}

	.toggle-button {
		padding: 0.25rem 0.5rem;
		border: 1px solid hsl(var(--border));
		border-radius: var(--radius);
		font-size: 0.75rem;
		font-weight: 500;
		cursor: pointer;
		background: hsl(var(--muted));
		color: hsl(var(--muted-foreground));
		transition: all 0.15s ease;
	}

	.toggle-button.enabled {
		background: hsl(120 40% 25%);
		color: hsl(120 60% 90%);
		border-color: hsl(120 40% 25%);
	}

	.toggle-button:hover {
		opacity: 0.8;
	}

	.preview-link {
		font-size: 0.75rem;
		color: hsl(var(--primary));
		text-decoration: none;
	}

	.preview-link:hover {
		text-decoration: underline;
	}

	.empty-message {
		color: hsl(var(--muted-foreground));
		text-align: center;
		padding: 2rem;
	}

	/* Legend */
	.legend-section {
		background: hsl(var(--muted) / 0.3);
	}

	.legend-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 0.75rem;
	}

	.legend-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.legend-desc {
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
	}

	/* Responsive */
	@media (max-width: 768px) {
		.users-page {
			padding: 1rem;
		}

		.form-row {
			flex-direction: column;
			gap: 0;
		}

		.checkbox-label {
			margin-top: 0;
		}

		.users-table {
			font-size: 0.75rem;
		}

		.users-table th,
		.users-table td {
			padding: 0.5rem;
		}

		.user-avatar {
			width: 28px;
			height: 28px;
		}
	}
</style>
