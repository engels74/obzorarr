<script lang="ts">
	import type { Snippet } from 'svelte';
	import { browser } from '$app/environment';
	import type { LayoutData } from './$types';
	import SyncIndicator from '$lib/components/SyncIndicator.svelte';
	import { createSyncStatusStore } from '$lib/stores/sync-status.svelte';

	/**
	 * Wrapped Layout
	 *
	 * Provides the wrapped theme data and real-time sync status to nested routes.
	 * The actual theme application is handled by the root layout,
	 * which reads the merged wrappedTheme data from this layout's server load.
	 *
	 * Sync status is updated via SSE connection for real-time indicator updates.
	 */

	interface Props {
		children: Snippet;
		data: LayoutData;
	}

	let { children, data }: Props = $props();

	// Create sync status store with initial server data
	// Only create in browser to avoid SSR issues with EventSource
	const syncStatusStore = browser && data.syncStatus
		? createSyncStatusStore({
				inProgress: data.syncStatus.inProgress,
				progress: data.syncStatus.progress
			})
		: null;

	// Cleanup SSE connection on unmount
	$effect(() => {
		return () => {
			syncStatusStore?.disconnect();
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
