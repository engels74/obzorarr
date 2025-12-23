<script lang="ts">
	import type { Snippet } from 'svelte';
	import { browser } from '$app/environment';
	import { invalidateAll } from '$app/navigation';
	import type { LayoutData } from './$types';
	import SyncLoadingOverlay from '$lib/components/SyncLoadingOverlay.svelte';
	import { createSyncStatusStore, type SyncStatusStore } from '$lib/stores/sync-status.svelte';

	/**
	 * Wrapped Layout
	 *
	 * Provides the wrapped theme data and real-time sync status to nested routes.
	 * The actual theme application is handled by the root layout,
	 * which reads the merged wrappedTheme data from this layout's server load.
	 *
	 * Shows a loading overlay during sync to prevent jarring content transitions.
	 * When sync completes, data is refreshed and overlay fades out smoothly.
	 */

	interface Props {
		children: Snippet;
		data: LayoutData;
	}

	let { children, data }: Props = $props();

	// ==========================================================================
	// Constants
	// ==========================================================================

	/** Minimum time to show loading overlay for consistent UX */
	const MIN_LOADING_DISPLAY_MS = 300;

	// ==========================================================================
	// Loading State
	// ==========================================================================

	/** Whether the loading overlay is visible */
	let isLoading = $state(true);

	/** Timestamp when loading started (for minimum display time calculation) */
	let loadingStartTime = $state(Date.now());

	/** Whether sync completion has been handled (prevents double-handling) */
	let syncCompletionHandled = $state(false);

	// ==========================================================================
	// Sync Status Store
	// ==========================================================================

	/** Sync status store instance */
	let syncStatusStore = $state<SyncStatusStore | null>(null);

	/**
	 * Hide loading overlay with minimum display time guarantee
	 */
	async function hideLoadingWithMinDelay(): Promise<void> {
		const elapsed = Date.now() - loadingStartTime;
		if (elapsed < MIN_LOADING_DISPLAY_MS) {
			await new Promise((r) => setTimeout(r, MIN_LOADING_DISPLAY_MS - elapsed));
		}
		isLoading = false;
	}

	/**
	 * Handle sync completion:
	 * 1. Keep overlay visible
	 * 2. Refresh data
	 * 3. Hide overlay with minimum delay
	 */
	async function handleSyncComplete(): Promise<void> {
		// Prevent double handling
		if (syncCompletionHandled) return;
		syncCompletionHandled = true;

		try {
			// Refresh data while overlay is still visible
			await invalidateAll();
		} finally {
			// Hide overlay after data refresh (with minimum delay)
			await hideLoadingWithMinDelay();
		}
	}

	// Create sync status store with reactive access to data.syncStatus
	// Using $effect ensures:
	// 1. Proper reactive access to data.syncStatus (fixes Svelte 5 warnings)
	// 2. Browser-only execution (SSR safety)
	// 3. Automatic cleanup on unmount or when data changes
	$effect(() => {
		// Access data.syncStatus inside effect for proper reactivity
		const syncStatus = data.syncStatus;

		if (!browser || !syncStatus) {
			syncStatusStore = null;
			return;
		}

		// Reset state for fresh effect run
		loadingStartTime = Date.now();
		syncCompletionHandled = false;

		// Create store with initial server data
		const store = createSyncStatusStore(
			{
				inProgress: syncStatus.inProgress,
				progress: syncStatus.progress
			},
			{
				onSyncComplete: handleSyncComplete
			}
		);
		syncStatusStore = store;

		// If no sync in progress, show brief loading then hide
		if (!syncStatus.inProgress) {
			// Use setTimeout to ensure we show loading for minimum time
			setTimeout(async () => {
				// Only hide if sync hasn't started in the meantime
				if (!store.inProgress && !syncCompletionHandled) {
					syncCompletionHandled = true;
					await hideLoadingWithMinDelay();
				}
			}, 0);
		}

		// Cleanup SSE connection when effect re-runs or component unmounts
		return () => {
			store.disconnect();
		};
	});

	// Use reactive store values if available, otherwise fall back to server data
	const inProgress = $derived(syncStatusStore?.inProgress ?? data.syncStatus?.inProgress ?? false);
	const progress = $derived(syncStatusStore?.progress ?? data.syncStatus?.progress ?? null);
</script>

<SyncLoadingOverlay visible={isLoading} {progress} syncInProgress={inProgress} />

{@render children()}
