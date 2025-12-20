import { Cron, type CronOptions } from 'croner';
import { runRetentionCleanup, getLogRetentionDays, getLogMaxCount } from './service';
import { logger } from './logger';

/**
 * Log Retention Scheduler
 *
 * Croner-based scheduling for automatic log cleanup.
 * Runs daily at 3 AM UTC to delete old logs based on retention policy.
 *
 * Features:
 * - Time-based retention (delete logs older than X days)
 * - Count-based retention (keep max Y logs)
 * - Configurable via app settings
 */

// =============================================================================
// Constants
// =============================================================================

/**
 * Default cron expression: 3 AM UTC daily
 */
const DEFAULT_CRON_EXPRESSION = '0 3 * * *';

/**
 * Default timezone
 */
const DEFAULT_TIMEZONE = 'UTC';

/**
 * Job name
 */
const JOB_NAME = 'log-retention';

// =============================================================================
// Scheduler State
// =============================================================================

/**
 * Singleton scheduler instance
 */
let retentionScheduler: Cron | null = null;

// =============================================================================
// Scheduler Functions
// =============================================================================

/**
 * Set up the log retention scheduler
 *
 * Creates a Croner job that runs log cleanup at the specified schedule.
 *
 * @param cronExpression - Cron expression for cleanup schedule (default: daily at 3 AM)
 * @param timezone - Timezone for cron expression (default: UTC)
 * @returns The Cron job instance
 */
export function setupLogRetentionScheduler(
	cronExpression: string = DEFAULT_CRON_EXPRESSION,
	timezone: string = DEFAULT_TIMEZONE
): Cron {
	// Stop existing scheduler if running
	if (retentionScheduler) {
		stopLogRetentionScheduler();
	}

	const cronOptions: CronOptions = {
		name: JOB_NAME,
		timezone,
		protect: true, // Prevent overlapping runs
		catch: (error: unknown, job: Cron) => {
			logger.error(`Log retention job "${job.name}" failed: ${error}`, 'Retention');
		}
	};

	retentionScheduler = new Cron(cronExpression, cronOptions, async () => {
		logger.info(`Starting log retention cleanup`, 'Retention');

		try {
			const result = await runRetentionCleanup();

			logger.info(
				`Retention cleanup completed: ${result.byAge} deleted by age, ${result.byCount} deleted by count`,
				'Retention',
				result
			);
		} catch (error) {
			logger.error(`Retention cleanup failed: ${error}`, 'Retention');
		}
	});

	logger.info(
		`Log retention scheduler configured with cron "${cronExpression}" (timezone: ${timezone})`,
		'Retention'
	);

	return retentionScheduler;
}

/**
 * Stop the log retention scheduler
 */
export function stopLogRetentionScheduler(): void {
	if (retentionScheduler) {
		retentionScheduler.stop();
		retentionScheduler = null;
		logger.info('Log retention scheduler stopped', 'Retention');
	}
}

/**
 * Trigger immediate retention cleanup
 *
 * Useful for manual cleanup button in admin panel.
 *
 * @returns Cleanup result
 */
export async function triggerRetentionCleanup(): Promise<{ byAge: number; byCount: number }> {
	logger.info('Manual log retention cleanup triggered', 'Retention');
	return runRetentionCleanup();
}

/**
 * Get retention scheduler status
 *
 * @returns Current scheduler status
 */
export function getRetentionSchedulerStatus(): {
	isConfigured: boolean;
	isRunning: boolean;
	nextRun: Date | null;
	previousRun: Date | null;
} {
	if (!retentionScheduler) {
		return {
			isConfigured: false,
			isRunning: false,
			nextRun: null,
			previousRun: null
		};
	}

	return {
		isConfigured: true,
		isRunning: retentionScheduler.isRunning(),
		nextRun: retentionScheduler.nextRun() ?? null,
		previousRun: retentionScheduler.previousRun() ?? null
	};
}

/**
 * Check if retention scheduler is configured
 */
export function isRetentionSchedulerConfigured(): boolean {
	return retentionScheduler !== null;
}
