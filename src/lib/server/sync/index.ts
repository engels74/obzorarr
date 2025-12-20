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
 *   triggerImmediateSync
 * } from '$lib/server/sync';
 *
 * // Start a manual sync
 * const result = await startSync({ backfillYear: 2024 });
 *
 * // Set up scheduled syncs
 * setupSyncScheduler({ cronExpression: '0 0 * * *' });
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
	updateSchedulerCron,
	isSchedulerConfigured
} from './scheduler';
