<script lang="ts">
	import type { Snippet } from 'svelte';
	import { browser } from '$app/environment';
	import { invalidateAll } from '$app/navigation';
	import type { LayoutData } from './$types';
	import SyncIndicator from '$lib/components/SyncIndicator.svelte';
	import { createSyncStatusStore, type SyncStatusStore } from '$lib/stores/sync-status.svelte';

	/**
	 * Wrapped Layout
	 *
	 * Provides the wrapped theme data and real-time sync status to nested routes.
	 * The actual theme application is handled by the root layout,
	 * which reads the merged wrappedTheme data from this layout's server load.
	 *
	 * Sync status is updated via SSE connection for real-time indicator updates.
	 * When sync completes, page data is automatically refreshed.
	 */

	interface Props {
		children: Snippet;
		data: LayoutData;
	}

	let { children, data }: Props = $props();

	// Sync status store instance - using $state for reactivity with $derived
	let syncStatusStore = $state<SyncStatusStore | null>(null);

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

		// Create store with initial server data
		// When sync completes, invalidate all data to refresh stats
		const store = createSyncStatusStore(
			{
				inProgress: syncStatus.inProgress,
				progress: syncStatus.progress
			},
			{
				onSyncComplete: () => {
					invalidateAll();
				}
			}
		);
		syncStatusStore = store;

		// Cleanup SSE connection when effect re-runs or component unmounts
		return () => {
			store.disconnect();
		};
	});

	// Use reactive store values if available, otherwise fall back to server data
	const inProgress = $derived(syncStatusStore?.inProgress ?? data.syncStatus?.inProgress ?? false);
	const progress = $derived(syncStatusStore?.progress ?? data.syncStatus?.progress ?? null);
</script>

{@render children()}

{#if inProgress}
	<SyncIndicator {inProgress} {progress} />
{/if}
