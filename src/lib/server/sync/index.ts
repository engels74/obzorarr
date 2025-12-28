export type {
	StartSyncOptions,
	SyncProgress,
	SyncResult,
	SyncStatusRecord,
	SchedulerOptions,
	SchedulerStatus
} from './types';

export { SyncStatusValue, CronExpressionSchema } from './types';

export {
	startSync,
	getLastSuccessfulSync,
	getRunningSync,
	isSyncRunning,
	getSyncHistory,
	getPlayHistoryCount,
	getYearStartTimestamp,
	SyncError
} from './service';

export {
	setupSyncScheduler,
	stopSyncScheduler,
	pauseSyncScheduler,
	resumeSyncScheduler,
	getSchedulerStatus,
	triggerImmediateSync,
	startBackgroundSync,
	updateSchedulerCron,
	isSchedulerConfigured
} from './scheduler';

export type { LiveSyncProgress, LiveSyncStatus } from './progress';

export {
	startSyncProgress,
	updateSyncProgress,
	getSyncProgress,
	cancelSync,
	completeSyncProgress,
	failSyncProgress,
	clearSyncProgress,
	hasSyncProgress
} from './progress';

export type { LiveSyncResult, SyncStatus } from './live-sync';

export {
	triggerLiveSyncIfNeeded,
	isLiveSyncEnabled,
	canTriggerLiveSync,
	getTimeUntilNextSync,
	getLiveSyncCooldownMs,
	getSyncStatus,
	tryAcquireSyncLock,
	releaseSyncLock,
	isSyncLockHeld,
	getSyncLockInfo,
	recordLiveSyncCompletion
} from './live-sync';
