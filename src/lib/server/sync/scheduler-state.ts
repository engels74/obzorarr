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

/** Tail of the queue of in-flight scheduler mutations. */
let schedulerMutationChain: Promise<unknown> = Promise.resolve();

/**
 * Runs `mutate` only after every previously queued scheduler mutation settled.
 *
 * Writing the durable state before touching the croner instance keeps a SINGLE
 * request consistent, but it cannot make the pair indivisible. Two overlapping
 * requests can both commit before either reaches its live change, and the live
 * change is not always symmetric with the row it just wrote: `resume` on a
 * scheduler another request has since stopped silently does nothing, leaving
 * `SYNC_SCHEDULER_STATE` claiming `running` for a process with no job. A
 * restart would then restore a state the admin never saw.
 *
 * Serializing the whole precondition/persist/apply triple removes that window:
 * every mutation observes the finished result of the previous one, so the row
 * and the live instance always agree once the queue drains.
 */
export function withSchedulerMutation<T>(mutate: () => Promise<T>): Promise<T> {
	const result = schedulerMutationChain.then(mutate, mutate);
	// Absorb rejections into the chain so one failed action cannot wedge every
	// later one, while callers still receive the original rejection.
	schedulerMutationChain = result.then(
		() => undefined,
		() => undefined
	);
	return result;
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
