<script lang="ts">
import { enhance } from '$app/forms';
import { handleFormToast } from '$lib/utils/form-toast';
import type { ActionData, PageData } from './$types';

/**
 * Admin Users Page
 *
 * Manages Plex server users:
 * - View all users with watch time stats
 * - Configure per-user permissions
 * - Preview user wrapped pages
 */

let { data, form }: { data: PageData; form: ActionData } = $props();

// Show toast notifications for form responses
$effect(() => {
	handleFormToast(form);
});

// Format watch time as hours
function formatWatchTime(minutes: number): string {
	if (minutes === 0) return '0h';
	if (minutes > 0 && minutes < 60) return '<1h';

	const hours = Math.round(minutes / 60);
	if (hours >= 24) {
		const days = (hours / 24).toFixed(1);
		return `${days}d`;
	}
	return `${hours}h`;
}

// Get share mode display label
function getShareModeLabel(mode: string | null, source: string | null): string {
	if (source === 'default') return 'Default';

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
		<div class="page-header-row">
			<div>
				<h1>Users</h1>
				<p class="subtitle">Manage server users for {data.year}</p>
				{#if data.availableYears.length === 0}
					<p class="empty-hint">No watch history yet. Run a sync to populate years.</p>
				{/if}
			</div>
			{#if data.availableYears.length > 0}
				<form method="GET" class="year-form">
					<select
						name="year"
						class="year-selector"
						disabled={data.availableYears.length === 1}
						onchange={(e) => e.currentTarget.form?.requestSubmit()}
					>
						{#each data.availableYears as yr}
							<option value={yr} selected={yr === data.year}>{yr}</option>
						{/each}
					</select>
					<noscript><button type="submit" class="year-submit">Go</button></noscript>
				</form>
			{/if}
		</div>
	</header>

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
											<span class="user-avatar-link" aria-hidden="true">
												{#if user.thumb}
													<img src={user.thumb} alt="" class="user-avatar" />
												{:else}
													<span class="user-avatar placeholder">&#9787;</span>
												{/if}
											</span>
											<div class="user-info">
												{#if user.hasWatchHistory}
													<a href={user.wrappedHref} class="user-name">
														{user.username}
														{#if user.isAdmin}
															<span class="admin-badge">Admin</span>
														{/if}
													</a>
												{:else}
													<span class="user-name">
												{user.username}
												{#if user.isAdmin}
													<span class="admin-badge">Admin</span>
												{/if}
											</span>
												{/if}
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
										class:public={user.shareModeSource !== 'default' && user.shareMode === 'public'}
										class:oauth={user.shareModeSource !== 'default' &&
											user.shareMode === 'private-oauth'}
										class:link={user.shareModeSource !== 'default' &&
											user.shareMode === 'private-link'}
									>
										{getShareModeLabel(user.shareMode, user.shareModeSource)}
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
										<input type="hidden" name="year" value={data.year} />
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
									{#if user.hasWatchHistory}
										<a
											href={user.wrappedHref}
											target="_blank"
											rel="noopener noreferrer"
											class="preview-link"
										>
											Preview Wrapped
										</a>
									{:else}
										<span class="preview-link unavailable">No Wrapped yet</span>
									{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			<div class="mobile-users-list">
				{#each data.users as user (user.id)}
							<div class="mobile-user-row">
							<div class="mobile-user-main">
								<span class="user-avatar-link" aria-hidden="true">
									{#if user.thumb}
										<img src={user.thumb} alt="" class="user-avatar" />
									{:else}
										<span class="user-avatar placeholder">&#9787;</span>
									{/if}
								</span>
								<div class="user-info">
									{#if user.hasWatchHistory}
										<a href={user.wrappedHref} class="user-name">
											{user.username}
											{#if user.isAdmin}
												<span class="admin-badge">Admin</span>
											{/if}
										</a>
									{:else}
										<span class="user-name">
									{user.username}
									{#if user.isAdmin}
										<span class="admin-badge">Admin</span>
									{/if}
								</span>
									{/if}
								{#if user.email}
									<span class="user-email">{user.email}</span>
								{/if}
							</div>
						</div>
						<div class="mobile-user-meta">
							<div class="mobile-meta-item">
								<span class="mobile-meta-label">Watch Time</span>
								<span class="watch-time">{formatWatchTime(user.totalWatchTimeMinutes)}</span>
							</div>
							<div class="mobile-meta-item">
								<span class="mobile-meta-label">Share Mode</span>
								<span
									class="share-mode"
									class:public={user.shareModeSource !== 'default' && user.shareMode === 'public'}
									class:oauth={user.shareModeSource !== 'default' &&
										user.shareMode === 'private-oauth'}
									class:link={user.shareModeSource !== 'default' &&
										user.shareMode === 'private-link'}
								>
									{getShareModeLabel(user.shareMode, user.shareModeSource)}
								</span>
							</div>
							<div class="mobile-meta-item">
								<span class="mobile-meta-label">Can Control</span>
								<form
									method="POST"
									action="?/updateUserPermission"
									use:enhance
									class="permission-form"
								>
									<input type="hidden" name="userId" value={user.id} />
									<input type="hidden" name="year" value={data.year} />
									<input
										type="hidden"
										name="canUserControl"
										value={user.canUserControl ? 'false' : 'true'}
									/>
									<button
										type="submit"
										class="toggle-button"
										class:enabled={user.canUserControl}
										title={user.canUserControl ? 'Click to revoke control' : 'Click to grant control'}
									>
										{user.canUserControl ? 'Yes' : 'No'}
									</button>
								</form>
							</div>
						</div>
						{#if user.hasWatchHistory}
							<a
								href={user.wrappedHref}
								target="_blank"
								rel="noopener noreferrer"
								class="preview-link mobile-preview-link"
							>
								Preview Wrapped
							</a>
						{:else}
							<span class="preview-link unavailable mobile-preview-link">No Wrapped yet</span>
						{/if}
					</div>
				{/each}
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
			min-width: 0;
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

		.empty-hint {
			color: hsl(var(--muted-foreground));
			font-size: 0.875rem;
			margin: 0.5rem 0 0;
		}

		.page-header-row {
			display: flex;
			justify-content: space-between;
			align-items: flex-start;
			gap: 1rem;
		}

		.year-form {
			display: contents;
		}

		.year-selector {
			padding: 0.5rem 0.75rem;
			background: hsl(var(--input));
			border: 1px solid hsl(var(--border));
			border-radius: var(--radius);
			color: hsl(var(--foreground));
			font-size: 0.875rem;
			cursor: pointer;
		}

		.year-selector:focus {
			outline: none;
			border-color: hsl(var(--ring));
			box-shadow: 0 0 0 2px hsl(var(--ring) / 0.2);
		}

		.year-selector:disabled {
			cursor: default;
			opacity: 0.75;
		}

		.section {
			background: hsl(var(--card));
			border: 1px solid hsl(var(--border));
			border-radius: var(--radius);
			padding: 1.5rem;
			margin-bottom: 1.5rem;
			min-width: 0;
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

		/* Users Table */
		.users-table-wrapper {
			overflow-x: auto;
			width: 100%;
			max-width: 100%;
			min-width: 0;
			-webkit-overflow-scrolling: touch;
		}

		.users-table {
			width: 100%;
			min-width: 600px;
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

			.user-avatar-link,
			.user-name {
				text-decoration: none;
			}

			.user-avatar-link {
				display: inline-flex;
				flex: 0 0 auto;
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
			min-width: 0;
		}

		.user-name {
			font-weight: 500;
			color: hsl(var(--foreground));
			display: flex;
			align-items: center;
			gap: 0.5rem;
		}

		.user-name[href]:hover {
			color: hsl(var(--primary));
		}

		.user-email {
			font-size: 0.75rem;
			color: hsl(var(--muted-foreground));
			overflow-wrap: anywhere;
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

		.preview-link.unavailable {
			color: hsl(var(--muted-foreground));
			cursor: default;
		}

		.preview-link.unavailable:hover {
			text-decoration: none;
		}

		.mobile-users-list {
			display: none;
		}

		.mobile-user-row {
			display: flex;
			flex-direction: column;
			gap: 0.875rem;
			padding: 1rem 0;
			border-bottom: 1px solid hsl(var(--border));
			min-width: 0;
		}

		.mobile-user-row:first-child {
			padding-top: 0;
		}

		.mobile-user-row:last-child {
			padding-bottom: 0;
			border-bottom: 0;
		}

		.mobile-user-main {
			display: flex;
			align-items: center;
			gap: 0.75rem;
			min-width: 0;
		}

		.mobile-user-main .user-info {
			flex: 1;
		}

		.mobile-user-meta {
			display: grid;
			grid-template-columns: repeat(3, minmax(0, 1fr));
			gap: 0.75rem;
			align-items: start;
		}

		.mobile-meta-item {
			display: flex;
			flex-direction: column;
			gap: 0.35rem;
			min-width: 0;
		}

		.mobile-meta-label {
			color: hsl(var(--muted-foreground));
			font-size: 0.6875rem;
			font-weight: 600;
			text-transform: uppercase;
		}

		.mobile-preview-link {
			align-self: flex-start;
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

			.page-header-row {
				flex-direction: column;
				align-items: stretch;
			}

			.section {
				padding: 1rem;
			}

			.users-table-wrapper {
				display: none;
			}

			.mobile-users-list {
				display: block;
			}

			.user-avatar {
				width: 32px;
				height: 32px;
			}

			.user-name {
				max-width: 100%;
				overflow-wrap: anywhere;
			}

			.legend-item {
				align-items: flex-start;
			}
		}

		@media (max-width: 430px) {
			.mobile-user-meta {
				grid-template-columns: 1fr;
			}
		}
</style>
