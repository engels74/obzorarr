import { Cron, type CronOptions } from 'croner';
import { startSync, isSyncRunning } from './service';
import type { SchedulerOptions, SchedulerStatus, SyncResult } from './types';
import { logger } from '$lib/server/logging';
import {
	startSyncProgress,
	updateSyncProgress as updateProgressStore,
	completeSyncProgress,
	failSyncProgress,
	clearSyncProgress
} from './progress';

const DEFAULT_CRON_EXPRESSION = '0 0 * * *';
const DEFAULT_TIMEZONE = 'UTC';
const JOB_NAME = 'plex-sync';
const PROGRESS_LOG_INTERVAL = 10;

let schedulerInstance: Cron | null = null;

export function setupSyncScheduler(options: SchedulerOptions = {}): Cron {
	const {
		cronExpression = DEFAULT_CRON_EXPRESSION,
		timezone = DEFAULT_TIMEZONE,
		protect = true,
		startImmediately = true
	} = options;

	if (schedulerInstance) {
		stopSyncScheduler();
	}

	const cronOptions: CronOptions = {
		name: JOB_NAME,
		timezone,
		protect,
		paused: !startImmediately,
		catch: (error: unknown, job: Cron) => {
			logger.error(`Sync job "${job.name}" failed: ${error}`, 'Scheduler');
		}
	};

	schedulerInstance = new Cron(cronExpression, cronOptions, async () => {
		logger.info(`Starting scheduled sync at ${new Date().toISOString()}`, 'Scheduler');

		try {
			if (await isSyncRunning()) {
				logger.info('Sync already in progress, skipping scheduled run', 'Scheduler');
				return;
			}

			const result = await startSync({
				onProgress: (progress) => {
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

export function stopSyncScheduler(): void {
	if (schedulerInstance) {
		schedulerInstance.stop();
		schedulerInstance = null;
		logger.info('Sync scheduler stopped', 'Scheduler');
	}
}

export function pauseSyncScheduler(): void {
	if (schedulerInstance) {
		schedulerInstance.pause();
		logger.info('Sync scheduler paused', 'Scheduler');
	}
}

export function resumeSyncScheduler(): void {
	if (schedulerInstance) {
		schedulerInstance.resume();
		logger.info('Sync scheduler resumed', 'Scheduler');
	}
}

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

export async function startBackgroundSync(
	backfillYear?: number
): Promise<{ started: boolean; error?: string }> {
	logger.info('Background sync triggered', 'ManualSync');

	if (await isSyncRunning()) {
		return { started: false, error: 'A sync is already in progress' };
	}

	// Use negative timestamp to distinguish from real DB IDs
	const tempSyncId = -Date.now();

	const signal = startSyncProgress(tempSyncId);

	startSync({
		backfillYear,
		signal,
		onProgress: (progress) => {
			updateProgressStore({
				recordsProcessed: progress.recordsProcessed,
				recordsInserted: progress.recordsInserted,
				recordsSkipped: progress.recordsSkipped,
				currentPage: progress.currentPage,
				phase: progress.phase,
				enrichmentTotal: progress.enrichmentTotal,
				enrichmentProcessed: progress.enrichmentProcessed
			});

			if (!progress.phase || progress.phase === 'fetching') {
				if (progress.currentPage % PROGRESS_LOG_INTERVAL === 0) {
					logger.info(
						`Progress: page ${progress.currentPage}, ${progress.recordsProcessed} records processed`,
						'ManualSync'
					);
				}
			}
		}
	})
		.then((result) => {
			if (result.status === 'completed') {
				completeSyncProgress(
					result.recordsProcessed,
					result.recordsInserted,
					result.recordsSkipped
				);
				logger.info(
					`Sync completed: ${result.recordsInserted} records inserted in ${result.durationMs}ms`,
					'ManualSync'
				);
			} else {
				failSyncProgress(result.error ?? 'Unknown error');
				logger.error(`Sync failed: ${result.error}`, 'ManualSync');
			}

			setTimeout(() => {
				clearSyncProgress();
			}, 5000);
		})
		.catch((error) => {
			const message = error instanceof Error ? error.message : 'Unknown error';

			if (message === 'Sync cancelled') {
				logger.info('Sync was cancelled by user', 'ManualSync');
			} else {
				failSyncProgress(message);
				logger.error(`Sync error: ${message}`, 'ManualSync');
			}

			setTimeout(() => {
				clearSyncProgress();
			}, 5000);
		});

	return { started: true };
}

export function updateSchedulerCron(cronExpression: string, timezone?: string): Cron {
	return setupSyncScheduler({
		cronExpression,
		timezone: timezone ?? DEFAULT_TIMEZONE,
		protect: true,
		startImmediately: true
	});
}

export function isSchedulerConfigured(): boolean {
	return schedulerInstance !== null;
}
