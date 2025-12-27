<script lang="ts">
	import { enhance } from '$app/forms';
	import { browser } from '$app/environment';
	import { untrack } from 'svelte';
	import { animate, stagger } from 'motion';
	import OnboardingCard from '$lib/components/onboarding/OnboardingCard.svelte';
	import type { PageData, ActionData } from './$types';

	/**
	 * Onboarding Step 2: Initial Data Sync
	 *
	 * Shows sync progress with SSE updates.
	 * User can continue while sync runs in background.
	 */

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// Sync state - initialized from server data, updated via SSE
	// Using untrack() to explicitly capture initial values (state is updated via SSE, not prop changes)
	type SyncStatus = 'idle' | 'running' | 'completed' | 'failed' | 'cancelled';

	let syncStatus = $state<SyncStatus>(untrack(() => (data.syncRunning ? 'running' : 'idle')));
	let recordsProcessed = $state(untrack(() => data.currentProgress?.recordsProcessed ?? 0));
	let recordsInserted = $state(untrack(() => data.currentProgress?.recordsInserted ?? 0));
	let phase = $state<'fetching' | 'enriching' | null>(
		untrack(() => data.currentProgress?.phase ?? null)
	);
	let enrichmentTotal = $state(untrack(() => data.currentProgress?.enrichmentTotal ?? 0));
	let enrichmentProcessed = $state(untrack(() => data.currentProgress?.enrichmentProcessed ?? 0));
	let isStarting = $state(false);
	let error = $state<string | null>(null);

	// SSE connection
	let eventSource: EventSource | null = null;

	// Animation refs
	let contentRef: HTMLElement | undefined = $state();
	let progressRef: HTMLElement | undefined = $state();

	// Computed
	const enrichmentProgress = $derived(
		enrichmentTotal > 0 ? Math.round((enrichmentProcessed / enrichmentTotal) * 100) : 0
	);

	const hasStarted = $derived(syncStatus !== 'idle');
	const isRunning = $derived(syncStatus === 'running');
	const isComplete = $derived(syncStatus === 'completed');
	const hasFailed = $derived(syncStatus === 'failed' || syncStatus === 'cancelled');

	// Phase display text
	const phaseText = $derived(() => {
		if (phase === 'fetching') return 'Fetching viewing history...';
		if (phase === 'enriching') return 'Enriching metadata...';
		if (isComplete) return 'Sync complete!';
		if (hasFailed) return 'Sync failed';
		return 'Preparing...';
	});

	// Content animation
	$effect(() => {
		if (!contentRef) return;
		const items = contentRef.querySelectorAll('.animate-item');
		if (items.length === 0) return;

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const animation = (animate as any)(
			items,
			{ opacity: [0, 1], transform: ['translateY(16px)', 'translateY(0)'] },
			{ duration: 0.5, delay: stagger(0.1), easing: [0.22, 1, 0.36, 1] }
		);
		return () => animation.stop?.();
	});

	// Progress ring animation on complete
	$effect(() => {
		if (!progressRef || !isComplete) return;

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(animate as any)(
			progressRef,
			{ transform: ['scale(1)', 'scale(1.05)', 'scale(1)'] },
			{ duration: 0.4, easing: [0.22, 1, 0.36, 1] }
		);
	});

	// Connect to SSE when sync starts
	$effect(() => {
		if (!browser) return;
		if (!isRunning && !data.syncRunning) return;

		// Connect to public SSE endpoint (doesn't require admin auth)
		eventSource = new EventSource('/api/sync/status/stream');

		eventSource.onmessage = (event) => {
			try {
				const eventData = JSON.parse(event.data);

				switch (eventData.type) {
					case 'connected':
						// Handle initial connection with current progress state
						if (eventData.inProgress && eventData.progress) {
							syncStatus = 'running';
							recordsProcessed = eventData.progress.recordsProcessed ?? 0;
							recordsInserted = eventData.progress.recordsInserted ?? 0;
							phase = eventData.progress.phase ?? null;
							enrichmentTotal = eventData.progress.enrichmentTotal ?? 0;
							enrichmentProcessed = eventData.progress.enrichmentProcessed ?? 0;
						}
						break;
					case 'update':
						syncStatus = 'running';
						if (eventData.progress) {
							recordsProcessed = eventData.progress.recordsProcessed ?? recordsProcessed;
							recordsInserted = eventData.progress.recordsInserted ?? recordsInserted;
							phase = eventData.progress.phase ?? phase;
							enrichmentTotal = eventData.progress.enrichmentTotal ?? enrichmentTotal;
							enrichmentProcessed = eventData.progress.enrichmentProcessed ?? enrichmentProcessed;
						}
						break;
					case 'completed':
						syncStatus = 'completed';
						break;
					case 'failed':
						syncStatus = 'failed';
						error = eventData.error ?? 'Sync failed';
						break;
					case 'cancelled':
						syncStatus = 'cancelled';
						break;
					case 'idle':
						// Sync finished before we connected
						if (syncStatus === 'running') {
							syncStatus = 'completed';
						}
						break;
				}
			} catch (e) {
				console.error('SSE parse error:', e);
			}
		};

		eventSource.onerror = () => {
			// Connection lost - don't change status, just log
			console.warn('SSE connection lost, reconnecting...');
		};

		return () => {
			eventSource?.close();
			eventSource = null;
		};
	});

	// Handle form submission result
	$effect(() => {
		if (form?.success) {
			syncStatus = 'running';
			isStarting = false;
		}
		if (form?.error) {
			error = form.error;
			isStarting = false;
		}
	});

	function handleStartSync() {
		isStarting = true;
		error = null;
	}

	// Format number with animation-friendly display
	function formatNumber(n: number): string {
		return n.toLocaleString();
	}
