export type { LiveSyncProgress, LiveSyncStatus, SyncPhase } from '$lib/sync/types';

import type { LiveSyncProgress } from '$lib/sync/types';

let currentProgress: LiveSyncProgress | null = null;
let abortController: AbortController | null = null;

export function startSyncProgress(syncId: number): AbortSignal {
	abortController = new AbortController();

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

export function updateSyncProgress(
	update: Partial<Omit<LiveSyncProgress, 'syncId' | 'startedAt'>>
): void {
	if (currentProgress) {
		const filteredUpdate = Object.fromEntries(
			Object.entries(update).filter(([, value]) => value !== undefined)
		);
		currentProgress = {
			...currentProgress,
			...filteredUpdate
		};
	}
}

export function getSyncProgress(): LiveSyncProgress | null {
	return currentProgress;
}

export function cancelSync(): boolean {
	if (!currentProgress || currentProgress.status !== 'running') {
		return false;
	}

	if (abortController) {
		abortController.abort();
	}

	currentProgress = {
		...currentProgress,
		status: 'cancelled'
	};

	return true;
}

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

export function failSyncProgress(error: string): void {
	if (currentProgress) {
		currentProgress = {
			...currentProgress,
			status: 'failed',
			error
		};
	}
}

export function clearSyncProgress(): void {
	currentProgress = null;
	abortController = null;
}

export function hasSyncProgress(): boolean {
	return currentProgress !== null;
}
