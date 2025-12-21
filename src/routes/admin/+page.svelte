<script lang="ts">
	import type { PageData } from './$types';

	/**
	 * Admin Dashboard
	 *
	 * Displays server overview with:
	 * - Total users and watch time stats
	 * - Sync status and schedule
	 * - Quick action links
	 *
	 * Implements Requirements:
	 * - 11.1: Dashboard with server overview, total users, total watch time, sync status
	 */

	let { data }: { data: PageData } = $props();

	// Format watch time as human-readable
	const formatWatchTime = $derived.by(() => {
		if (!data.stats) return { hours: 0, days: '0' };
		const hours = Math.round(data.stats.totalWatchTimeMinutes / 60);
		const days = (data.stats.totalWatchTimeMinutes / 60 / 24).toFixed(1);
		return { hours, days };
	});

	// Format relative time
	function formatRelativeTime(isoDate: string | null): string {
		if (!isoDate) return 'Never';

		const date = new Date(isoDate);
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffMins = Math.floor(diffMs / 60000);
		const diffHours = Math.floor(diffMins / 60);
		const diffDays = Math.floor(diffHours / 24);

		if (diffMins < 1) return 'Just now';
		if (diffMins < 60) return `${diffMins}m ago`;
		if (diffHours < 24) return `${diffHours}h ago`;
		if (diffDays < 7) return `${diffDays}d ago`;

		return date.toLocaleDateString();
	}

	// Format date nicely
	function formatDate(isoDate: string | null): string {
		if (!isoDate) return 'N/A';
		return new Date(isoDate).toLocaleString();
	}
</script>

