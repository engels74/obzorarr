<script lang="ts">
	import type { PageData } from './$types';
	import Users from '@lucide/svelte/icons/users';
	import Clock from '@lucide/svelte/icons/clock';
	import Play from '@lucide/svelte/icons/play';
	import Database from '@lucide/svelte/icons/database';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import Star from '@lucide/svelte/icons/star';
	import Server from '@lucide/svelte/icons/server';
	import SlidersHorizontal from '@lucide/svelte/icons/sliders-horizontal';
	import Settings from '@lucide/svelte/icons/settings';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import Activity from '@lucide/svelte/icons/activity';
	import CheckCircle from '@lucide/svelte/icons/check-circle';
	import AlertCircle from '@lucide/svelte/icons/alert-circle';
	import PauseCircle from '@lucide/svelte/icons/pause-circle';
	import Circle from '@lucide/svelte/icons/circle';

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

	// Stats configuration with icons and colors
	const statsConfig = $derived([
		{
			value: data.userCount,
			label: 'Total Users',
			icon: Users,
			color: 'blue',
			gradient: 'from-blue-500/20 to-blue-600/5'
		},
		{
			value: formatWatchTime.hours.toLocaleString(),
			label: 'Hours Watched',
			sub: `${formatWatchTime.days} days`,
			icon: Clock,
			color: 'emerald',
			gradient: 'from-emerald-500/20 to-emerald-600/5'
		},
		{
			value: data.stats?.totalPlays.toLocaleString() ?? '0',
			label: 'Total Plays',
			icon: Play,
			color: 'violet',
			gradient: 'from-violet-500/20 to-violet-600/5'
		},
		{
			value: data.historyCount.toLocaleString(),
			label: 'History Records',
			icon: Database,
			color: 'amber',
			gradient: 'from-amber-500/20 to-amber-600/5'
		}
	]);

	// Sync status derived state
	const syncStatus = $derived.by(() => {
		if (!data.schedulerStatus) return 'unknown';
		if (!data.schedulerStatus.isRunning) return 'inactive';
		if (data.schedulerStatus.isPaused) return 'paused';
		return 'active';
	});

	const lastSyncStatus = $derived(data.lastSync?.status ?? 'unknown');
</script>

<svelte:head>
	<title>Dashboard - Admin - Obzorarr</title>
</svelte:head>

