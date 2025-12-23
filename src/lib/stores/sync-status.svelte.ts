/**
 * Sync Status Store
 *
 * Reactive store for real-time sync status updates via SSE.
 * Used by wrapped pages to show SyncIndicator with live updates.
 *
 * Uses Svelte 5 runes for reactivity.
 *
 * @module stores/sync-status
 */

import { browser } from '$app/environment';
import type { LiveSyncProgress } from '$lib/server/sync/progress';

/**
 * Simplified progress data from SSE
 */
interface SimpleProgress {
	phase: 'fetching' | 'enriching';
	recordsProcessed: number;
	enrichmentTotal?: number;
	enrichmentProcessed?: number;
}

/**
 * SSE event data structure
 */
interface SSEEventData {
	type: 'connected' | 'update' | 'completed' | 'idle';
	inProgress: boolean;
	progress: SimpleProgress | null;
}

/**
 * Initial sync status from server load
 */
export interface InitialSyncStatus {
	inProgress: boolean;
	progress: LiveSyncProgress | null;
}

/**
 * Options for sync status store
 */
export interface SyncStatusStoreOptions {
	/** Callback fired when sync completes (useful for data invalidation) */
	onSyncComplete?: () => void;
}

/**
 * Convert simplified SSE progress to LiveSyncProgress-compatible format
 * Only includes fields needed by SyncIndicator
 */
function toCompatibleProgress(simple: SimpleProgress | null): LiveSyncProgress | null {
	if (!simple) return null;

	return {
		syncId: 0, // Not used by SyncIndicator
		status: 'running',
		recordsProcessed: simple.recordsProcessed,
		recordsInserted: 0, // Not used by SyncIndicator
		recordsSkipped: 0, // Not used by SyncIndicator
		currentPage: 0, // Not used by SyncIndicator
		startedAt: new Date(), // Not used by SyncIndicator
		phase: simple.phase,
		enrichmentTotal: simple.enrichmentTotal,
		enrichmentProcessed: simple.enrichmentProcessed
	};
}

/**
 * Sync status store class
 *
 * Manages SSE connection and reactive sync status state.
 */
export class SyncStatusStore {
	/** Whether a sync is currently in progress */
	inProgress = $state(false);

	/** Current sync progress data (compatible with SyncIndicator) */
	progress = $state<LiveSyncProgress | null>(null);

	/** SSE connection */
	private eventSource: EventSource | null = null;

	/** Whether SSE is connected */
	private connected = false;

	/** Callback for sync completion */
	private onSyncComplete?: () => void;

	/** Track if we were syncing (to detect completion) */
	private wasSyncing = false;

	/**
	 * Initialize store with server-loaded status and start SSE connection
	 *
	 * @param initialStatus - Initial status from server load
	 * @param options - Store options including callbacks
	 */
	initialize(initialStatus: InitialSyncStatus, options?: SyncStatusStoreOptions): void {
		this.inProgress = initialStatus.inProgress;
		this.progress = initialStatus.progress;
		this.onSyncComplete = options?.onSyncComplete;
		this.wasSyncing = initialStatus.inProgress;

		// Only connect in browser
		if (browser) {
			this.connect();
		}
	}

	/**
	 * Connect to SSE endpoint
	 */
	private connect(): void {
		if (this.eventSource) {
			this.eventSource.close();
		}

		this.eventSource = new EventSource('/api/sync/status/stream');

		this.eventSource.onopen = () => {
			this.connected = true;
		};

		this.eventSource.onmessage = (event) => {
			try {
				const data: SSEEventData = JSON.parse(event.data);

				if (data.type === 'connected' || data.type === 'update') {
					this.inProgress = data.inProgress;
					this.progress = toCompatibleProgress(data.progress);
					// Track syncing state
					if (data.inProgress) {
						this.wasSyncing = true;
					}
				} else if (data.type === 'completed' || data.type === 'idle') {
					// Fire callback if sync just completed (was syncing -> now idle)
					if (this.wasSyncing && this.onSyncComplete) {
						// Small delay to let server finish cleanup
						setTimeout(() => {
							this.onSyncComplete?.();
						}, 500);
					}
					this.inProgress = false;
					this.progress = null;
					this.wasSyncing = false;
				}
			} catch {
				// Silently ignore parse errors
			}
		};

		this.eventSource.onerror = () => {
			this.connected = false;
			// Attempt to reconnect after 3 seconds
			setTimeout(() => {
				if (browser && !this.eventSource) {
					this.connect();
				}
			}, 3000);
		};
	}

	/**
	 * Disconnect from SSE endpoint
	 */
	disconnect(): void {
		if (this.eventSource) {
			this.eventSource.close();
			this.eventSource = null;
		}
		this.connected = false;
	}

	/**
	 * Reset store state
	 */
	reset(): void {
		this.disconnect();
		this.inProgress = false;
		this.progress = null;
	}
}

/**
 * Create a new sync status store instance
 *
 * Use this to create an isolated store for wrapped pages.
 *
 * @param initialStatus - Initial status from server load
 * @param options - Store options including callbacks
 * @returns Initialized store instance
 */
export function createSyncStatusStore(
	initialStatus: InitialSyncStatus,
	options?: SyncStatusStoreOptions
): SyncStatusStore {
	const store = new SyncStatusStore();
	store.initialize(initialStatus, options);
	return store;
}