<div class="dashboard">
	<header class="dashboard-header">
		<h1>Dashboard</h1>
		<p class="subtitle">Server overview for {data.year}</p>
	</header>

	<!-- Stats Cards Grid -->
	<div class="stats-grid">
		<!-- Users Card -->
		<div class="stat-card">
			<div class="stat-icon">&#9787;</div>
			<div class="stat-content">
				<span class="stat-value">{data.userCount}</span>
				<span class="stat-label">Total Users</span>
			</div>
		</div>

		<!-- Watch Time Card -->
		<div class="stat-card">
			<div class="stat-icon">&#9203;</div>
			<div class="stat-content">
				<span class="stat-value">{formatWatchTime.hours.toLocaleString()}</span>
				<span class="stat-label">Hours Watched</span>
				<span class="stat-sub">{formatWatchTime.days} days</span>
			</div>
		</div>

		<!-- Plays Card -->
		<div class="stat-card">
			<div class="stat-icon">&#9654;</div>
			<div class="stat-content">
				<span class="stat-value">{data.stats?.totalPlays.toLocaleString() ?? 0}</span>
				<span class="stat-label">Total Plays</span>
			</div>
		</div>

		<!-- History Records Card -->
		<div class="stat-card">
			<div class="stat-icon">&#128196;</div>
			<div class="stat-content">
				<span class="stat-value">{data.historyCount.toLocaleString()}</span>
				<span class="stat-label">History Records</span>
			</div>
		</div>
	</div>

	<!-- Sync Status Section -->
	<section class="section">
		<div class="section-header">
			<h2>Sync Status</h2>
			<a href="/admin/sync" class="section-link">Manage &rarr;</a>
		</div>

		<div class="sync-info">
			<div class="sync-row">
				<span class="sync-label">Last Sync:</span>
				<span class="sync-value">
					{formatRelativeTime(data.lastSync?.completedAt ?? null)}
					{#if data.lastSync}
						<span
							class="status-badge"
							class:success={data.lastSync.status === 'completed'}
							class:error={data.lastSync.status === 'failed'}
						>
							{data.lastSync.status}
						</span>
					{/if}
				</span>
			</div>

			{#if data.lastSync}
				<div class="sync-row">
					<span class="sync-label">Records Synced:</span>
					<span class="sync-value">{data.lastSync.recordsProcessed.toLocaleString()}</span>
				</div>
			{/if}

			{#if data.schedulerStatus}
				<div class="sync-row">
					<span class="sync-label">Scheduler:</span>
					<span class="sync-value">
						<span
							class="status-badge"
							class:success={data.schedulerStatus.isRunning && !data.schedulerStatus.isPaused}
							class:warning={data.schedulerStatus.isPaused}
							class:muted={!data.schedulerStatus.isRunning}
						>
							{#if !data.schedulerStatus.isRunning}
								Not configured
							{:else if data.schedulerStatus.isPaused}
								Paused
							{:else}
								Active
							{/if}
						</span>
					</span>
				</div>

				{#if data.schedulerStatus.nextRun}
					<div class="sync-row">
						<span class="sync-label">Next Sync:</span>
						<span class="sync-value">{formatDate(data.schedulerStatus.nextRun)}</span>
					</div>
				{/if}
			{/if}
		</div>
	</section>

	<!-- Wrapped Section -->
	<section class="section">
		<div class="section-header">
			<h2>Wrapped</h2>
			<a href="/admin/wrapped" class="section-link">View All &rarr;</a>
		</div>

		<div class="wrapped-mini-grid">
			<a href="/wrapped/{data.year}/u/{data.adminUser.id}" class="wrapped-mini-card personal">
				<span class="wrapped-mini-icon">&#9733;</span>
				<span class="wrapped-mini-label">My Wrapped</span>
			</a>

			<a href="/wrapped/{data.year}" class="wrapped-mini-card server">
				<span class="wrapped-mini-icon">&#127919;</span>
				<span class="wrapped-mini-label">Server Wrapped</span>
			</a>

			<a href="/admin/slides" class="wrapped-mini-card config">
				<span class="wrapped-mini-icon">&#9998;</span>
				<span class="wrapped-mini-label">Configure</span>
			</a>
		</div>
	</section>

	<!-- Quick Actions Section -->
	<section class="section">
		<h2>Quick Actions</h2>

		<div class="actions-grid">
			<a href="/admin/sync" class="action-card">
				<span class="action-icon">&#8635;</span>
				<span class="action-label">Sync Management</span>
				<span class="action-desc">Start sync, view history</span>
			</a>

			<a href="/admin/users" class="action-card">
				<span class="action-icon">&#9787;</span>
				<span class="action-label">User Management</span>
				<span class="action-desc">Manage permissions</span>
			</a>

			<a href="/admin/settings" class="action-card">
				<span class="action-icon">&#9881;</span>
				<span class="action-label">Settings</span>
				<span class="action-desc">Configure app settings</span>
			</a>
		</div>
	</section>
</div>

<style>
	.dashboard {
		max-width: 1000px;
		margin: 0 auto;
		padding: 2rem;
	}

	.dashboard-header {
		margin-bottom: 2rem;
	}

	.dashboard-header h1 {
		font-size: 2rem;
		font-weight: 700;
		color: hsl(var(--primary));
		margin: 0 0 0.5rem;
	}

	.subtitle {
		color: hsl(var(--muted-foreground));
		margin: 0;
	}

	/* Stats Grid */
	.stats-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 1rem;
		margin-bottom: 2rem;
	}

	.stat-card {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 1.5rem;
		background: hsl(var(--card));
		border: 1px solid hsl(var(--border));
		border-radius: var(--radius);
	}

	.stat-icon {
		font-size: 2rem;
		color: hsl(var(--primary));
		width: 3rem;
		text-align: center;
	}

	.stat-content {
		display: flex;
		flex-direction: column;
	}

	.stat-value {
		font-size: 1.75rem;
		font-weight: 700;
		color: hsl(var(--foreground));
		line-height: 1.2;
	}

	.stat-label {
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.stat-sub {
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
	}

	/* Sections */
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

	.section-link {
		font-size: 0.875rem;
		color: hsl(var(--primary));
		text-decoration: none;
	}

	.section-link:hover {
		text-decoration: underline;
	}

	/* Sync Info */
	.sync-info {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.sync-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.5rem 0;
		border-bottom: 1px solid hsl(var(--border) / 0.5);
	}

	.sync-row:last-child {
		border-bottom: none;
	}

	.sync-label {
		font-size: 0.875rem;
		color: hsl(var(--muted-foreground));
	}

	.sync-value {
		font-size: 0.875rem;
		font-weight: 500;
		color: hsl(var(--foreground));
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.status-badge {
		display: inline-block;
		padding: 0.125rem 0.5rem;
		border-radius: 9999px;
		font-size: 0.625rem;
		font-weight: 600;
		text-transform: uppercase;
		background: hsl(var(--muted));
		color: hsl(var(--muted-foreground));
	}

	.status-badge.success {
		background: hsl(120 40% 25%);
		color: hsl(120 60% 90%);
	}

	.status-badge.error {
		background: hsl(var(--destructive));
		color: hsl(var(--destructive-foreground));
	}

	.status-badge.warning {
		background: hsl(45 80% 30%);
		color: hsl(45 100% 90%);
	}

	.status-badge.muted {
		background: hsl(var(--muted));
		color: hsl(var(--muted-foreground));
	}

	/* Wrapped Mini Grid */
	.wrapped-mini-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 1rem;
	}

	.wrapped-mini-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 1.25rem 1rem;
		background: hsl(var(--secondary));
		border: 1px solid hsl(var(--border));
		border-radius: var(--radius);
		text-decoration: none;
		text-align: center;
		transition: all 0.2s ease;
		min-height: 100px;
	}

	.wrapped-mini-card:hover {
		border-color: hsl(var(--primary));
		transform: translateY(-2px);
		box-shadow: 0 4px 12px hsl(var(--primary) / 0.15);
	}

	.wrapped-mini-icon {
		font-size: 1.75rem;
		margin-bottom: 0.5rem;
	}

	.wrapped-mini-card.personal .wrapped-mini-icon {
		color: hsl(var(--primary));
	}

	.wrapped-mini-card.server .wrapped-mini-icon {
		color: oklch(0.7 0.15 200);
	}

	.wrapped-mini-card.config .wrapped-mini-icon {
		color: hsl(var(--muted-foreground));
	}

	.wrapped-mini-card.config:hover .wrapped-mini-icon {
		color: hsl(var(--primary));
	}

	.wrapped-mini-label {
		font-size: 0.875rem;
		font-weight: 600;
		color: hsl(var(--foreground));
	}

	/* Actions Grid */
	.actions-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
		gap: 1rem;
	}

	.action-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 1.25rem;
		background: hsl(var(--secondary));
		border: 1px solid hsl(var(--border));
		border-radius: var(--radius);
		text-decoration: none;
		text-align: center;
		transition: all 0.15s ease;
	}

	.action-card:hover {
		background: hsl(var(--primary) / 0.1);
		border-color: hsl(var(--primary));
	}

	.action-icon {
		font-size: 1.5rem;
		color: hsl(var(--primary));
		margin-bottom: 0.5rem;
	}

	.action-label {
		font-size: 0.875rem;
		font-weight: 600;
		color: hsl(var(--foreground));
		margin-bottom: 0.25rem;
	}

	.action-desc {
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
	}

	/* Responsive */
	@media (max-width: 640px) {
		.dashboard {
			padding: 1rem;
		}

		.stats-grid {
			grid-template-columns: repeat(2, 1fr);
		}

		.stat-card {
			padding: 1rem;
		}

		.stat-icon {
			font-size: 1.5rem;
			width: 2rem;
		}

		.stat-value {
			font-size: 1.25rem;
		}

		.wrapped-mini-grid {
			grid-template-columns: repeat(3, 1fr);
			gap: 0.5rem;
		}

		.wrapped-mini-card {
			padding: 1rem 0.5rem;
			min-height: 80px;
		}

		.wrapped-mini-icon {
			font-size: 1.5rem;
		}

		.wrapped-mini-label {
			font-size: 0.75rem;
		}
	}
</style>
