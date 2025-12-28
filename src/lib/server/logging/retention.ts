import { Cron, type CronOptions } from 'croner';
import { runRetentionCleanup, getLogRetentionDays, getLogMaxCount } from './service';
import { logger } from './logger';

const DEFAULT_CRON_EXPRESSION = '0 3 * * *';
const DEFAULT_TIMEZONE = 'UTC';
const JOB_NAME = 'log-retention';

let retentionScheduler: Cron | null = null;

export function setupLogRetentionScheduler(
	cronExpression: string = DEFAULT_CRON_EXPRESSION,
	timezone: string = DEFAULT_TIMEZONE
): Cron {
	if (retentionScheduler) {
		stopLogRetentionScheduler();
	}

	const cronOptions: CronOptions = {
		name: JOB_NAME,
		timezone,
		protect: true,
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

export function stopLogRetentionScheduler(): void {
	if (retentionScheduler) {
		retentionScheduler.stop();
		retentionScheduler = null;
		logger.info('Log retention scheduler stopped', 'Retention');
	}
}

export async function triggerRetentionCleanup(): Promise<{ byAge: number; byCount: number }> {
	logger.info('Manual log retention cleanup triggered', 'Retention');
	return runRetentionCleanup();
}

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

export function isRetentionSchedulerConfigured(): boolean {
	return retentionScheduler !== null;
}
