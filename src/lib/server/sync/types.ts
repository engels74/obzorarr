import { z } from 'zod';

/**
 * Sync Service Types
 *
 * Type definitions for the sync service that fetches play history
 * from Plex and stores it in the database.
 *
 * @module sync/types
 */

// =============================================================================
// Sync Status Types
// =============================================================================

/**
 * Possible sync status values
 */
export const SyncStatusValue = {
	RUNNING: 'running',
	COMPLETED: 'completed',
	FAILED: 'failed'
} as const;

export type SyncStatusValue = (typeof SyncStatusValue)[keyof typeof SyncStatusValue];

/**
 * Options for starting a sync operation
 */
export interface StartSyncOptions {
	/**
	 * Year to backfill from (Jan 1 00:00:00 UTC of this year)
	 * If not provided, uses incremental sync from lastViewedAt
	 *
	 * Implements Requirement 2.6: Support backfilling from January 1st
	 */
	backfillYear?: number;

	/**
	 * Abort signal for cancellation
	 */
	signal?: AbortSignal;

	/**
	 * Callback for progress updates
	 */
	onProgress?: (progress: SyncProgress) => void;
}

/**
 * Sync operation phase
 */
export type SyncPhase = 'fetching' | 'enriching';

/**
 * Progress information during sync
 */
export interface SyncProgress {
	/** Number of records fetched from Plex */
	recordsProcessed: number;
	/** Number of new records inserted */
	recordsInserted: number;
	/** Number of duplicate records skipped */
	recordsSkipped: number;
	/** Current page number being processed */
	currentPage: number;
	/** Whether the sync is complete */
	isComplete: boolean;
	/** Current phase of the sync operation */
	phase?: SyncPhase;
	/** Total records needing enrichment (only during enriching phase) */
	enrichmentTotal?: number;
	/** Records processed during enrichment (only during enriching phase) */
	enrichmentProcessed?: number;
}

/**
 * Result of a completed sync operation
 */
export interface SyncResult {
	/** Database ID of the sync record */
	syncId: number;
	/** Final status of the sync */
	status: SyncStatusValue;
	/** Total records processed from Plex */
	recordsProcessed: number;
	/** Number of new records inserted */
	recordsInserted: number;
	/** Number of duplicate records skipped */
	recordsSkipped: number;
	/** Maximum viewedAt timestamp from synced records (Requirement 2.4) */
	lastViewedAt: number | null;
	/** When the sync started */
	startedAt: Date;
	/** When the sync completed */
	completedAt: Date;
	/** Error message if sync failed */
	error?: string;
	/** Duration of the sync in milliseconds */
	durationMs: number;
}

/**
 * Represents a sync status record from the database
 */
export interface SyncStatusRecord {
	id: number;
	startedAt: Date;
	completedAt: Date | null;
	recordsProcessed: number;
	lastViewedAt: number | null;
	status: SyncStatusValue;
	error: string | null;
}

// =============================================================================
// Scheduler Types
// =============================================================================

/**
 * Options for configuring the sync scheduler
 *
 * Implements Requirement 3.3: Use Croner with overrun protection
 */
export interface SchedulerOptions {
	/**
	 * Cron expression for sync schedule
	 * @default '0 0 * * *' (daily at midnight UTC)
	 */
	cronExpression?: string;

	/**
	 * Timezone for cron expression
	 * @default 'UTC'
	 */
	timezone?: string;

	/**
	 * Enable overrun protection (prevents overlapping runs)
	 * @default true
	 */
	protect?: boolean;

	/**
	 * Start scheduler immediately after creation
	 * @default true
	 */
	startImmediately?: boolean;
}

/**
 * Status information for the scheduler
 */
export interface SchedulerStatus {
	/** Whether the scheduler is currently active */
	isRunning: boolean;
	/** Whether the scheduler is paused */
	isPaused: boolean;
	/** Next scheduled run time */
	nextRun: Date | null;
	/** Previous run time */
	previousRun: Date | null;
	/** Current cron expression */
	cronExpression: string | null;
}

// =============================================================================
// Validation Schemas
// =============================================================================

/**
 * Zod schema for validating cron expressions
 *
 * Supports standard 5-field cron (minute, hour, day, month, weekday)
 * and optional 6-field cron (with seconds)
 */
export const CronExpressionSchema = z
	.string()
	.regex(
		/^(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)(\s+(\*|[0-9,\-\/]+))?$/,
		'Invalid cron expression'
	);
