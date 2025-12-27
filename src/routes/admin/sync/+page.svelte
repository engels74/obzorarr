<script lang="ts">
	import { browser } from '$app/environment';
	import { enhance } from '$app/forms';
	import { goto, invalidateAll } from '$app/navigation';
	import { handleFormToast } from '$lib/utils/form-toast';
	import type { PageData, ActionData } from './$types';

	/**
	 * Admin Sync Page - Command Center Design
	 *
	 * Manages Plex sync operations with a visually striking interface:
	 * - Real-time sync progress with animated indicators
	 * - Scheduler configuration with visual status
	 * - Comprehensive sync history
	 */

	// Progress data from SSE
	interface SyncProgress {
		syncId: number;
		status: 'running' | 'completed' | 'failed' | 'cancelled';
		recordsProcessed: number;
		recordsInserted: number;
		recordsSkipped: number;
		currentPage: number;
		startedAt: string;
		error?: string;
		phase?: 'fetching' | 'enriching';
		enrichmentTotal?: number;
		enrichmentProcessed?: number;
	}

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// Local state
	let selectedBackfillYear = $state<string>('');
	let cronExpression = $state('0 0 * * *');
	let isSyncing = $state(false);
	let isCancelling = $state(false);

	// Show toast notifications for form responses
	$effect(() => {
		handleFormToast(form);
	});

	// SSE state
	let eventSource = $state<EventSource | null>(null);
	let progress = $state<SyncProgress | null>(null);
	let isConnected = $state(false);
	let syncCompleted = $state(false);

	// Derived states
	const syncActive = $derived(
		(data.isRunning && !syncCompleted) || (progress !== null && progress.status === 'running')
	);

	const enrichmentPercent = $derived(() => {
		if (!progress?.enrichmentTotal || progress.enrichmentTotal === 0) return 0;
		return Math.round(((progress.enrichmentProcessed ?? 0) / progress.enrichmentTotal) * 100);
	});

	const statusText = $derived(() => {
		if (!progress) return 'Ready';
		switch (progress.status) {
			case 'running':
				if (progress.phase === 'enriching') {
					return `Enriching ${enrichmentPercent()}%`;
				}
				return 'Syncing';
			case 'completed':
				return 'Complete';
			case 'failed':
				return 'Failed';
			case 'cancelled':
				return 'Cancelled';
			default:
				return 'Ready';
		}
	});

	// SSE Functions
	function connectSSE() {
		if (eventSource) eventSource.close();

		eventSource = new EventSource('/admin/sync/stream');

		eventSource.onopen = () => {
			isConnected = true;
		};

		eventSource.onmessage = (event) => {
			try {
				const eventData = JSON.parse(event.data);

				if (eventData.type === 'connected' || eventData.type === 'progress') {
					if (eventData.progress) progress = eventData.progress;
				} else if (['completed', 'failed', 'cancelled'].includes(eventData.type)) {
					if (eventData.progress) progress = eventData.progress;
					syncCompleted = true;
					setTimeout(() => {
						disconnectSSE();
						isSyncing = false;
						isCancelling = false;
						invalidateAll();
						setTimeout(() => {
							progress = null;
						}, 3000);
					}, 500);
				} else if (eventData.type === 'idle') {
					progress = null;
					isSyncing = false;
				}
			} catch (e) {
				console.error('Failed to parse SSE event:', e);
			}
		};

		eventSource.onerror = () => {
			isConnected = false;
			setTimeout(() => {
				if (isSyncing && !eventSource) connectSSE();
			}, 2000);
		};
	}

	function disconnectSSE() {
		if (eventSource) {
			eventSource.close();
			eventSource = null;
		}
		isConnected = false;
	}

	// Sync cron expression with data
	$effect(() => {
		cronExpression = data.schedulerStatus.cronExpression ?? '0 0 * * *';
	});

	// Connect to SSE if sync is running on page load
	$effect(() => {
		if (browser && data.isRunning && !eventSource && !syncCompleted) {
			isSyncing = true;
			connectSSE();
		}
	});

	// Cleanup on unmount
	$effect(() => {
		return () => disconnectSSE();
	});

	// Utility functions
	function formatDate(isoDate: string | null): string {
		if (!isoDate) return 'N/A';
		return new Date(isoDate).toLocaleString();
	}

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

	function formatDuration(start: string, end: string | null): string {
		if (!end) return '—';
		const diffMs = new Date(end).getTime() - new Date(start).getTime();
		if (diffMs < 1000) return '<1s';
		if (diffMs < 60000) return `${Math.round(diffMs / 1000)}s`;
		if (diffMs < 3600000) return `${Math.round(diffMs / 60000)}m`;
		return `${Math.round(diffMs / 3600000)}h`;
	}

	const cronPresets = [
		{ label: 'Hourly', value: '0 * * * *' },
		{ label: 'Every 6h', value: '0 */6 * * *' },
		{ label: 'Midnight', value: '0 0 * * *' },
		{ label: '3 AM', value: '0 3 * * *' },
		{ label: 'Weekly', value: '0 0 * * 0' }
	];

	// Pagination state
	let isNavigating = $state(false);

	// Pagination helpers
	const canGoPrevious = $derived(data.pagination.page > 1);
	const canGoNext = $derived(data.pagination.page < data.pagination.totalPages);

	// Calculate visible page numbers (show max 5 pages centered around current)
	const visiblePages = $derived.by(() => {
		const { page, totalPages } = data.pagination;
		const pages: number[] = [];

		if (totalPages <= 5) {
			// Show all pages if 5 or fewer
			for (let i = 1; i <= totalPages; i++) pages.push(i);
		} else {
			// Calculate range around current page
			let start = Math.max(1, page - 2);
			let end = Math.min(totalPages, page + 2);

			// Adjust if at boundaries
			if (page <= 3) {
				end = 5;
			} else if (page >= totalPages - 2) {
				start = totalPages - 4;
			}

			for (let i = start; i <= end; i++) pages.push(i);
		}

		return pages;
	});

	// Safely access first/last visible pages for pagination display
	const firstVisiblePage = $derived(visiblePages.at(0));
	const lastVisiblePage = $derived(visiblePages.at(-1));

	async function goToPage(page: number) {
		if (page < 1 || page > data.pagination.totalPages || isNavigating) return;

		isNavigating = true;
		const url = new URL(window.location.href);
		if (page === 1) {
			url.searchParams.delete('page');
		} else {
			url.searchParams.set('page', page.toString());
		}
		await goto(url.toString(), { keepFocus: true, noScroll: true });
		isNavigating = false;

		// Scroll to history section smoothly
		document
			.querySelector('.history-panel')
			?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}
