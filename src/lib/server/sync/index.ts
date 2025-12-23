/**
 * Sync Service Module
 *
 * Provides functionality for syncing play history from Plex Media Server.
 *
 * @module sync
 *
 * @example
 * ```typescript
 * import {
 *   startSync,
 *   setupSyncScheduler,
 *   triggerImmediateSync,
 *   triggerLiveSyncIfNeeded
 * } from '$lib/server/sync';
 *
 * // Start a manual sync
 * const result = await startSync({ backfillYear: 2024 });
 *
 * // Set up scheduled syncs
 * setupSyncScheduler({ cronExpression: '0 0 * * *' });
 *
 * // Trigger live sync on page access (non-blocking)
 * triggerLiveSyncIfNeeded('my-page').catch(() => {});
 * ```
 */

// =============================================================================
// Type Exports
// =============================================================================

export type {
	StartSyncOptions,
	SyncProgress,
	SyncResult,
	SyncStatusRecord,
	SchedulerOptions,
	SchedulerStatus
} from './types';

export { SyncStatusValue, CronExpressionSchema } from './types';

// =============================================================================
// Service Exports
// =============================================================================

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

// =============================================================================
// Scheduler Exports
// =============================================================================

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

// =============================================================================
// Progress Tracking Exports
// =============================================================================

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

// =============================================================================
// Live Sync Exports (Automatic sync on page access)
// =============================================================================

export type { LiveSyncResult, SyncStatus } from './live-sync';

export {
	triggerLiveSyncIfNeeded,
	isLiveSyncEnabled,
	canTriggerLiveSync,
	getTimeUntilNextSync,
	getLiveSyncCooldownMs,
	getSyncStatus,
	// Lock functions (for advanced use cases)
	tryAcquireSyncLock,
	releaseSyncLock,
	isSyncLockHeld,
	getSyncLockInfo,
	// Throttle functions
	recordLiveSyncCompletion
} from './live-sync';
