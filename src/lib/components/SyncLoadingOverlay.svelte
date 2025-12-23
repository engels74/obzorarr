<script lang="ts">
	/**
	 * Sync Loading Overlay Component
	 *
	 * Displays a full-page loading overlay when sync is in progress.
	 * Used on wrapped pages to block stale content during data sync.
	 *
	 * Features:
	 * - Full viewport coverage with themed background
	 * - Centered loading spinner with progress text
	 * - Respects prefers-reduced-motion
	 * - Accessible with ARIA attributes
	 * - Smooth fade-in/fade-out transitions
	 *
	 * @module components/SyncLoadingOverlay
	 */

	import type { LiveSyncProgress } from '$lib/server/sync/progress';
	import { prefersReducedMotion } from 'svelte/motion';
	import { fade } from 'svelte/transition';

	interface Props {
		/** Whether the overlay should be visible */
		visible: boolean;
		/** Current sync progress data */
		progress?: LiveSyncProgress | null;
		/** Whether sync is actually in progress (vs just showing loading state) */
		syncInProgress?: boolean;
	}

	let { visible, progress = null, syncInProgress = false }: Props = $props();

	// Transition duration respecting reduced motion preference
	const transitionDuration = $derived(prefersReducedMotion.current ? 0 : 300);

	// Derive status text based on sync phase
	const statusText = $derived.by(() => {
		if (!syncInProgress || !progress) {
			return 'Loading your wrapped...';
		}

		if (progress.phase === 'enriching') {
			const percent =
				progress.enrichmentTotal && progress.enrichmentTotal > 0
					? Math.round(((progress.enrichmentProcessed ?? 0) / progress.enrichmentTotal) * 100)
					: 0;
			return `Enriching metadata... ${percent}%`;
		}

		if (progress.recordsProcessed > 0) {
			return `Syncing... ${progress.recordsProcessed} records`;
		}

		return 'Syncing your viewing history...';
	});

	// Secondary status text for additional context
	const secondaryText = $derived.by(() => {
		if (!syncInProgress) {
			return 'Preparing your year in review';
		}
		return 'This may take a moment';
	});
</script>

{#if visible}
	<div
		class="sync-loading-overlay"
		role="status"
		aria-live="polite"
		aria-busy="true"
		transition:fade={{ duration: transitionDuration }}
	>
		<div class="loading-content">
			<div class="spinner-container">
				<span class="spinner" aria-hidden="true"></span>
			</div>
			<p class="status-text">{statusText}</p>
			<p class="secondary-text">{secondaryText}</p>
		</div>
	</div>
{/if}

<style>
	.sync-loading-overlay {
		position: fixed;
		inset: 0;
		z-index: 200;
		display: flex;
		align-items: center;
		justify-content: center;
		background: hsl(var(--background, 0 0% 4%));
	}

	.loading-content {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1.5rem;
		text-align: center;
		padding: 2rem;
	}

	.spinner-container {
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.spinner {
		width: 3rem;
		height: 3rem;
		border: 3px solid hsl(var(--primary, 0 70% 50%) / 0.2);
		border-top-color: hsl(var(--primary, 0 70% 50%));
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	.status-text {
		font-size: 1.25rem;
		font-weight: 500;
		color: hsl(var(--foreground, 0 0% 98%));
		margin: 0;
	}

	.secondary-text {
		font-size: 0.875rem;
		color: hsl(var(--muted-foreground, 0 0% 64%));
		margin: 0;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.spinner {
			animation: none;
			border-style: dotted;
			border-width: 4px;
		}
	}
</style>