</script>

<OnboardingCard
	title="Sync Your Viewing History"
	subtitle="Import your {data.currentYear} Plex viewing data to generate your personalized Wrapped"
>
	<div class="sync-content" bind:this={contentRef}>
		<!-- Progress Ring -->
		<div class="progress-wrapper animate-item" bind:this={progressRef}>
			<div
				class="progress-ring"
				class:running={isRunning}
				class:complete={isComplete}
				class:failed={hasFailed}
			>
				<!-- Background ring -->
				<svg class="ring-bg" viewBox="0 0 120 120">
					<circle cx="60" cy="60" r="52" />
				</svg>

				<!-- Progress ring -->
				<svg class="ring-progress" viewBox="0 0 120 120">
					<circle
						cx="60"
						cy="60"
						r="52"
						style="--progress: {phase === 'enriching' ? enrichmentProgress : isComplete ? 100 : 0}"
					/>
				</svg>

				<!-- Center content -->
				<div class="ring-center">
					{#if !hasStarted}
						<div class="ring-icon idle">
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
								<path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
								<path d="M9 12l2 2 4-4" stroke-linecap="round" stroke-linejoin="round" />
							</svg>
						</div>
					{:else if isRunning}
						<div class="ring-icon running">
							<div class="spinner-dots">
								<span></span><span></span><span></span>
							</div>
						</div>
					{:else if isComplete}
						<div class="ring-icon complete">
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
								<path d="M20 6L9 17l-5-5" stroke-linecap="round" stroke-linejoin="round" />
							</svg>
						</div>
					{:else if hasFailed}
						<div class="ring-icon failed">
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<circle cx="12" cy="12" r="10" />
								<line x1="15" y1="9" x2="9" y2="15" />
								<line x1="9" y1="9" x2="15" y2="15" />
							</svg>
						</div>
					{/if}
				</div>

				<!-- Glow effect -->
				<div class="ring-glow"></div>
			</div>
		</div>

		<!-- Phase indicator -->
		<div class="phase-section animate-item">
			<p
				class="phase-text"
				class:running={isRunning}
				class:complete={isComplete}
				class:failed={hasFailed}
			>
				{phaseText()}
			</p>

			{#if hasStarted && !hasFailed}
				<div class="stats-row">
					<div class="stat">
						<span class="stat-value">{formatNumber(recordsProcessed)}</span>
						<span class="stat-label">Records Processed</span>
					</div>
					<div class="stat-divider"></div>
					<div class="stat">
						<span class="stat-value">{formatNumber(recordsInserted)}</span>
						<span class="stat-label">New Records</span>
					</div>
				</div>
			{/if}

			{#if phase === 'enriching' && enrichmentTotal > 0}
				<div class="enrichment-progress">
					<div class="enrichment-bar">
						<div class="enrichment-fill" style="width: {enrichmentProgress}%"></div>
					</div>
					<span class="enrichment-text"
						>{enrichmentProcessed} / {enrichmentTotal} items enriched</span
					>
				</div>
			{/if}
		</div>

		<!-- Start button (when idle) -->
		{#if !hasStarted}
			<form
				method="POST"
				action="?/startSync"
				use:enhance={() => {
					handleStartSync();
					return async ({ update }) => {
						await update();
					};
				}}
			>
				<button type="submit" class="start-button animate-item" disabled={isStarting}>
					{#if isStarting}
						<span class="btn-spinner"></span>
						<span>Starting sync...</span>
					{:else}
						<svg
							class="btn-icon"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
						>
							<path
								d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
								stroke-linecap="round"
								stroke-linejoin="round"
							/>
						</svg>
						<span>Start Sync</span>
					{/if}
				</button>
			</form>
		{/if}

		<!-- Error display -->
		{#if error}
			<div class="error-banner animate-item">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<circle cx="12" cy="12" r="10" />
					<line x1="12" y1="8" x2="12" y2="12" />
					<line x1="12" y1="16" x2="12.01" y2="16" />
				</svg>
				<span>{error}</span>
			</div>
		{/if}

		<!-- Warning banner (while running) -->
		{#if isRunning}
			<div class="warning-banner animate-item">
				<div class="warning-icon">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path
							d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</svg>
				</div>
				<div class="warning-content">
					<p class="warning-title">Keep this page open</p>
					<p class="warning-text">
						Sync will continue in the background if you proceed, but progress won't be visible.
					</p>
				</div>
			</div>
		{/if}

		<!-- Success message -->
		{#if isComplete}
			<div class="success-banner animate-item">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path
						d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
				<span>Your viewing history has been synced successfully!</span>
			</div>
		{/if}

		<!-- Info about continuing -->
		{#if hasStarted && !hasFailed}
			<p class="continue-hint animate-item">
				{#if isComplete}
					You're all set! Continue to customize your experience.
				{:else}
					You can continue while sync runs in the background.
				{/if}
			</p>
		{/if}
	</div>

	{#snippet footer()}
		<form method="POST" action="?/continue" use:enhance>
			<button type="submit" class="continue-button" disabled={!hasStarted}>
				<span>Continue</span>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
					<path d="M5 12h14M12 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round" />
				</svg>
			</button>
		</form>
	{/snippet}
</OnboardingCard>

<!-- SVG gradient definitions (placed in component for scoping) -->
<svg style="position: absolute; width: 0; height: 0;" aria-hidden="true">
	<defs>
		<linearGradient id="ring-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
			<stop offset="0%" stop-color="hsl(35, 100%, 55%)" />
			<stop offset="100%" stop-color="hsl(25, 100%, 50%)" />
		</linearGradient>
	</defs>
</svg>

<style>
	.sync-content {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1.5rem;
	}

	.animate-item {
		opacity: 0;
	}

	/* Progress Ring */
	.progress-wrapper {
		position: relative;
		width: 140px;
		height: 140px;
	}

	.progress-ring {
		position: relative;
		width: 100%;
		height: 100%;
	}

	.ring-bg,
	.ring-progress {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
	}

	.ring-bg circle {
		fill: none;
		stroke: rgba(255, 255, 255, 0.08);
		stroke-width: 8;
	}

	.ring-progress circle {
		fill: none;
		stroke: url(#ring-gradient);
		stroke-width: 8;
		stroke-linecap: round;
		stroke-dasharray: 326.7;
		stroke-dashoffset: calc(326.7 - (326.7 * var(--progress, 0) / 100));
		transform: rotate(-90deg);
		transform-origin: center;
		transition: stroke-dashoffset 0.5s cubic-bezier(0.22, 1, 0.36, 1);
	}

	.progress-ring.running .ring-bg circle {
		animation: ring-pulse 2s ease-in-out infinite;
	}

	@keyframes ring-pulse {
		0%,
		100% {
			stroke: rgba(255, 255, 255, 0.08);
		}
		50% {
			stroke: rgba(255, 160, 50, 0.15);
		}
	}

	.progress-ring.complete .ring-progress circle {
		stroke: hsl(142, 71%, 50%);
	}

	.progress-ring.failed .ring-progress circle {
		stroke: hsl(0, 84%, 60%);
	}

	/* Ring center */
	.ring-center {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.ring-icon {
		width: 48px;
		height: 48px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.ring-icon svg {
		width: 100%;
		height: 100%;
	}

	.ring-icon.idle {
		color: rgba(255, 255, 255, 0.4);
	}

	.ring-icon.complete {
		color: hsl(142, 71%, 55%);
	}

	.ring-icon.failed {
		color: hsl(0, 84%, 60%);
	}

	/* Spinner dots */
	.spinner-dots {
		display: flex;
		gap: 6px;
	}

	.spinner-dots span {
		width: 10px;
		height: 10px;
		background: hsl(35, 100%, 55%);
		border-radius: 50%;
		animation: dot-bounce 1.4s ease-in-out infinite;
	}

	.spinner-dots span:nth-child(1) {
		animation-delay: 0s;
	}
	.spinner-dots span:nth-child(2) {
		animation-delay: 0.16s;
	}
	.spinner-dots span:nth-child(3) {
		animation-delay: 0.32s;
	}

	@keyframes dot-bounce {
		0%,
		80%,
		100% {
			transform: scale(0.6);
			opacity: 0.4;
		}
		40% {
			transform: scale(1);
			opacity: 1;
		}
	}

	/* Ring glow */
	.ring-glow {
		position: absolute;
		inset: -10px;
		border-radius: 50%;
		background: radial-gradient(circle, rgba(255, 160, 50, 0.2) 0%, transparent 70%);
		opacity: 0;
		transition: opacity 0.4s ease;
		pointer-events: none;
	}

	.progress-ring.running .ring-glow {
		opacity: 1;
		animation: glow-pulse 2s ease-in-out infinite;
	}

	.progress-ring.complete .ring-glow {
		opacity: 1;
		background: radial-gradient(circle, rgba(34, 197, 94, 0.25) 0%, transparent 70%);
	}

	@keyframes glow-pulse {
		0%,
		100% {
			opacity: 0.6;
			transform: scale(1);
		}
		50% {
			opacity: 1;
			transform: scale(1.05);
		}
	}

	/* Phase section */
	.phase-section {
		text-align: center;
		width: 100%;
	}

	.phase-text {
		margin: 0;
		font-size: 1rem;
		font-weight: 500;
		color: rgba(255, 255, 255, 0.7);
		transition: color 0.3s ease;
	}

	.phase-text.running {
		color: hsl(35, 100%, 60%);
	}

	.phase-text.complete {
		color: hsl(142, 71%, 55%);
	}

	.phase-text.failed {
		color: hsl(0, 84%, 60%);
	}

	/* Stats row */
	.stats-row {
		display: flex;
		justify-content: center;
		align-items: center;
		gap: 1.5rem;
		margin-top: 1rem;
		padding: 0.75rem 1.25rem;
		background: rgba(255, 255, 255, 0.03);
		border-radius: 12px;
		border: 1px solid rgba(255, 255, 255, 0.06);
	}

	.stat {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.25rem;
	}

	.stat-value {
		font-size: 1.5rem;
		font-weight: 700;
		color: rgba(255, 255, 255, 0.95);
		font-variant-numeric: tabular-nums;
		letter-spacing: -0.02em;
	}

	.stat-label {
		font-size: 0.7rem;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: rgba(255, 255, 255, 0.45);
	}

	.stat-divider {
		width: 1px;
		height: 32px;
		background: rgba(255, 255, 255, 0.1);
	}

	/* Enrichment progress */
	.enrichment-progress {
		margin-top: 1rem;
		width: 100%;
	}

	.enrichment-bar {
		height: 4px;
		background: rgba(255, 255, 255, 0.1);
		border-radius: 2px;
		overflow: hidden;
	}

	.enrichment-fill {
		height: 100%;
		background: linear-gradient(90deg, hsl(35, 100%, 50%) 0%, hsl(25, 100%, 55%) 100%);
		border-radius: 2px;
		transition: width 0.3s ease;
	}

	.enrichment-text {
		display: block;
		margin-top: 0.5rem;
		font-size: 0.8rem;
		color: rgba(255, 255, 255, 0.5);
		text-align: center;
	}

	/* Start button */
	.start-button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		padding: 1rem 2rem;
		min-width: 180px;
		font-size: 1rem;
		font-weight: 600;
		color: hsl(25, 20%, 10%);
		background: linear-gradient(135deg, hsl(35, 100%, 55%) 0%, hsl(25, 100%, 50%) 100%);
		border: none;
		border-radius: 12px;
		cursor: pointer;
		transition: all 0.25s cubic-bezier(0.22, 1, 0.36, 1);
		box-shadow:
			0 4px 16px rgba(255, 160, 50, 0.35),
			0 2px 4px rgba(0, 0, 0, 0.2),
			inset 0 1px 0 rgba(255, 255, 255, 0.2);
	}

	.start-button:hover:not(:disabled) {
		transform: translateY(-2px);
		box-shadow:
			0 6px 24px rgba(255, 160, 50, 0.45),
			0 4px 8px rgba(0, 0, 0, 0.25),
			inset 0 1px 0 rgba(255, 255, 255, 0.25);
	}

	.start-button:disabled {
		opacity: 0.8;
		cursor: not-allowed;
	}

	.btn-icon {
		width: 20px;
		height: 20px;
	}

	.btn-spinner {
		width: 18px;
		height: 18px;
		border: 2px solid rgba(0, 0, 0, 0.2);
		border-top-color: rgba(0, 0, 0, 0.7);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	/* Warning banner */
	.warning-banner {
		display: flex;
		align-items: flex-start;
		gap: 0.875rem;
		padding: 1rem 1.25rem;
		background: rgba(250, 204, 21, 0.08);
		border: 1px solid rgba(250, 204, 21, 0.25);
		border-radius: 12px;
		width: 100%;
	}

	.warning-icon {
		flex-shrink: 0;
		width: 22px;
		height: 22px;
		color: hsl(45, 93%, 55%);
	}

	.warning-icon svg {
		width: 100%;
		height: 100%;
	}

	.warning-content {
		flex: 1;
	}

	.warning-title {
		margin: 0;
		font-size: 0.9rem;
		font-weight: 600;
		color: hsl(45, 93%, 65%);
	}

	.warning-text {
		margin: 0.25rem 0 0;
		font-size: 0.8rem;
		color: rgba(255, 255, 255, 0.55);
		line-height: 1.5;
	}

	/* Success banner */
	.success-banner {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.875rem 1rem;
		background: rgba(34, 197, 94, 0.12);
		border: 1px solid rgba(34, 197, 94, 0.3);
		border-radius: 10px;
		width: 100%;
		font-size: 0.9rem;
		color: hsl(142, 71%, 60%);
	}

	.success-banner svg {
		flex-shrink: 0;
		width: 20px;
		height: 20px;
	}

	/* Error banner */
	.error-banner {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.875rem 1rem;
		background: rgba(239, 68, 68, 0.12);
		border: 1px solid rgba(239, 68, 68, 0.3);
		border-radius: 10px;
		width: 100%;
		font-size: 0.875rem;
		color: hsl(0, 84%, 70%);
	}

	.error-banner svg {
		flex-shrink: 0;
		width: 18px;
		height: 18px;
	}

	/* Continue hint */
	.continue-hint {
		margin: 0;
		font-size: 0.85rem;
		color: rgba(255, 255, 255, 0.5);
		text-align: center;
	}

	/* Continue button */
	.continue-button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 0.75rem 1.5rem;
		font-size: 0.95rem;
		font-weight: 600;
		color: hsl(25, 20%, 10%);
		background: linear-gradient(135deg, hsl(35, 100%, 55%) 0%, hsl(25, 100%, 50%) 100%);
		border: none;
		border-radius: 10px;
		cursor: pointer;
		transition: all 0.25s cubic-bezier(0.22, 1, 0.36, 1);
		box-shadow:
			0 2px 12px rgba(255, 160, 50, 0.3),
			inset 0 1px 0 rgba(255, 255, 255, 0.2);
	}

	.continue-button:hover:not(:disabled) {
		transform: translateY(-1px);
		box-shadow:
			0 4px 16px rgba(255, 160, 50, 0.4),
			inset 0 1px 0 rgba(255, 255, 255, 0.25);
	}

	.continue-button:disabled {
		opacity: 0.4;
		cursor: not-allowed;
		transform: none;
		box-shadow: none;
	}

	.continue-button svg {
		width: 18px;
		height: 18px;
	}

	/* SVG gradient definition */
	:global(body) {
		--ring-gradient-start: hsl(35, 100%, 55%);
		--ring-gradient-end: hsl(25, 100%, 50%);
	}

	/* Responsive */
	@media (max-width: 480px) {
		.progress-wrapper {
			width: 120px;
			height: 120px;
		}

		.ring-icon {
			width: 40px;
			height: 40px;
		}

		.stats-row {
			gap: 1rem;
			padding: 0.625rem 1rem;
		}

		.stat-value {
			font-size: 1.25rem;
		}

		.start-button {
			width: 100%;
			min-width: unset;
		}
	}
</style>
