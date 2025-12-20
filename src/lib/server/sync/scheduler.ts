import { Cron, type CronOptions } from 'croner';
import { startSync, isSyncRunning } from './service';
import type { SchedulerOptions, SchedulerStatus, SyncResult } from './types';
import { logger } from '$lib/server/logging';

/**
 * Sync Scheduler
 *
 * Croner-based scheduling for automatic sync operations.
 * Provides overrun protection and configurable cron expressions.
 *
 * Implements Requirement 3.3: Use Croner with overrun protection
 *
 * @module sync/scheduler
 */

// =============================================================================
// Constants
// =============================================================================

/**
 * Default cron expression: daily at midnight UTC
 */
const DEFAULT_CRON_EXPRESSION = '0 0 * * *';

/**
 * Default timezone for cron expression
 */
const DEFAULT_TIMEZONE = 'UTC';

/**
 * Name for the sync job
 */
const JOB_NAME = 'plex-sync';

/**
 * Log interval for progress updates (every N pages)
 */
const PROGRESS_LOG_INTERVAL = 10;

// =============================================================================
// Scheduler State
// =============================================================================

/**
 * Singleton scheduler instance
 */
let schedulerInstance: Cron | null = null;

// =============================================================================
// Scheduler Functions
// =============================================================================

/**
 * Set up the sync scheduler with Croner
 *
 * Creates a Croner job that runs sync at the specified schedule.
 * Uses overrun protection to prevent overlapping sync runs.
 *
 * Implements Requirement 3.3: Use Croner with overrun protection
 *
 * @param options - Scheduler configuration
 * @returns The Cron job instance
 */
export function setupSyncScheduler(options: SchedulerOptions = {}): Cron {
	const {
		cronExpression = DEFAULT_CRON_EXPRESSION,
		timezone = DEFAULT_TIMEZONE,
		protect = true,
		startImmediately = true
	} = options;

	// Stop existing scheduler if running
	if (schedulerInstance) {
		stopSyncScheduler();
	}

	const cronOptions: CronOptions = {
		name: JOB_NAME,
		timezone,
		protect, // Overrun protection - prevents overlapping runs
		paused: !startImmediately,
		catch: (error: unknown, job: Cron) => {
			logger.error(`Sync job "${job.name}" failed: ${error}`, 'Scheduler');
		}
	};

	schedulerInstance = new Cron(cronExpression, cronOptions, async () => {
		logger.info(`Starting scheduled sync at ${new Date().toISOString()}`, 'Scheduler');

		try {
			// Double-check no sync is running (extra safety with protect: true)
			if (await isSyncRunning()) {
				logger.info('Sync already in progress, skipping scheduled run', 'Scheduler');
				return;
			}

			const result = await startSync({
				onProgress: (progress) => {
					// Log progress periodically
					if (progress.currentPage % PROGRESS_LOG_INTERVAL === 0) {
						logger.info(
							`Progress: page ${progress.currentPage}, ${progress.recordsProcessed} records processed`,
							'Scheduler'
						);
					}
				}
			});

			if (result.status === 'completed') {
				logger.info(
					`Sync completed: ${result.recordsInserted} records inserted in ${result.durationMs}ms`,
					'Scheduler'
				);
			} else {
				logger.error(`Sync failed: ${result.error}`, 'Scheduler');
			}
		} catch (error) {
			logger.error(`Unexpected error during sync: ${error}`, 'Scheduler');
		}
	});

	logger.info(
		`Sync scheduler configured with cron "${cronExpression}" (timezone: ${timezone}, protect: ${protect})`,
		'Scheduler'
	);

	return schedulerInstance;
}

/**
 * Stop the sync scheduler
 *
 * Stops the Croner job and clears the scheduler instance.
 */
export function stopSyncScheduler(): void {
	if (schedulerInstance) {
		schedulerInstance.stop();
		schedulerInstance = null;
		logger.info('Sync scheduler stopped', 'Scheduler');
	}
}

/**
 * Pause the sync scheduler
 *
 * Pauses the scheduler without destroying it.
 * Can be resumed with resumeSyncScheduler().
 */
export function pauseSyncScheduler(): void {
	if (schedulerInstance) {
		schedulerInstance.pause();
		logger.info('Sync scheduler paused', 'Scheduler');
	}
}

/**
 * Resume the sync scheduler
 *
 * Resumes a paused scheduler.
 */
export function resumeSyncScheduler(): void {
	if (schedulerInstance) {
		schedulerInstance.resume();
		logger.info('Sync scheduler resumed', 'Scheduler');
	}
}

/**
 * Get scheduler status
 *
 * @returns Current scheduler status including next/previous run times
 */
export function getSchedulerStatus(): SchedulerStatus {
	if (!schedulerInstance) {
		return {
			isRunning: false,
			isPaused: false,
			nextRun: null,
			previousRun: null,
			cronExpression: null
		};
	}

	return {
		isRunning: schedulerInstance.isRunning(),
		isPaused: schedulerInstance.isStopped(),
		nextRun: schedulerInstance.nextRun() ?? null,
		previousRun: schedulerInstance.previousRun() ?? null,
		cronExpression: schedulerInstance.getPattern() ?? null
	};
}

/**
 * Trigger an immediate sync (outside of schedule)
 *
 * Useful for manual sync button in admin panel.
 * Runs in foreground and returns the result.
 *
 * @param backfillYear - Optional year to backfill from
 * @returns Result of the sync operation
 */
export async function triggerImmediateSync(backfillYear?: number): Promise<SyncResult> {
	logger.info('Manual sync triggered', 'Scheduler');

	return startSync({
		backfillYear,
		onProgress: (progress) => {
			if (progress.currentPage % PROGRESS_LOG_INTERVAL === 0) {
				logger.info(
					`Progress: page ${progress.currentPage}, ${progress.recordsProcessed} records processed`,
					'ManualSync'
				);
			}
		}
	});
}

/**
 * Update scheduler cron expression
 *
 * Restarts the scheduler with a new cron expression.
 *
 * @param cronExpression - New cron expression
 * @param timezone - Optional timezone (defaults to UTC)
 * @returns The new Cron job instance
 */
export function updateSchedulerCron(cronExpression: string, timezone?: string): Cron {
	return setupSyncScheduler({
		cronExpression,
		timezone: timezone ?? DEFAULT_TIMEZONE,
		protect: true,
		startImmediately: true
	});
}

/**
 * Check if scheduler is configured
 *
 * @returns True if a scheduler instance exists
 */
export function isSchedulerConfigured(): boolean {
	return schedulerInstance !== null;
}
