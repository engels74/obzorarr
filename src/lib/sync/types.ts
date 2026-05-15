export type LiveSyncStatus = 'running' | 'completed' | 'failed' | 'cancelled';

export type SyncPhase = 'fetching' | 'enriching';

export type SyncTerminalEventType = 'completed' | 'failed' | 'cancelled' | 'idle';

export type SyncStatusStreamEventType = 'connected' | 'update' | SyncTerminalEventType;

export interface SyncStatusStreamProgress {
	phase: SyncPhase;
	recordsProcessed: number;
	recordsInserted?: number;
	enrichmentTotal?: number;
	enrichmentProcessed?: number;
}

export type SyncStatusStreamEvent =
	| {
			type: 'connected' | 'update';
			inProgress: boolean;
			progress: SyncStatusStreamProgress | null;
	  }
	| {
			type: SyncTerminalEventType;
			inProgress: false;
			progress: null;
	  };

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
