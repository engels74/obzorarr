export type LiveSyncStatus = 'running' | 'completed' | 'failed' | 'cancelled';

export type SyncPhase = 'fetching' | 'enriching';

export interface LiveSyncProgress {
	syncId: number;
	status: LiveSyncStatus;
	recordsProcessed: number;
	recordsInserted: number;
	recordsSkipped: number;
	currentPage: number;
	startedAt: Date;
	error?: string;
	phase?: SyncPhase;
	enrichmentTotal?: number;
	enrichmentProcessed?: number;
}
