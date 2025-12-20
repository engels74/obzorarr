<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';

	/**
	 * Admin Sync Page
	 *
	 * Manages Plex sync operations:
	 * - Manual sync trigger with optional backfill
	 * - Scheduler configuration
	 * - Sync history display
	 *
	 * Implements Requirements:
	 * - 3.1: Manual sync button
	 * - 3.2: Progress indicator
	 * - 3.3: Cron schedule configuration
	 * - 3.4: Display sync status
	 * - 3.5: History log of syncs
	 */

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// Local state
	let selectedBackfillYear = $state<string>('');
	let cronExpression = $state(data.schedulerStatus.cronExpression ?? '0 0 * * *');
	let isSyncing = $state(false);

	// Format date nicely
	function formatDate(isoDate: string | null): string {
		if (!isoDate) return 'N/A';
		return new Date(isoDate).toLocaleString();
	}

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

	// Calculate duration between dates
	function formatDuration(start: string, end: string | null): string {
		if (!end) return 'Running...';

		const startDate = new Date(start);
		const endDate = new Date(end);
		const diffMs = endDate.getTime() - startDate.getTime();

		if (diffMs < 1000) return '<1s';
		if (diffMs < 60000) return `${Math.round(diffMs / 1000)}s`;
		if (diffMs < 3600000) return `${Math.round(diffMs / 60000)}m`;

		return `${Math.round(diffMs / 3600000)}h`;
	}

	// Common cron presets
	const cronPresets = [
		{ label: 'Every hour', value: '0 * * * *' },
		{ label: 'Every 6 hours', value: '0 */6 * * *' },
		{ label: 'Daily at midnight', value: '0 0 * * *' },
		{ label: 'Daily at 3 AM', value: '0 3 * * *' },
		{ label: 'Weekly (Sunday)', value: '0 0 * * 0' }
	];
</script>