</script>

<div class="sync-command-center">
	<!-- Page Header -->
	<header class="page-header">
		<div class="header-content">
			<div class="header-icon">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M21 12a9 9 0 11-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
					<path d="M21 3v5h-5" />
				</svg>
			</div>
			<div class="header-text">
				<h1>Sync Command</h1>
				<p class="header-subtitle">Plex Data Synchronization Center</p>
			</div>
		</div>
		<div class="header-stats">
			<div class="header-stat">
				<span class="header-stat-value">{data.historyCount.toLocaleString()}</span>
				<span class="header-stat-label">Records</span>
			</div>
		</div>
	</header>

	<div class="content-grid">
		<!-- Main Sync Panel -->
		<section class="panel sync-panel" class:active={syncActive || progress}>
			<div class="panel-header">
				<h2>
					<span class="panel-icon">◉</span>
					Sync Engine
				</h2>
				<div
					class="connection-indicator"
					class:connected={isConnected}
					class:syncing={syncActive}
					title={isConnected ? 'Connected' : 'Disconnected'}
				>
					<span class="indicator-dot"></span>
					<span class="indicator-text">{isConnected ? 'Live' : 'Idle'}</span>
				</div>
			</div>

			{#if syncActive || progress}
				<!-- Active Sync Display -->
				<div class="sync-active-display">
					<div class="sync-status-ring" class:running={progress?.status === 'running'}>
						<div class="ring-outer">
							<div class="ring-inner">
								<div
									class="status-icon"
									class:running={progress?.status === 'running'}
									class:completed={progress?.status === 'completed'}
									class:failed={progress?.status === 'failed'}
									class:cancelled={progress?.status === 'cancelled'}
								>
									{#if progress?.status === 'running'}
										<svg viewBox="0 0 24 24" fill="currentColor">
											<path d="M12 4V2A10 10 0 0 0 2 12h2a8 8 0 0 1 8-8Z" class="spinner-path" />
										</svg>
									{:else if progress?.status === 'completed'}
										<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
											<path d="M20 6L9 17l-5-5" />
										</svg>
									{:else if progress?.status === 'failed'}
										<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
											<path d="M18 6L6 18M6 6l12 12" />
										</svg>
									{:else}
										<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
											<path d="M18 6L6 18M6 6l12 12" />
										</svg>
									{/if}
								</div>
							</div>
						</div>
						{#if progress?.phase === 'enriching'}
							<svg class="progress-ring" viewBox="0 0 100 100">
								<circle class="progress-track" cx="50" cy="50" r="45" />
								<circle
									class="progress-fill"
									cx="50"
									cy="50"
									r="45"
									stroke-dasharray="283"
									stroke-dashoffset={283 - (283 * enrichmentPercent()) / 100}
								/>
							</svg>
						{/if}
					</div>

					<div class="sync-details">
						<div class="sync-status-text">{statusText()}</div>

						{#if progress}
							<div class="sync-metrics">
								<div class="metric">
									<span class="metric-value">{progress.recordsProcessed.toLocaleString()}</span>
									<span class="metric-label">Processed</span>
								</div>
								<div class="metric-divider"></div>
								<div class="metric">
									<span class="metric-value accent"
										>{progress.recordsInserted.toLocaleString()}</span
									>
									<span class="metric-label">New</span>
								</div>
								<div class="metric-divider"></div>
								<div class="metric">
									<span class="metric-value muted">{progress.recordsSkipped.toLocaleString()}</span>
									<span class="metric-label">Skipped</span>
								</div>
							</div>

							{#if progress.phase === 'enriching' && progress.enrichmentTotal}
								<div class="enrichment-bar">
									<div class="enrichment-progress" style:width="{enrichmentPercent()}%"></div>
									<span class="enrichment-text">
										Enriching metadata: {(progress.enrichmentProcessed ?? 0).toLocaleString()} / {progress.enrichmentTotal.toLocaleString()}
									</span>
								</div>
							{/if}

							{#if progress.error}
								<div class="sync-error">
									<svg viewBox="0 0 24 24" fill="currentColor" class="error-icon">
										<path
											d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm-1-7v2h2v-2h-2zm0-8v6h2V7h-2z"
										/>
									</svg>
									<span>{progress.error}</span>
								</div>
							{/if}
						{/if}
					</div>

					{#if progress?.status === 'running'}
						<form
							method="POST"
							action="?/cancelSync"
							use:enhance={() => {
								isCancelling = true;
								return async ({ update }) => {
									await update();
								};
							}}
						>
							<button type="submit" class="cancel-btn" disabled={isCancelling}>
								{#if isCancelling}
									<span class="btn-spinner"></span>
								{:else}
									<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
										<rect x="6" y="6" width="12" height="12" rx="2" />
									</svg>
								{/if}
								<span>Cancel</span>
							</button>
						</form>
					{/if}
				</div>
			{:else}
				<!-- Idle State - Start Sync Form -->
				<form
					method="POST"
					action="?/startSync"
					use:enhance={() => {
						isSyncing = true;
						syncCompleted = false;
						connectSSE();
						return async ({ update }) => {
							await update();
						};
					}}
					class="sync-form"
				>
					<div class="form-group">
						<label for="backfillYear">Sync Mode</label>
						<div class="select-wrapper">
							<select id="backfillYear" name="backfillYear" bind:value={selectedBackfillYear}>
								<option value="">Incremental (Latest)</option>
								{#each data.availableYears as year}
									<option value={year.toString()}>Backfill from {year}</option>
								{/each}
							</select>
							<svg class="select-arrow" viewBox="0 0 24 24" fill="currentColor">
								<path d="M7 10l5 5 5-5z" />
							</svg>
						</div>
					</div>

					<button type="submit" class="sync-btn" disabled={isSyncing}>
						{#if isSyncing}
							<span class="btn-spinner"></span>
							<span>Initializing...</span>
						{:else}
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
								<polygon points="5 3 19 12 5 21 5 3" />
							</svg>
							<span>Start Sync</span>
						{/if}
					</button>
				</form>

				{#if data.lastSync}
					<div class="last-sync-info">
						<span class="last-sync-time">{formatRelativeTime(data.lastSync.completedAt)}</span>
						<span class="last-sync-dot">•</span>
						<span class="last-sync-records"
							>{data.lastSync.recordsProcessed.toLocaleString()} records</span
						>
						<span
							class="last-sync-status"
							class:success={data.lastSync.status === 'completed'}
							class:error={data.lastSync.status === 'failed'}
						>
							{data.lastSync.status}
						</span>
					</div>
				{/if}
			{/if}
		</section>

		<!-- Scheduler Panel -->
		<section class="panel scheduler-panel">
			<div class="panel-header">
				<h2>
					<span class="panel-icon">⏱</span>
					Scheduler
				</h2>
				<div
					class="scheduler-status-badge"
					class:active={data.schedulerStatus.isRunning && !data.schedulerStatus.isPaused}
					class:paused={data.schedulerStatus.isPaused}
					class:inactive={!data.schedulerStatus.isRunning}
				>
					{#if !data.schedulerStatus.isRunning}
						Inactive
					{:else if data.schedulerStatus.isPaused}
						Paused
					{:else}
						Active
					{/if}
				</div>
			</div>

			<div class="scheduler-content">
				{#if data.schedulerStatus.nextRun || data.schedulerStatus.previousRun}
					<div class="scheduler-times">
						{#if data.schedulerStatus.nextRun}
							<div class="time-row">
								<span class="time-label">Next sync</span>
								<span class="time-value">{formatDate(data.schedulerStatus.nextRun)}</span>
							</div>
						{/if}
						{#if data.schedulerStatus.previousRun}
							<div class="time-row">
								<span class="time-label">Previous</span>
								<span class="time-value"
									>{formatRelativeTime(data.schedulerStatus.previousRun)}</span
								>
							</div>
						{/if}
					</div>
				{/if}

				<div class="scheduler-controls">
					{#if data.schedulerStatus.isRunning}
						{#if data.schedulerStatus.isPaused}
							<form method="POST" action="?/resumeScheduler" use:enhance>
								<button type="submit" class="control-btn resume">
									<svg viewBox="0 0 24 24" fill="currentColor">
										<polygon points="5 3 19 12 5 21 5 3" />
									</svg>
									Resume
								</button>
							</form>
						{:else}
							<form method="POST" action="?/pauseScheduler" use:enhance>
								<button type="submit" class="control-btn pause">
									<svg viewBox="0 0 24 24" fill="currentColor">
										<rect x="6" y="4" width="4" height="16" />
										<rect x="14" y="4" width="4" height="16" />
									</svg>
									Pause
								</button>
							</form>
						{/if}
					{:else}
						<form method="POST" action="?/initScheduler" use:enhance>
							<input type="hidden" name="cronExpression" value={cronExpression} />
							<button type="submit" class="control-btn init">
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<circle cx="12" cy="12" r="10" />
									<polyline points="12 6 12 12 16 14" />
								</svg>
								Initialize
							</button>
						</form>
					{/if}
				</div>

				<form method="POST" action="?/updateSchedule" use:enhance class="cron-config">
					<label for="cronExpression" class="cron-label">Schedule (cron)</label>
					<div class="cron-input-group">
						<input
							type="text"
							id="cronExpression"
							name="cronExpression"
							bind:value={cronExpression}
							placeholder="0 0 * * *"
							class="cron-input"
						/>
						<button type="submit" class="cron-update-btn" aria-label="Update schedule">
							<svg
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								aria-hidden="true"
							>
								<polyline points="20 6 9 17 4 12" />
							</svg>
						</button>
					</div>

					<div class="cron-presets">
						{#each cronPresets as preset}
							<button
								type="button"
								class="preset-chip"
								class:active={cronExpression === preset.value}
								onclick={() => (cronExpression = preset.value)}
							>
								{preset.label}
							</button>
						{/each}
					</div>
				</form>
			</div>
		</section>
	</div>

	<!-- Sync History Section -->
	<section class="panel history-panel">
		<div class="panel-header">
			<h2>
				<span class="panel-icon">📋</span>
				Sync History
			</h2>
			<span class="history-count">{data.pagination.total.toLocaleString()} total syncs</span>
		</div>

		{#if data.history.length === 0 && data.pagination.page === 1}
			<div class="empty-state">
				<div class="empty-icon">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
						<path d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
					</svg>
				</div>
				<p>No sync history yet</p>
				<span>Run your first sync to see results here</span>
			</div>
		{:else}
			<div class="history-list" class:loading={isNavigating}>
				{#each data.history as sync (sync.id)}
					<div
						class="history-item"
						class:completed={sync.status === 'completed'}
						class:failed={sync.status === 'failed'}
						class:running={sync.status === 'running'}
					>
						<div class="history-status-indicator">
							{#if sync.status === 'completed'}
								<svg viewBox="0 0 24 24" fill="currentColor">
									<path
										d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm-.997-6l7.07-7.071-1.414-1.414-5.656 5.657-2.829-2.829-1.414 1.414L11.003 16z"
									/>
								</svg>
							{:else if sync.status === 'failed'}
								<svg viewBox="0 0 24 24" fill="currentColor">
									<path
										d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm-1-7v2h2v-2h-2zm0-8v6h2V7h-2z"
									/>
								</svg>
							{:else}
								<svg viewBox="0 0 24 24" fill="currentColor" class="running-indicator">
									<path d="M12 4V2A10 10 0 0 0 2 12h2a8 8 0 0 1 8-8Z" />
								</svg>
							{/if}
						</div>

						<div class="history-main">
							<div class="history-time">
								<span class="time-relative">{formatRelativeTime(sync.startedAt)}</span>
								<span class="time-absolute">{formatDate(sync.startedAt)}</span>
							</div>
						</div>

						<div class="history-stats">
							<span class="stat-duration">{formatDuration(sync.startedAt, sync.completedAt)}</span>
							<span class="stat-records"
								>{sync.recordsProcessed.toLocaleString()} <small>records</small></span
							>
						</div>

						{#if sync.error}
							<div class="history-error" title={sync.error}>
								<svg viewBox="0 0 24 24" fill="currentColor">
									<path
										d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm-1-7v2h2v-2h-2zm0-8v6h2V7h-2z"
									/>
								</svg>
								<span>{sync.error.slice(0, 40)}{sync.error.length > 40 ? '...' : ''}</span>
							</div>
						{/if}
					</div>
				{/each}
			</div>

			<!-- Pagination Controls -->
			{#if data.pagination.totalPages > 1}
				<div class="pagination" class:loading={isNavigating}>
					<div class="pagination-info">
						<span class="pagination-range">
							Showing {(data.pagination.page - 1) * data.pagination.pageSize + 1}–{Math.min(
								data.pagination.page * data.pagination.pageSize,
								data.pagination.total
							)} of {data.pagination.total.toLocaleString()}
						</span>
					</div>

					<div class="pagination-controls">
						<!-- First Page -->
						<button
							type="button"
							class="pagination-btn"
							disabled={!canGoPrevious || isNavigating}
							onclick={() => goToPage(1)}
							aria-label="Go to first page"
						>
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<polyline points="11 17 6 12 11 7" />
								<polyline points="18 17 13 12 18 7" />
							</svg>
						</button>

						<!-- Previous Page -->
						<button
							type="button"
							class="pagination-btn"
							disabled={!canGoPrevious || isNavigating}
							onclick={() => goToPage(data.pagination.page - 1)}
							aria-label="Go to previous page"
						>
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<polyline points="15 18 9 12 15 6" />
							</svg>
						</button>

						<!-- Page Numbers -->
						<div class="pagination-pages">
							{#if firstVisiblePage !== undefined && firstVisiblePage > 1}
								<button
									type="button"
									class="pagination-page"
									onclick={() => goToPage(1)}
									disabled={isNavigating}
								>
									1
								</button>
								{#if firstVisiblePage > 2}
									<span class="pagination-ellipsis">…</span>
								{/if}
							{/if}

							{#each visiblePages as pageNum (pageNum)}
								<button
									type="button"
									class="pagination-page"
									class:active={pageNum === data.pagination.page}
									onclick={() => goToPage(pageNum)}
									disabled={isNavigating}
									aria-current={pageNum === data.pagination.page ? 'page' : undefined}
								>
									{pageNum}
								</button>
							{/each}

							{#if lastVisiblePage !== undefined && lastVisiblePage < data.pagination.totalPages}
								{#if lastVisiblePage < data.pagination.totalPages - 1}
									<span class="pagination-ellipsis">…</span>
								{/if}
								<button
									type="button"
									class="pagination-page"
									onclick={() => goToPage(data.pagination.totalPages)}
									disabled={isNavigating}
								>
									{data.pagination.totalPages}
								</button>
							{/if}
						</div>

						<!-- Next Page -->
						<button
							type="button"
							class="pagination-btn"
							disabled={!canGoNext || isNavigating}
							onclick={() => goToPage(data.pagination.page + 1)}
							aria-label="Go to next page"
						>
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<polyline points="9 18 15 12 9 6" />
							</svg>
						</button>

						<!-- Last Page -->
						<button
							type="button"
							class="pagination-btn"
							disabled={!canGoNext || isNavigating}
							onclick={() => goToPage(data.pagination.totalPages)}
							aria-label="Go to last page"
						>
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<polyline points="13 17 18 12 13 7" />
								<polyline points="6 17 11 12 6 7" />
							</svg>
						</button>
					</div>
				</div>
			{/if}
		{/if}
	</section>
</div>

<style>
	/* ===== Base Layout ===== */
	.sync-command-center {
		max-width: 1100px;
		margin: 0 auto;
		padding: 1.5rem 2rem 3rem;
	}

	/* ===== Page Header ===== */
	.page-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 2rem;
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

	.header-icon svg {
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

	.header-stats {
		display: flex;
		gap: 2rem;
	}

	.header-stat {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
	}

	.header-stat-value {
		font-size: 1.5rem;
		font-weight: 700;
		color: hsl(var(--foreground));
		font-variant-numeric: tabular-nums;
	}

	.header-stat-label {
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	/* ===== Content Grid ===== */
	.content-grid {
		display: grid;
		grid-template-columns: 1fr 380px;
		gap: 1.5rem;
		margin-bottom: 1.5rem;
	}

	/* ===== Panel Base ===== */
	.panel {
		background: hsl(var(--card));
		border: 1px solid hsl(var(--border));
		border-radius: 16px;
		overflow: hidden;
	}

	.panel-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1rem 1.25rem;
		border-bottom: 1px solid hsl(var(--border));
		background: hsl(var(--muted) / 0.3);
	}

	.panel-header h2 {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.9375rem;
		font-weight: 600;
		color: hsl(var(--foreground));
		margin: 0;
	}

	.panel-icon {
		font-size: 1rem;
	}

	/* ===== Sync Panel ===== */
	.sync-panel {
		transition: border-color 0.3s ease;
	}

	.sync-panel.active {
		border-color: hsl(var(--primary) / 0.5);
		box-shadow: 0 0 30px hsl(var(--primary) / 0.1);
	}

	.connection-indicator {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.25rem 0.625rem;
		background: hsl(var(--muted));
		border-radius: 9999px;
		font-size: 0.6875rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: hsl(var(--muted-foreground));
	}

	.indicator-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: hsl(var(--muted-foreground));
		transition: background 0.3s ease;
	}

	.connection-indicator.connected .indicator-dot {
		background: hsl(145 70% 50%);
		box-shadow: 0 0 8px hsl(145 70% 50% / 0.5);
	}

	.connection-indicator.syncing .indicator-dot {
		animation: pulse-glow 1.5s ease-in-out infinite;
	}

	@keyframes pulse-glow {
		0%,
		100% {
			opacity: 1;
			box-shadow: 0 0 8px hsl(145 70% 50% / 0.5);
		}
		50% {
			opacity: 0.5;
			box-shadow: 0 0 16px hsl(145 70% 50% / 0.8);
		}
	}

	/* ===== Active Sync Display ===== */
	.sync-active-display {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 2rem 1.5rem;
		gap: 1.5rem;
	}

	.sync-status-ring {
		position: relative;
		width: 120px;
		height: 120px;
	}

	.ring-outer {
		position: absolute;
		inset: 0;
		border-radius: 50%;
		background: linear-gradient(135deg, hsl(var(--muted)), hsl(var(--background)));
		padding: 4px;
	}

	.ring-inner {
		width: 100%;
		height: 100%;
		border-radius: 50%;
		background: hsl(var(--card));
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.status-icon {
		width: 48px;
		height: 48px;
		display: flex;
		align-items: center;
		justify-content: center;
		color: hsl(var(--muted-foreground));
	}

	.status-icon.running {
		color: hsl(var(--primary));
	}

	.status-icon.completed {
		color: hsl(145 70% 50%);
	}

	.status-icon.failed,
	.status-icon.cancelled {
		color: hsl(var(--destructive));
	}

	.status-icon svg {
		width: 100%;
		height: 100%;
	}

	.spinner-path {
		transform-origin: center;
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.progress-ring {
		position: absolute;
		inset: 0;
		transform: rotate(-90deg);
	}

	.progress-track {
		fill: none;
		stroke: hsl(var(--muted));
		stroke-width: 4;
	}

	.progress-fill {
		fill: none;
		stroke: hsl(var(--primary));
		stroke-width: 4;
		stroke-linecap: round;
		transition: stroke-dashoffset 0.5s ease;
	}

	.sync-details {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
		width: 100%;
	}

	.sync-status-text {
		font-size: 1.25rem;
		font-weight: 700;
		color: hsl(var(--foreground));
	}

	.sync-metrics {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 0.75rem 1.25rem;
		background: hsl(var(--muted) / 0.5);
		border-radius: 12px;
	}

	.metric {
		display: flex;
		flex-direction: column;
		align-items: center;
		min-width: 64px;
	}

	.metric-value {
		font-size: 1.25rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		color: hsl(var(--foreground));
	}

	.metric-value.accent {
		color: hsl(145 70% 50%);
	}

	.metric-value.muted {
		color: hsl(var(--muted-foreground));
	}

	.metric-label {
		font-size: 0.6875rem;
		color: hsl(var(--muted-foreground));
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.metric-divider {
		width: 1px;
		height: 28px;
		background: hsl(var(--border));
	}

	.enrichment-bar {
		position: relative;
		width: 100%;
		height: 32px;
		background: hsl(var(--muted));
		border-radius: 8px;
		overflow: hidden;
	}

	.enrichment-progress {
		position: absolute;
		inset: 0;
		background: linear-gradient(90deg, hsl(var(--primary) / 0.3), hsl(var(--primary) / 0.5));
		transition: width 0.5s ease;
	}

	.enrichment-text {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100%;
		font-size: 0.75rem;
		font-weight: 500;
		color: hsl(var(--foreground));
	}

	.sync-error {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem 1rem;
		background: hsl(var(--destructive) / 0.15);
		border: 1px solid hsl(var(--destructive) / 0.3);
		border-radius: 8px;
		font-size: 0.8125rem;
		color: hsl(var(--destructive));
		width: 100%;
	}

	.error-icon {
		width: 18px;
		height: 18px;
		flex-shrink: 0;
	}

	.cancel-btn {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.625rem 1.25rem;
		background: hsl(var(--muted));
		border: 1px solid hsl(var(--border));
		border-radius: 10px;
		color: hsl(var(--foreground));
		font-size: 0.8125rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.cancel-btn:hover:not(:disabled) {
		background: hsl(var(--destructive) / 0.15);
		border-color: hsl(var(--destructive) / 0.5);
		color: hsl(var(--destructive));
	}

	.cancel-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.cancel-btn svg {
		width: 16px;
		height: 16px;
	}

	/* ===== Sync Form (Idle State) ===== */
	.sync-form {
		padding: 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.form-group label {
		display: block;
		font-size: 0.8125rem;
		font-weight: 500;
		color: hsl(var(--muted-foreground));
		margin-bottom: 0.5rem;
	}

	.select-wrapper {
		position: relative;
	}

	.select-wrapper select {
		width: 100%;
		padding: 0.75rem 2.5rem 0.75rem 1rem;
		background: hsl(var(--muted));
		border: 1px solid hsl(var(--border));
		border-radius: 10px;
		color: hsl(var(--foreground));
		font-size: 0.9375rem;
		appearance: none;
		cursor: pointer;
	}

	.select-wrapper select:focus {
		outline: none;
		border-color: hsl(var(--primary));
		box-shadow: 0 0 0 3px hsl(var(--primary) / 0.15);
	}

	.select-arrow {
		position: absolute;
		right: 1rem;
		top: 50%;
		transform: translateY(-50%);
		width: 20px;
		height: 20px;
		color: hsl(var(--muted-foreground));
		pointer-events: none;
	}

	.sync-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.625rem;
		padding: 0.875rem 1.5rem;
		background: linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary) / 0.85));
		border: none;
		border-radius: 12px;
		color: hsl(var(--primary-foreground));
		font-size: 0.9375rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.sync-btn:hover:not(:disabled) {
		transform: translateY(-1px);
		box-shadow: 0 8px 24px hsl(var(--primary) / 0.3);
	}

	.sync-btn:active:not(:disabled) {
		transform: translateY(0);
	}

	.sync-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.sync-btn svg {
		width: 18px;
		height: 18px;
	}

	.btn-spinner {
		width: 18px;
		height: 18px;
		border: 2px solid hsl(var(--primary-foreground) / 0.3);
		border-top-color: hsl(var(--primary-foreground));
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	.last-sync-info {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 0.75rem;
		margin: 0 1.5rem 1.5rem;
		background: hsl(var(--muted) / 0.5);
		border-radius: 8px;
		font-size: 0.8125rem;
		color: hsl(var(--muted-foreground));
	}

	.last-sync-time {
		font-weight: 500;
	}

	.last-sync-dot {
		opacity: 0.5;
	}

	.last-sync-status {
		padding: 0.125rem 0.5rem;
		border-radius: 9999px;
		font-size: 0.625rem;
		font-weight: 600;
		text-transform: uppercase;
		background: hsl(var(--muted));
	}

	.last-sync-status.success {
		background: hsl(145 40% 25%);
		color: hsl(145 60% 85%);
	}

	.last-sync-status.error {
		background: hsl(var(--destructive) / 0.2);
		color: hsl(var(--destructive));
	}

	/* ===== Scheduler Panel ===== */
	.scheduler-content {
		padding: 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}

	.scheduler-status-badge {
		padding: 0.25rem 0.75rem;
		border-radius: 9999px;
		font-size: 0.6875rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.scheduler-status-badge.active {
		background: hsl(145 40% 25%);
		color: hsl(145 60% 85%);
	}

	.scheduler-status-badge.paused {
		background: hsl(45 60% 30%);
		color: hsl(45 80% 90%);
	}

	.scheduler-status-badge.inactive {
		background: hsl(var(--muted));
		color: hsl(var(--muted-foreground));
	}

	.scheduler-times {
		display: flex;
		flex-direction: column;
		gap: 0.625rem;
		padding: 0.875rem 1rem;
		background: hsl(var(--muted) / 0.5);
		border-radius: 10px;
	}

	.time-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.time-label {
		font-size: 0.8125rem;
		color: hsl(var(--muted-foreground));
	}

	.time-value {
		font-size: 0.8125rem;
		font-weight: 500;
		color: hsl(var(--foreground));
	}

	.scheduler-controls {
		display: flex;
		gap: 0.5rem;
	}

	.control-btn {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 0.75rem 1rem;
		border-radius: 10px;
		font-size: 0.8125rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.control-btn svg {
		width: 16px;
		height: 16px;
	}

	.control-btn.resume {
		background: hsl(145 45% 30%);
		border: 1px solid hsl(145 45% 40%);
		color: hsl(145 60% 90%);
	}

	.control-btn.resume:hover {
		background: hsl(145 50% 35%);
	}

	.control-btn.pause {
		background: hsl(45 50% 30%);
		border: 1px solid hsl(45 50% 40%);
		color: hsl(45 70% 90%);
	}

	.control-btn.pause:hover {
		background: hsl(45 55% 35%);
	}

	.control-btn.init {
		background: hsl(var(--primary));
		border: 1px solid hsl(var(--primary));
		color: hsl(var(--primary-foreground));
	}

	.control-btn.init:hover {
		opacity: 0.9;
	}

	.cron-config {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.cron-label {
		font-size: 0.75rem;
		font-weight: 500;
		color: hsl(var(--muted-foreground));
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.cron-input-group {
		display: flex;
		gap: 0.5rem;
	}

	.cron-input {
		flex: 1;
		padding: 0.625rem 0.875rem;
		background: hsl(var(--muted));
		border: 1px solid hsl(var(--border));
		border-radius: 8px;
		color: hsl(var(--foreground));
		font-size: 0.875rem;
		font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
	}

	.cron-input:focus {
		outline: none;
		border-color: hsl(var(--primary));
		box-shadow: 0 0 0 3px hsl(var(--primary) / 0.15);
	}

	.cron-update-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		background: hsl(var(--muted));
		border: 1px solid hsl(var(--border));
		border-radius: 8px;
		color: hsl(var(--muted-foreground));
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.cron-update-btn:hover {
		background: hsl(var(--primary));
		border-color: hsl(var(--primary));
		color: hsl(var(--primary-foreground));
	}

	.cron-update-btn svg {
		width: 18px;
		height: 18px;
	}

	.cron-presets {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
	}

	.preset-chip {
		padding: 0.375rem 0.75rem;
		background: hsl(var(--muted));
		border: 1px solid transparent;
		border-radius: 9999px;
		color: hsl(var(--muted-foreground));
		font-size: 0.75rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.preset-chip:hover {
		background: hsl(var(--primary) / 0.1);
		color: hsl(var(--primary));
	}

	.preset-chip.active {
		background: hsl(var(--primary));
		color: hsl(var(--primary-foreground));
	}

	/* ===== History Panel ===== */
	.history-panel {
		margin-top: 0;
	}

	.history-count {
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
	}

	.history-list.loading {
		opacity: 0.5;
		pointer-events: none;
		transition: opacity 0.15s ease;
	}

	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 3rem 2rem;
		text-align: center;
	}

	.empty-icon {
		width: 64px;
		height: 64px;
		color: hsl(var(--muted-foreground) / 0.5);
		margin-bottom: 1rem;
	}

	.empty-icon svg {
		width: 100%;
		height: 100%;
	}

	.empty-state p {
		font-size: 1rem;
		font-weight: 500;
		color: hsl(var(--foreground));
		margin: 0 0 0.25rem;
	}

	.empty-state span {
		font-size: 0.8125rem;
		color: hsl(var(--muted-foreground));
	}

	.history-list {
		display: flex;
		flex-direction: column;
	}

	.history-item {
		display: grid;
		grid-template-columns: auto 1fr auto auto;
		align-items: center;
		gap: 1rem;
		padding: 1rem 1.25rem;
		border-bottom: 1px solid hsl(var(--border) / 0.5);
		transition: background 0.15s ease;
	}

	.history-item:last-child {
		border-bottom: none;
	}

	.history-item:hover {
		background: hsl(var(--muted) / 0.3);
	}

	.history-status-indicator {
		width: 28px;
		height: 28px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.history-status-indicator svg {
		width: 20px;
		height: 20px;
	}

	.history-item.completed .history-status-indicator {
		color: hsl(145 60% 50%);
	}

	.history-item.failed .history-status-indicator {
		color: hsl(var(--destructive));
	}

	.history-item.running .history-status-indicator {
		color: hsl(var(--primary));
	}

	.running-indicator {
		animation: spin 1s linear infinite;
	}

	.history-main {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
		min-width: 0;
	}

	.history-time {
		display: flex;
		flex-direction: column;
	}

	.time-relative {
		font-size: 0.875rem;
		font-weight: 500;
		color: hsl(var(--foreground));
	}

	.time-absolute {
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
	}

	.history-stats {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 0.125rem;
	}

	.stat-duration {
		font-size: 0.8125rem;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		color: hsl(var(--foreground));
	}

	.stat-records {
		font-size: 0.75rem;
		font-variant-numeric: tabular-nums;
		color: hsl(var(--muted-foreground));
	}

	.stat-records small {
		font-size: 0.6875rem;
		opacity: 0.8;
	}

	.history-error {
		grid-column: 2 / -1;
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.5rem 0.75rem;
		background: hsl(var(--destructive) / 0.1);
		border-radius: 6px;
		font-size: 0.75rem;
		color: hsl(var(--destructive));
	}

	.history-error svg {
		width: 14px;
		height: 14px;
		flex-shrink: 0;
	}

	/* ===== Pagination ===== */
	.pagination {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
		padding: 1.25rem;
		border-top: 1px solid hsl(var(--border) / 0.5);
		background: hsl(var(--muted) / 0.2);
	}

	.pagination.loading {
		opacity: 0.6;
		pointer-events: none;
	}

	.pagination-info {
		text-align: center;
	}

	.pagination-range {
		font-size: 0.8125rem;
		color: hsl(var(--muted-foreground));
		font-variant-numeric: tabular-nums;
	}

	.pagination-controls {
		display: flex;
		align-items: center;
		gap: 0.375rem;
	}

	.pagination-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		background: hsl(var(--muted));
		border: 1px solid hsl(var(--border));
		border-radius: 8px;
		color: hsl(var(--foreground));
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.pagination-btn:hover:not(:disabled) {
		background: hsl(var(--primary) / 0.15);
		border-color: hsl(var(--primary) / 0.5);
		color: hsl(var(--primary));
	}

	.pagination-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.pagination-btn svg {
		width: 18px;
		height: 18px;
	}

	.pagination-pages {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		margin: 0 0.25rem;
	}

	.pagination-page {
		display: flex;
		align-items: center;
		justify-content: center;
		min-width: 36px;
		height: 36px;
		padding: 0 0.5rem;
		background: transparent;
		border: 1px solid transparent;
		border-radius: 8px;
		color: hsl(var(--muted-foreground));
		font-size: 0.875rem;
		font-weight: 500;
		font-variant-numeric: tabular-nums;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.pagination-page:hover:not(:disabled):not(.active) {
		background: hsl(var(--muted));
		color: hsl(var(--foreground));
	}

	.pagination-page.active {
		background: hsl(var(--primary));
		border-color: hsl(var(--primary));
		color: hsl(var(--primary-foreground));
		font-weight: 600;
	}

	.pagination-page:disabled {
		cursor: not-allowed;
	}

	.pagination-ellipsis {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		color: hsl(var(--muted-foreground));
		font-size: 0.875rem;
	}

	/* ===== Responsive Design ===== */
	@media (max-width: 900px) {
		.content-grid {
			grid-template-columns: 1fr;
		}

		.scheduler-panel {
			order: 2;
		}
	}

	@media (max-width: 640px) {
		.sync-command-center {
			padding: 1rem 1rem 2rem;
		}

		.page-header {
			flex-direction: column;
			align-items: flex-start;
			gap: 1rem;
		}

		.header-stats {
			width: 100%;
			justify-content: flex-start;
		}

		.header-stat {
			align-items: flex-start;
		}

		.sync-metrics {
			flex-wrap: wrap;
			justify-content: center;
		}

		.history-item {
			grid-template-columns: auto 1fr;
			gap: 0.75rem;
		}

		.history-stats {
			grid-column: 2;
			flex-direction: row;
			gap: 1rem;
			align-items: center;
		}

		.history-error {
			grid-column: 1 / -1;
		}

		/* Pagination responsive */
		.pagination {
			padding: 1rem;
		}

		.pagination-btn {
			width: 32px;
			height: 32px;
		}

		.pagination-btn svg {
			width: 16px;
			height: 16px;
		}

		.pagination-page {
			min-width: 32px;
			height: 32px;
			font-size: 0.8125rem;
		}

		.pagination-pages {
			gap: 0.125rem;
		}

		.pagination-range {
			font-size: 0.75rem;
		}
	}
</style>
