import type { Cron } from 'croner';
import { validateCronExpression } from '$lib/cron/validation';
import {
	AppSettingsKey,
	getAppSetting,
	getSchedulerTimezone,
	setAppSetting
} from '$lib/server/admin/settings.service';
import { logger } from '$lib/server/logging';
import {
	DEFAULT_CRON_EXPRESSION,
	getSchedulerStatus,
	isSchedulerConfigured,
	setupSyncScheduler,
	updateSchedulerTimezone
} from './scheduler';

/**
 * Operator intent for the sync scheduler, persisted in `app_settings`.
 *
 * The croner instance is process memory only, so without this row a container
 * restart (image update, host reboot) silently dropped the automatic sync an
 * admin had configured: the cron expression survived in the database while the
 * job that ran it did not.
 */
export const SyncSchedulerState = {
	RUNNING: 'running',
	PAUSED: 'paused',
	STOPPED: 'stopped'
} as const;

export type SyncSchedulerStateType = (typeof SyncSchedulerState)[keyof typeof SyncSchedulerState];

function parseSchedulerState(value: string | null): SyncSchedulerStateType | null {
	return value !== null && (Object.values(SyncSchedulerState) as string[]).includes(value)
		? (value as SyncSchedulerStateType)
		: null;
}

export async function persistSyncSchedulerState(state: SyncSchedulerStateType): Promise<void> {
	await setAppSetting(AppSettingsKey.SYNC_SCHEDULER_STATE, state);
}

export async function readSyncSchedulerState(): Promise<SyncSchedulerStateType | null> {
	return parseSchedulerState(await getAppSetting(AppSettingsKey.SYNC_SCHEDULER_STATE));
}

/**
 * Rebuilds the in-memory scheduler from the persisted expression, timezone and
 * run state. Called once from `initializeServer` before the first request.
 *
 * Installs that configured a schedule before the run state was persisted only
 * have the cron row. Saving an expression has always been an explicit "run my
 * syncs automatically" action, so such an install restores as RUNNING and the
 * state row is backfilled; an instance that never configured one stays
 * inactive.
 */
export async function restoreSyncScheduler(timezone?: string): Promise<Cron | null> {
	const [storedState, storedCron] = await Promise.all([
		readSyncSchedulerState(),
		getAppSetting(AppSettingsKey.SYNC_CRON_EXPRESSION)
	]);

	const state =
		storedState ?? (storedCron ? SyncSchedulerState.RUNNING : SyncSchedulerState.STOPPED);
	if (state === SyncSchedulerState.STOPPED) {
		return null;
	}

	const cronExpression = storedCron ?? DEFAULT_CRON_EXPRESSION;
	const cronError = validateCronExpression(cronExpression);
	if (cronError) {
		// A hand-edited or corrupted row must not take the server down on boot.
		logger.error(
			`Stored sync schedule "${cronExpression}" is invalid (${cronError}); scheduler not restored`,
			'Scheduler'
		);
		return null;
	}

	if (storedState !== state) {
		await persistSyncSchedulerState(state);
	}

	const scheduler = setupSyncScheduler({
		cronExpression,
		timezone: timezone ?? (await getSchedulerTimezone()),
		protect: true,
		startImmediately: state === SyncSchedulerState.RUNNING
	});
	logger.info(`Restored sync scheduler in "${state}" state`, 'Scheduler');
	return scheduler;
}

/**
 * Applies a newly saved timezone to the live scheduler so the change takes
 * effect without a restart. The stored expression and run state are preserved.
 */
export function applySyncSchedulerTimezone(timezone: string): void {
	if (!isSchedulerConfigured()) {
		return;
	}
	const { cronExpression } = getSchedulerStatus();
	logger.info(
		`Applying timezone ${timezone} to the sync schedule "${cronExpression ?? DEFAULT_CRON_EXPRESSION}"`,
		'Scheduler'
	);
	updateSchedulerTimezone(timezone);
}