<div class="dashboard">
	<!-- Header with gradient accent -->
	<header class="dashboard-header">
		<div class="header-content">
			<div class="header-text">
				<h1 class="header-title">Dashboard</h1>
				<p class="header-subtitle">Server overview for {data.year}</p>
			</div>
			<div class="header-badge">
				<Activity class="h-4 w-4" />
				<span>Live</span>
			</div>
		</div>
		<div class="header-glow"></div>
	</header>

	<!-- Stats Cards Grid -->
	<div class="stats-grid">
		{#each statsConfig as stat, i}
			<div class="stat-card stat-{stat.color}" style="--delay: {i * 0.1}s">
				<div class="stat-glow"></div>
				<div class="stat-icon-wrap">
					<stat.icon class="stat-icon" />
				</div>
				<div class="stat-content">
					<span class="stat-value">{stat.value}</span>
					<span class="stat-label">{stat.label}</span>
					{#if stat.sub}
						<span class="stat-sub">{stat.sub}</span>
					{/if}
				</div>
				<div class="stat-gradient bg-gradient-to-br {stat.gradient}"></div>
			</div>
		{/each}
	</div>

	<!-- Main Content Grid -->
	<div class="content-grid">
		<!-- Sync Status Section -->
		<section class="section sync-section">
			<div class="section-header">
				<div class="section-title-wrap">
					<RefreshCw class="section-icon" />
					<h2>Sync Status</h2>
				</div>
				<a href="/admin/sync" class="section-link">
					<span>Manage</span>
					<ArrowRight class="h-4 w-4" />
				</a>
			</div>

			<div class="sync-info">
				<div class="sync-row">
					<span class="sync-label">Last Sync</span>
					<div class="sync-value">
						<span>{formatRelativeTime(data.lastSync?.completedAt ?? null)}</span>
						{#if data.lastSync}
							<span
								class="status-badge"
								class:success={lastSyncStatus === 'completed'}
								class:error={lastSyncStatus === 'failed'}
							>
								{#if lastSyncStatus === 'completed'}
									<CheckCircle class="h-3 w-3" />
								{:else if lastSyncStatus === 'failed'}
									<AlertCircle class="h-3 w-3" />
								{/if}
								{data.lastSync.status}
							</span>
						{/if}
					</div>
				</div>

				{#if data.lastSync}
					<div class="sync-row">
						<span class="sync-label">Records Synced</span>
						<span class="sync-value highlight">{data.lastSync.recordsProcessed.toLocaleString()}</span>
					</div>
				{/if}

				<div class="sync-row">
					<span class="sync-label">Scheduler</span>
					<div class="sync-value">
						<span
							class="status-indicator"
							class:active={syncStatus === 'active'}
							class:paused={syncStatus === 'paused'}
							class:inactive={syncStatus === 'inactive'}
						>
							{#if syncStatus === 'active'}
								<span class="pulse-dot"></span>
								<Circle class="h-3 w-3 fill-current" />
							{:else if syncStatus === 'paused'}
								<PauseCircle class="h-3 w-3" />
							{:else}
								<Circle class="h-3 w-3" />
							{/if}
							<span class="status-text">
								{#if syncStatus === 'inactive'}
									Not configured
								{:else if syncStatus === 'paused'}
									Paused
								{:else}
									Active
								{/if}
							</span>
						</span>
					</div>
				</div>

				{#if data.schedulerStatus?.nextRun}
					<div class="sync-row">
						<span class="sync-label">Next Sync</span>
						<span class="sync-value">{formatDate(data.schedulerStatus.nextRun)}</span>
					</div>
				{/if}
			</div>
		</section>

		<!-- Wrapped Section -->
		<section class="section wrapped-section">
			<div class="section-header">
				<div class="section-title-wrap">
					<Star class="section-icon text-amber-400" />
					<h2>Wrapped</h2>
				</div>
				<a href="/admin/wrapped" class="section-link">
					<span>View All</span>
					<ArrowRight class="h-4 w-4" />
				</a>
			</div>

			<div class="wrapped-grid">
				<a href="/wrapped/{data.year}/u/{data.adminUser.id}" class="wrapped-card personal">
					<div class="wrapped-card-glow"></div>
					<div class="wrapped-icon-wrap">
						<Star class="wrapped-icon" />
					</div>
					<span class="wrapped-label">My Wrapped</span>
					<ArrowRight class="wrapped-arrow" />
				</a>

				<a href="/wrapped/{data.year}" class="wrapped-card server">
					<div class="wrapped-card-glow"></div>
					<div class="wrapped-icon-wrap">
						<Server class="wrapped-icon" />
					</div>
					<span class="wrapped-label">Server Wrapped</span>
					<ArrowRight class="wrapped-arrow" />
				</a>

				<a href="/admin/slides" class="wrapped-card config">
					<div class="wrapped-card-glow"></div>
					<div class="wrapped-icon-wrap">
						<SlidersHorizontal class="wrapped-icon" />
					</div>
					<span class="wrapped-label">Configure</span>
					<ArrowRight class="wrapped-arrow" />
				</a>
			</div>
		</section>
	</div>

	<!-- Quick Actions Section -->
	<section class="section actions-section">
		<h2 class="actions-title">Quick Actions</h2>

		<div class="actions-grid">
			<a href="/admin/sync" class="action-card">
				<div class="action-icon-wrap">
					<RefreshCw class="action-icon" />
				</div>
				<div class="action-content">
					<span class="action-label">Sync Management</span>
					<span class="action-desc">Start sync, view history</span>
				</div>
				<ArrowRight class="action-arrow" />
			</a>

			<a href="/admin/users" class="action-card">
				<div class="action-icon-wrap">
					<Users class="action-icon" />
				</div>
				<div class="action-content">
					<span class="action-label">User Management</span>
					<span class="action-desc">Manage permissions</span>
				</div>
				<ArrowRight class="action-arrow" />
			</a>

			<a href="/admin/settings" class="action-card">
				<div class="action-icon-wrap">
					<Settings class="action-icon" />
				</div>
				<div class="action-content">
					<span class="action-label">Settings</span>
					<span class="action-desc">Configure app settings</span>
				</div>
				<ArrowRight class="action-arrow" />
			</a>
		</div>
	</section>
</div>

<style>
	.dashboard {
		max-width: 1100px;
		margin: 0 auto;
		padding: 1.5rem 2rem 3rem;
	}

	/* Header */
	.dashboard-header {
		position: relative;
		margin-bottom: 2rem;
		padding-bottom: 1.5rem;
		border-bottom: 1px solid hsl(var(--border) / 0.5);
	}

	.header-content {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		position: relative;
		z-index: 1;
	}

	.header-title {
		font-size: 2.25rem;
		font-weight: 800;
		color: hsl(var(--foreground));
		margin: 0;
		letter-spacing: -0.025em;
		background: linear-gradient(135deg, hsl(var(--foreground)) 0%, hsl(var(--primary)) 100%);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
	}

	.header-subtitle {
		color: hsl(var(--muted-foreground));
		margin: 0.25rem 0 0;
		font-size: 0.9375rem;
	}

	.header-badge {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.375rem 0.75rem;
		background: hsl(120 50% 25% / 0.3);
		border: 1px solid hsl(120 50% 40% / 0.4);
		border-radius: 9999px;
		font-size: 0.75rem;
		font-weight: 600;
		color: hsl(120 60% 70%);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.header-glow {
		position: absolute;
		top: -20px;
		left: -20px;
		width: 200px;
		height: 100px;
		background: radial-gradient(ellipse, hsl(var(--primary) / 0.15) 0%, transparent 70%);
		pointer-events: none;
	}

	/* Stats Grid */
	.stats-grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 1rem;
		margin-bottom: 1.5rem;
	}

	.stat-card {
		position: relative;
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 1.25rem;
		background: hsl(var(--card));
		border: 1px solid hsl(var(--border));
		border-radius: 0.75rem;
		overflow: hidden;
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		animation: slideUp 0.5s cubic-bezier(0.4, 0, 0.2, 1) backwards;
		animation-delay: var(--delay);
	}

	.stat-card:hover {
		transform: translateY(-2px);
		border-color: hsl(var(--primary) / 0.5);
		box-shadow:
			0 8px 24px -4px hsl(var(--primary) / 0.15),
			0 0 0 1px hsl(var(--primary) / 0.1);
	}

	.stat-glow {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: 1px;
		background: linear-gradient(90deg, transparent, hsl(var(--primary) / 0.5), transparent);
		opacity: 0;
		transition: opacity 0.3s ease;
	}

	.stat-card:hover .stat-glow {
		opacity: 1;
	}

	.stat-gradient {
		position: absolute;
		inset: 0;
		opacity: 0;
		transition: opacity 0.3s ease;
		pointer-events: none;
	}

	.stat-card:hover .stat-gradient {
		opacity: 1;
	}

	.stat-icon-wrap {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2.75rem;
		height: 2.75rem;
		border-radius: 0.625rem;
		background: hsl(var(--primary) / 0.1);
		flex-shrink: 0;
	}

	.stat-blue .stat-icon-wrap {
		background: hsl(217 91% 60% / 0.15);
	}

	.stat-emerald .stat-icon-wrap {
		background: hsl(152 69% 40% / 0.15);
	}

	.stat-violet .stat-icon-wrap {
		background: hsl(263 70% 50% / 0.15);
	}

	.stat-amber .stat-icon-wrap {
		background: hsl(38 92% 50% / 0.15);
	}

	.stat-card :global(.stat-icon) {
		width: 1.25rem;
		height: 1.25rem;
		color: hsl(var(--primary));
	}

	.stat-blue :global(.stat-icon) {
		color: hsl(217 91% 65%);
	}

	.stat-emerald :global(.stat-icon) {
		color: hsl(152 69% 50%);
	}

	.stat-violet :global(.stat-icon) {
		color: hsl(263 70% 60%);
	}

	.stat-amber :global(.stat-icon) {
		color: hsl(38 92% 55%);
	}

	.stat-content {
		display: flex;
		flex-direction: column;
		position: relative;
		z-index: 1;
	}

	.stat-value {
		font-size: 1.625rem;
		font-weight: 700;
		color: hsl(var(--foreground));
		line-height: 1.1;
		letter-spacing: -0.02em;
	}

	.stat-label {
		font-size: 0.6875rem;
		color: hsl(var(--muted-foreground));
		text-transform: uppercase;
		letter-spacing: 0.08em;
		margin-top: 0.125rem;
	}

	.stat-sub {
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground) / 0.8);
		margin-top: 0.125rem;
	}

	/* Content Grid */
	.content-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1.5rem;
		margin-bottom: 1.5rem;
	}

	/* Sections */
	.section {
		background: hsl(var(--card));
		border: 1px solid hsl(var(--border));
		border-radius: 0.75rem;
		padding: 1.25rem;
		animation: fadeIn 0.5s ease backwards;
		animation-delay: 0.3s;
	}

	.section-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1rem;
		padding-bottom: 0.75rem;
		border-bottom: 1px solid hsl(var(--border) / 0.5);
	}

	.section-title-wrap {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.section-title-wrap :global(.section-icon) {
		width: 1.125rem;
		height: 1.125rem;
		color: hsl(var(--primary));
	}

	.section-header h2 {
		font-size: 1rem;
		font-weight: 600;
		color: hsl(var(--foreground));
		margin: 0;
	}

	.section-link {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		font-size: 0.8125rem;
		font-weight: 500;
		color: hsl(var(--primary));
		text-decoration: none;
		transition: all 0.2s ease;
	}

	.section-link:hover {
		gap: 0.5rem;
	}

	/* Sync Info */
	.sync-info {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
	}

	.sync-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.625rem 0;
		border-bottom: 1px solid hsl(var(--border) / 0.3);
	}

	.sync-row:last-child {
		border-bottom: none;
		padding-bottom: 0;
	}

	.sync-label {
		font-size: 0.8125rem;
		color: hsl(var(--muted-foreground));
	}

	.sync-value {
		font-size: 0.8125rem;
		font-weight: 500;
		color: hsl(var(--foreground));
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.sync-value.highlight {
		color: hsl(var(--primary));
		font-weight: 600;
	}

	.status-badge {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.1875rem 0.5rem;
		border-radius: 9999px;
		font-size: 0.625rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		background: hsl(var(--muted));
		color: hsl(var(--muted-foreground));
	}

	.status-badge.success {
		background: hsl(120 50% 20% / 0.5);
		color: hsl(120 60% 70%);
		border: 1px solid hsl(120 50% 30% / 0.5);
	}

	.status-badge.error {
		background: hsl(0 60% 25% / 0.5);
		color: hsl(0 70% 70%);
		border: 1px solid hsl(0 50% 35% / 0.5);
	}

	.status-indicator {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.8125rem;
		position: relative;
	}

	.status-indicator.active {
		color: hsl(120 60% 60%);
	}

	.status-indicator.paused {
		color: hsl(45 90% 55%);
	}

	.status-indicator.inactive {
		color: hsl(var(--muted-foreground));
	}

	.pulse-dot {
		position: absolute;
		left: 0;
		width: 0.75rem;
		height: 0.75rem;
		border-radius: 50%;
		background: hsl(120 60% 50% / 0.4);
		animation: pulse 2s ease-in-out infinite;
	}

	.status-text {
		font-weight: 500;
	}

	/* Wrapped Grid */
	.wrapped-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.75rem;
	}

	.wrapped-card {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 1.25rem 0.75rem;
		background: hsl(var(--secondary));
		border: 1px solid hsl(var(--border));
		border-radius: 0.625rem;
		text-decoration: none;
		text-align: center;
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		overflow: hidden;
		min-height: 100px;
	}

	.wrapped-card:hover {
		transform: translateY(-3px);
		border-color: hsl(var(--primary) / 0.6);
		box-shadow: 0 8px 24px -4px hsl(var(--primary) / 0.2);
	}

	.wrapped-card-glow {
		position: absolute;
		top: -50%;
		left: 50%;
		transform: translateX(-50%);
		width: 100px;
		height: 100px;
		border-radius: 50%;
		opacity: 0;
		transition: opacity 0.3s ease;
		pointer-events: none;
	}

	.wrapped-card.personal .wrapped-card-glow {
		background: radial-gradient(circle, hsl(var(--primary) / 0.3) 0%, transparent 70%);
	}

	.wrapped-card.server .wrapped-card-glow {
		background: radial-gradient(circle, hsl(175 70% 50% / 0.3) 0%, transparent 70%);
	}

	.wrapped-card.config .wrapped-card-glow {
		background: radial-gradient(circle, hsl(var(--muted-foreground) / 0.2) 0%, transparent 70%);
	}

	.wrapped-card:hover .wrapped-card-glow {
		opacity: 1;
	}

	.wrapped-icon-wrap {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2.5rem;
		height: 2.5rem;
		border-radius: 0.5rem;
		margin-bottom: 0.5rem;
		transition: transform 0.3s ease;
	}

	.wrapped-card:hover .wrapped-icon-wrap {
		transform: scale(1.1);
	}

	.wrapped-card.personal .wrapped-icon-wrap {
		background: hsl(var(--primary) / 0.15);
	}

	.wrapped-card.server .wrapped-icon-wrap {
		background: hsl(175 70% 50% / 0.15);
	}

	.wrapped-card.config .wrapped-icon-wrap {
		background: hsl(var(--muted) / 0.5);
	}

	.wrapped-card :global(.wrapped-icon) {
		width: 1.25rem;
		height: 1.25rem;
	}

	.wrapped-card.personal :global(.wrapped-icon) {
		color: hsl(var(--primary));
	}

	.wrapped-card.server :global(.wrapped-icon) {
		color: hsl(175 70% 55%);
	}

	.wrapped-card.config :global(.wrapped-icon) {
		color: hsl(var(--muted-foreground));
	}

	.wrapped-card.config:hover :global(.wrapped-icon) {
		color: hsl(var(--primary));
	}

	.wrapped-label {
		font-size: 0.8125rem;
		font-weight: 600;
		color: hsl(var(--foreground));
		position: relative;
		z-index: 1;
	}

	.wrapped-card :global(.wrapped-arrow) {
		position: absolute;
		bottom: 0.5rem;
		right: 0.5rem;
		width: 0.875rem;
		height: 0.875rem;
		color: hsl(var(--muted-foreground) / 0.5);
		opacity: 0;
		transform: translateX(-4px);
		transition: all 0.3s ease;
	}

	.wrapped-card:hover :global(.wrapped-arrow) {
		opacity: 1;
		transform: translateX(0);
	}

	/* Actions Section */
	.actions-section {
		animation-delay: 0.4s;
	}

	.actions-title {
		font-size: 1rem;
		font-weight: 600;
		color: hsl(var(--foreground));
		margin: 0 0 1rem;
	}

	.actions-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 1rem;
	}

	.action-card {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 1rem 1.25rem;
		background: hsl(var(--secondary));
		border: 1px solid hsl(var(--border));
		border-radius: 0.625rem;
		text-decoration: none;
		transition: all 0.2s ease;
	}

	.action-card:hover {
		background: hsl(var(--primary) / 0.08);
		border-color: hsl(var(--primary) / 0.4);
	}

	.action-icon-wrap {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2.5rem;
		height: 2.5rem;
		background: hsl(var(--primary) / 0.1);
		border-radius: 0.5rem;
		flex-shrink: 0;
		transition: all 0.2s ease;
	}

	.action-card:hover .action-icon-wrap {
		background: hsl(var(--primary) / 0.2);
	}

	.action-card :global(.action-icon) {
		width: 1.125rem;
		height: 1.125rem;
		color: hsl(var(--primary));
	}

	.action-content {
		flex: 1;
		display: flex;
		flex-direction: column;
	}

	.action-label {
		font-size: 0.875rem;
		font-weight: 600;
		color: hsl(var(--foreground));
	}

	.action-desc {
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
		margin-top: 0.125rem;
	}

	.action-card :global(.action-arrow) {
		width: 1rem;
		height: 1rem;
		color: hsl(var(--muted-foreground) / 0.5);
		transition: all 0.2s ease;
	}

	.action-card:hover :global(.action-arrow) {
		color: hsl(var(--primary));
		transform: translateX(2px);
	}

	/* Animations */
	@keyframes slideUp {
		from {
			opacity: 0;
			transform: translateY(12px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	@keyframes pulse {
		0%,
		100% {
			transform: scale(1);
			opacity: 0.4;
		}
		50% {
			transform: scale(1.5);
			opacity: 0;
		}
	}

	/* Responsive */
	@media (max-width: 1024px) {
		.stats-grid {
			grid-template-columns: repeat(2, 1fr);
		}

		.content-grid {
			grid-template-columns: 1fr;
		}

		.actions-grid {
			grid-template-columns: repeat(2, 1fr);
		}
	}

	@media (max-width: 640px) {
		.dashboard {
			padding: 1rem 1rem 2rem;
		}

		.header-title {
			font-size: 1.75rem;
		}

		.header-badge {
			display: none;
		}

		.stats-grid {
			grid-template-columns: 1fr 1fr;
			gap: 0.75rem;
		}

		.stat-card {
			padding: 1rem;
			gap: 0.75rem;
		}

		.stat-icon-wrap {
			width: 2.25rem;
			height: 2.25rem;
		}

		.stat-card :global(.stat-icon) {
			width: 1rem;
			height: 1rem;
		}

		.stat-value {
			font-size: 1.25rem;
		}

		.stat-label {
			font-size: 0.625rem;
		}

		.wrapped-grid {
			grid-template-columns: repeat(3, 1fr);
			gap: 0.5rem;
		}

		.wrapped-card {
			padding: 1rem 0.5rem;
			min-height: 85px;
		}

		.wrapped-icon-wrap {
			width: 2rem;
			height: 2rem;
		}

		.wrapped-card :global(.wrapped-icon) {
			width: 1rem;
			height: 1rem;
		}

		.wrapped-label {
			font-size: 0.6875rem;
		}

		.actions-grid {
			grid-template-columns: 1fr;
			gap: 0.75rem;
		}

		.action-card {
			padding: 0.875rem 1rem;
		}
	}
</style>
