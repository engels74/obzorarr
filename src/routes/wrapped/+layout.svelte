<script lang="ts">
import type { Snippet } from 'svelte';
import { untrack } from 'svelte';
import { browser } from '$app/environment';
import { invalidateAll } from '$app/navigation';
import SyncLoadingOverlay from '$lib/components/SyncLoadingOverlay.svelte';
import { toast } from '$lib/services/toast';
import { createSyncStatusStore, type SyncStatusStore } from '$lib/stores/sync-status.svelte';
import type { SyncTerminalEventType } from '$lib/sync/types';
import type { LayoutData } from './$types';

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

type LayoutDataWithLookupSync = LayoutData & {
	lookupSyncStarted?: boolean;
	lookupSyncTriggered?: boolean;
};

let { children, data }: Props = $props();

function hasLookupSyncMarker(layoutData: LayoutData): boolean {
	const lookupData = layoutData as LayoutDataWithLookupSync;
	return Boolean(lookupData.lookupSyncTriggered ?? lookupData.lookupSyncStarted);
}

// ==========================================================================
// Constants
// ==========================================================================

/** Minimum time to show loading overlay for consistent UX */
const MIN_LOADING_DISPLAY_MS = 300;
const FAILED_LIVE_SYNC_MESSAGE =
	"Couldn't refresh your viewing history from Plex. Showing your most recent data.";

// ==========================================================================
// Loading State
// ==========================================================================

/** Whether the loading overlay is visible */
let isLoading = $state(untrack(() => data.syncStatus?.inProgress ?? false));

/** Timestamp when loading started (for minimum display time calculation) */
let loadingStartTime = $state(Date.now());

/** Whether sync completion has been handled (prevents double-handling) */
let syncCompletionHandled = $state(false);

const initialLookupSyncMarker = untrack(() => hasLookupSyncMarker(data));

/** Whether the current page load came from a landing-page lookup sync trigger */
let lookupSyncFeedbackPending = $state(initialLookupSyncMarker);

/** Prevents repeatedly re-arming the same server-provided lookup marker */
let lookupSyncMarkerSeen = $state(initialLookupSyncMarker);

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
function consumeLookupSyncMarker(event: SyncTerminalEventType): boolean {
	if (!lookupSyncFeedbackPending) return false;
	if (event !== 'failed') return false;
	lookupSyncFeedbackPending = false;
	return true;
}

async function handleSyncComplete(event: SyncTerminalEventType): Promise<void> {
	lookupSyncFeedbackPending = false;

	// Prevent double handling
	if (syncCompletionHandled) return;
	syncCompletionHandled = true;
	if (!isLoading) {
		loadingStartTime = Date.now();
		isLoading = true;
	}

	try {
		// Refresh data while overlay is still visible
		await invalidateAll();
	} finally {
		if (event === 'failed') {
			toast.error(FAILED_LIVE_SYNC_MESSAGE);
		}
		// Hide overlay after data refresh (with minimum delay)
		await hideLoadingWithMinDelay();
		syncCompletionHandled = false;
	}
}

$effect(() => {
	const lookupSyncStarted = hasLookupSyncMarker(data);

	if (lookupSyncStarted && !lookupSyncMarkerSeen) {
		lookupSyncFeedbackPending = true;
		lookupSyncMarkerSeen = true;
	}

	if (!lookupSyncStarted) {
		lookupSyncMarkerSeen = false;
		lookupSyncFeedbackPending = false;
	}
});

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

	// Reset state for fresh effect run unless sync completion is coordinating invalidation
	if (!syncCompletionHandled) {
		loadingStartTime = Date.now();
		isLoading = syncStatus.inProgress;
	}

	// Create store with initial server data
	const store = createSyncStatusStore(
		{
			inProgress: syncStatus.inProgress,
			progress: syncStatus.progress
		},
		{
			onSyncComplete: handleSyncComplete,
			shouldHandleTerminalEvent: consumeLookupSyncMarker
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

<SyncLoadingOverlay visible={isLoading || inProgress} {progress} syncInProgress={inProgress} />

{@render children()}
