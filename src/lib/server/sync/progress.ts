/**
 * Sync Progress Store
 *
 * In-memory singleton for tracking sync progress and enabling cancellation.
 * Used by SSE endpoint to stream real-time progress to clients.
 *
 * @module sync/progress
 */

// Re-export types from shared location for backward compatibility
export type { LiveSyncStatus, SyncPhase, LiveSyncProgress } from '$lib/sync/types';

// Import types for local use
import type { LiveSyncProgress } from '$lib/sync/types';

// =============================================================================
// Singleton State
// =============================================================================

/**
 * Current sync progress (null when no sync is running)
 */
let currentProgress: LiveSyncProgress | null = null;

/**
 * AbortController for cancellation support
 */
let abortController: AbortController | null = null;

// =============================================================================
// Progress Store Functions
// =============================================================================

/**
 * Start tracking a new sync operation
 *
 * Creates a new progress record and AbortController.
 * Returns the AbortSignal to pass to startSync().
 *
 * @param syncId - Database ID of the sync record
 * @returns AbortSignal for cancellation support
 */
export function startSyncProgress(syncId: number): AbortSignal {
	// Create new abort controller
	abortController = new AbortController();

	// Initialize progress
	currentProgress = {
		syncId,
		status: 'running',
		recordsProcessed: 0,
		recordsInserted: 0,
		recordsSkipped: 0,
		currentPage: 0,
		startedAt: new Date()
	};

	return abortController.signal;
}

/**
 * Update the current sync progress
 *
 * @param update - Partial progress update
 */
export function updateSyncProgress(
	update: Partial<Omit<LiveSyncProgress, 'syncId' | 'startedAt'>>
): void {
	if (currentProgress) {
		currentProgress = {
			...currentProgress,
			...update
		};
	}
}

/**
 * Get the current sync progress
 *
 * @returns Current progress or null if no sync is running
 */
export function getSyncProgress(): LiveSyncProgress | null {
	return currentProgress;
}

/**
 * Cancel the currently running sync
 *
 * Triggers the AbortController and updates status to 'cancelled'.
 *
 * @returns true if a sync was cancelled, false if no sync was running
 */
export function cancelSync(): boolean {
	if (!currentProgress || currentProgress.status !== 'running') {
		return false;
	}

	// Trigger abort
	if (abortController) {
		abortController.abort();
	}

	// Update status
	currentProgress = {
		...currentProgress,
		status: 'cancelled'
	};

	return true;
}

/**
 * Mark the current sync as completed
 *
 * @param recordsProcessed - Final count of records processed
 * @param recordsInserted - Final count of records inserted
 * @param recordsSkipped - Final count of records skipped
 */
export function completeSyncProgress(
	recordsProcessed: number,
	recordsInserted: number,
	recordsSkipped: number
): void {
	if (currentProgress) {
		currentProgress = {
			...currentProgress,
			status: 'completed',
			recordsProcessed,
			recordsInserted,
			recordsSkipped
		};
	}
}

/**
 * Mark the current sync as failed
 *
 * @param error - Error message
 */
export function failSyncProgress(error: string): void {
	if (currentProgress) {
		currentProgress = {
			...currentProgress,
			status: 'failed',
			error
		};
	}
}

/**
 * Clear the progress store
 *
 * Should be called after the client has acknowledged completion/failure.
 */
export function clearSyncProgress(): void {
	currentProgress = null;
	abortController = null;
}

/**
 * Check if a sync is currently being tracked
 *
 * @returns true if progress is being tracked
 */
export function hasSyncProgress(): boolean {
	return currentProgress !== null;
}