<div class="sync-page">
	<header class="page-header">
		<h1>Sync Management</h1>
		<p class="subtitle">Manage Plex data synchronization</p>
	</header>

	{#if form?.error}
		<div class="error-banner" role="alert">
			{form.error}
		</div>
	{/if}

	{#if form?.success}
		<div class="success-banner" role="status">
			{form.message ?? 'Operation completed successfully'}
		</div>
	{/if}

	<!-- Sync Trigger Section -->
	<section class="section">
		<h2>Manual Sync</h2>
		<p class="section-description">
			Trigger a sync to fetch the latest viewing history from Plex.
		</p>

		{#if data.isRunning}
			<div class="sync-running">
				<span class="spinner"></span>
				<span>Sync in progress...</span>
			</div>
		{:else}
			<form
				method="POST"
				action="?/startSync"
				use:enhance={() => {
					isSyncing = true;
					return async ({ update }) => {
						isSyncing = false;
						await update();
					};
				}}
				class="sync-form"
			>
				<div class="form-row">
					<div class="form-group">
						<label for="backfillYear">Backfill Year (optional)</label>
						<select id="backfillYear" name="backfillYear" bind:value={selectedBackfillYear}>
							<option value="">Incremental sync</option>
							{#each data.availableYears as year}
								<option value={year.toString()}>Backfill from {year}</option>
							{/each}
						</select>
					</div>

					<button type="submit" class="sync-button" disabled={isSyncing}>
						{#if isSyncing}
							<span class="spinner small"></span>
							Syncing...
						{:else}
							Start Sync
						{/if}
					</button>
				</div>
			</form>
		{/if}

		{#if data.lastSync}
			<div class="last-sync-info">
				<strong>Last sync:</strong>
				{formatRelativeTime(data.lastSync.completedAt)} -
				{data.lastSync.recordsProcessed.toLocaleString()} records processed
				<span
					class="status-badge"
					class:success={data.lastSync.status === 'completed'}
					class:error={data.lastSync.status === 'failed'}
				>
					{data.lastSync.status}
				</span>
			</div>
		{/if}
	</section>

	<!-- Scheduler Section -->
	<section class="section">
		<h2>Sync Schedule</h2>
		<p class="section-description">
			Configure automatic sync schedule using cron expressions.
		</p>

		<div class="scheduler-status">
			<div class="status-row">
				<span class="status-label">Status:</span>
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
			</div>

			{#if data.schedulerStatus.nextRun}
				<div class="status-row">
					<span class="status-label">Next run:</span>
					<span class="status-value">{formatDate(data.schedulerStatus.nextRun)}</span>
				</div>
			{/if}

			{#if data.schedulerStatus.previousRun}
				<div class="status-row">
					<span class="status-label">Previous run:</span>
					<span class="status-value">{formatRelativeTime(data.schedulerStatus.previousRun)}</span>
				</div>
			{/if}
		</div>

		<!-- Scheduler Controls -->
		<div class="scheduler-controls">
			{#if data.schedulerStatus.isRunning}
				{#if data.schedulerStatus.isPaused}
					<form method="POST" action="?/resumeScheduler" use:enhance>
						<button type="submit" class="control-button resume">Resume Scheduler</button>
					</form>
				{:else}
					<form method="POST" action="?/pauseScheduler" use:enhance>
						<button type="submit" class="control-button pause">Pause Scheduler</button>
					</form>
				{/if}
			{:else}
				<form method="POST" action="?/initScheduler" use:enhance class="init-form">
					<input type="hidden" name="cronExpression" value={cronExpression} />
					<button type="submit" class="control-button init">Initialize Scheduler</button>
				</form>
			{/if}
		</div>

		<!-- Cron Configuration -->
		<form method="POST" action="?/updateSchedule" use:enhance class="cron-form">
			<div class="form-group">
				<label for="cronExpression">Cron Expression</label>
				<div class="cron-input-row">
					<input
						type="text"
						id="cronExpression"
						name="cronExpression"
						bind:value={cronExpression}
						placeholder="0 0 * * *"
					/>
					<button type="submit" class="update-button">Update</button>
				</div>
			</div>

			<div class="cron-presets">
				<span class="presets-label">Presets:</span>
				{#each cronPresets as preset}
					<button
						type="button"
						class="preset-button"
						class:active={cronExpression === preset.value}
						onclick={() => (cronExpression = preset.value)}
					>
						{preset.label}
					</button>
				{/each}
			</div>
		</form>
	</section>

	<!-- Sync History Section -->
	<section class="section">
		<div class="section-header">
			<h2>Sync History</h2>
			<span class="history-count">{data.historyCount.toLocaleString()} total records</span>
		</div>

		{#if data.history.length === 0}
			<p class="empty-message">No sync history yet. Run your first sync above.</p>
		{:else}
			<div class="history-table-wrapper">
				<table class="history-table">
					<thead>
						<tr>
							<th>Started</th>
							<th>Duration</th>
							<th>Records</th>
							<th>Status</th>
							<th>Error</th>
						</tr>
					</thead>
					<tbody>
						{#each data.history as sync (sync.id)}
							<tr>
								<td>
									<span class="date-primary">{formatRelativeTime(sync.startedAt)}</span>
									<span class="date-secondary">{formatDate(sync.startedAt)}</span>
								</td>
								<td>{formatDuration(sync.startedAt, sync.completedAt)}</td>
								<td>{sync.recordsProcessed.toLocaleString()}</td>
								<td>
									<span
										class="status-badge"
										class:success={sync.status === 'completed'}
										class:error={sync.status === 'failed'}
										class:warning={sync.status === 'running'}
									>
										{sync.status}
									</span>
								</td>
								<td class="error-cell">
									{#if sync.error}
										<span class="error-text" title={sync.error}>
											{sync.error.slice(0, 50)}{sync.error.length > 50 ? '...' : ''}
										</span>
									{:else}
										-
									{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</section>
</div>

<style>
	.sync-page {
		max-width: 900px;
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

	.history-count {
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

	.form-group input,
	.form-group select {
		width: 100%;
		padding: 0.5rem 0.75rem;
		background: hsl(var(--input));
		border: 1px solid hsl(var(--border));
		border-radius: var(--radius);
		color: hsl(var(--foreground));
		font-size: 0.875rem;
	}

	.form-group input:focus,
	.form-group select:focus {
		outline: none;
		border-color: hsl(var(--ring));
		box-shadow: 0 0 0 2px hsl(var(--ring) / 0.2);
	}

	.form-row {
		display: flex;
		gap: 1rem;
		align-items: flex-end;
	}

	.form-row .form-group {
		flex: 1;
		margin-bottom: 0;
	}

	/* Sync Form */
	.sync-form {
		margin-bottom: 1rem;
	}

	.sync-button {
		padding: 0.5rem 1.5rem;
		background: hsl(var(--primary));
		color: hsl(var(--primary-foreground));
		border: none;
		border-radius: var(--radius);
		font-weight: 600;
		cursor: pointer;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		transition: opacity 0.15s ease;
	}

	.sync-button:hover:not(:disabled) {
		opacity: 0.9;
	}

	.sync-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.sync-running {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 1rem;
		background: hsl(var(--muted));
		border-radius: var(--radius);
		color: hsl(var(--foreground));
	}

	.last-sync-info {
		font-size: 0.875rem;
		color: hsl(var(--muted-foreground));
		margin-top: 0.75rem;
	}

	/* Spinner */
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
		border-color: hsl(var(--primary-foreground) / 0.2);
		border-top-color: hsl(var(--primary-foreground));
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	/* Scheduler */
	.scheduler-status {
		margin-bottom: 1rem;
		padding: 0.75rem;
		background: hsl(var(--muted));
		border-radius: var(--radius);
	}

	.status-row {
		display: flex;
		justify-content: space-between;
		padding: 0.25rem 0;
	}

	.status-label {
		font-size: 0.875rem;
		color: hsl(var(--muted-foreground));
	}

	.status-value {
		font-size: 0.875rem;
		color: hsl(var(--foreground));
	}

	.scheduler-controls {
		margin-bottom: 1rem;
	}

	.control-button {
		padding: 0.5rem 1rem;
		border: 1px solid hsl(var(--border));
		border-radius: var(--radius);
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.control-button.resume {
		background: hsl(120 40% 30%);
		color: white;
		border-color: hsl(120 40% 30%);
	}

	.control-button.pause {
		background: hsl(45 80% 40%);
		color: white;
		border-color: hsl(45 80% 40%);
	}

	.control-button.init {
		background: hsl(var(--primary));
		color: hsl(var(--primary-foreground));
		border-color: hsl(var(--primary));
	}

	.control-button:hover {
		opacity: 0.9;
	}

	/* Cron Form */
	.cron-form {
		margin-top: 1rem;
	}

	.cron-input-row {
		display: flex;
		gap: 0.5rem;
	}

	.cron-input-row input {
		flex: 1;
	}

	.update-button {
		padding: 0.5rem 1rem;
		background: hsl(var(--secondary));
		color: hsl(var(--foreground));
		border: 1px solid hsl(var(--border));
		border-radius: var(--radius);
		font-size: 0.875rem;
		cursor: pointer;
	}

	.update-button:hover {
		background: hsl(var(--primary));
		color: hsl(var(--primary-foreground));
		border-color: hsl(var(--primary));
	}

	.cron-presets {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-top: 0.75rem;
		align-items: center;
	}

	.presets-label {
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
	}

	.preset-button {
		padding: 0.25rem 0.5rem;
		background: hsl(var(--muted));
		color: hsl(var(--foreground));
		border: 1px solid hsl(var(--border));
		border-radius: var(--radius);
		font-size: 0.75rem;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.preset-button:hover {
		background: hsl(var(--primary) / 0.1);
	}

	.preset-button.active {
		background: hsl(var(--primary));
		color: hsl(var(--primary-foreground));
		border-color: hsl(var(--primary));
	}

	/* Status Badge */
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

	/* History Table */
	.history-table-wrapper {
		overflow-x: auto;
	}

	.history-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.875rem;
	}

	.history-table th,
	.history-table td {
		padding: 0.75rem;
		text-align: left;
		border-bottom: 1px solid hsl(var(--border));
	}

	.history-table th {
		font-weight: 600;
		color: hsl(var(--muted-foreground));
		font-size: 0.75rem;
		text-transform: uppercase;
	}

	.history-table tbody tr:hover {
		background: hsl(var(--muted) / 0.5);
	}

	.date-primary {
		display: block;
		color: hsl(var(--foreground));
	}

	.date-secondary {
		display: block;
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
	}

	.error-cell {
		max-width: 200px;
	}

	.error-text {
		color: hsl(var(--destructive));
		font-size: 0.75rem;
	}

	.empty-message {
		color: hsl(var(--muted-foreground));
		text-align: center;
		padding: 2rem;
	}

	/* Responsive */
	@media (max-width: 640px) {
		.sync-page {
			padding: 1rem;
		}

		.form-row {
			flex-direction: column;
			align-items: stretch;
		}

		.history-table {
			font-size: 0.75rem;
		}

		.history-table th,
		.history-table td {
			padding: 0.5rem;
		}
	}
</style>
