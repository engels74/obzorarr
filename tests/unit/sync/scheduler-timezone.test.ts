import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { env } from '$env/dynamic/private';
// Namespace import so the persist-failure test can spy on the live `setAppSetting`
// binding without `mock.module` (which is process-global and leaks across files).
import * as settingsService from '$lib/server/admin/settings.service';
import {
	AppSettingsKey,
	clearConflictingDbSettings,
	getAppSetting,
	getSchedulerTimezone,
	getSchedulerTimezoneConfigWithSource,
	setAppSetting,
	setSchedulerTimezone
} from '$lib/server/admin/settings.service';
import {
	getSchedulerStatus,
	isSchedulerConfigured,
	setupSyncScheduler,
	stopSyncScheduler
} from '$lib/server/sync/scheduler';
import {
	persistSyncSchedulerState,
	readSyncSchedulerState,
	restoreSyncScheduler,
	SyncSchedulerState
} from '$lib/server/sync/scheduler-state';
import { actions } from '../../../src/routes/admin/sync/+page.server';
import { resetSharedTestDb } from '../../helpers/db';

type InitSchedulerAction = NonNullable<typeof actions.initScheduler>;
type UpdateScheduleAction = NonNullable<typeof actions.updateSchedule>;
type PauseSchedulerAction = NonNullable<typeof actions.pauseScheduler>;
type ResumeSchedulerAction = NonNullable<typeof actions.resumeScheduler>;
type StopSchedulerAction = NonNullable<typeof actions.stopScheduler>;

const adminLocals = {
	user: { id: 1, plexId: 1, username: 'admin', isAdmin: true }
} as unknown as App.Locals;

function envRecord(): Record<string, string | undefined> {
	return env as unknown as Record<string, string | undefined>;
}

function formRequest(action: string, fields: Record<string, string> = {}): Request {
	const formData = new FormData();
	for (const [key, value] of Object.entries(fields)) formData.set(key, value);
	return new Request(`http://localhost/admin/sync?/${action}`, {
		method: 'POST',
		body: formData
	});
}

function runAction<T extends (arg: never) => unknown>(handler: T, request: Request) {
	return (handler as unknown as (arg: { request: Request; locals: App.Locals }) => ReturnType<T>)({
		request,
		locals: adminLocals
	});
}

/** Wall-clock `HH:mm` of `date` as read in `timezone`. */
function localTimeIn(date: Date, timezone: string): string {
	return new Intl.DateTimeFormat('en-GB', {
		timeZone: timezone,
		hour: '2-digit',
		minute: '2-digit',
		hourCycle: 'h23'
	}).format(date);
}

beforeEach(async () => {
	await resetSharedTestDb();
	stopSyncScheduler();
	delete envRecord().TZ;
});

afterEach(() => {
	stopSyncScheduler();
	delete envRecord().TZ;
});

describe('scheduler timezone resolution (TZ env over DB)', () => {
	it('defaults to UTC when neither TZ nor a stored row exists', async () => {
		const config = await getSchedulerTimezoneConfigWithSource();

		expect(config.timezone).toEqual({ value: 'UTC', source: 'default', isLocked: false });
	});

	it('uses the stored row when TZ is unset, leaving the field editable', async () => {
		await setAppSetting(AppSettingsKey.SCHEDULER_TIMEZONE, 'America/New_York');

		const config = await getSchedulerTimezoneConfigWithSource();

		expect(config.timezone).toEqual({
			value: 'America/New_York',
			source: 'db',
			isLocked: false
		});
		expect(await getSchedulerTimezone()).toBe('America/New_York');
	});

	it('lets TZ shadow the stored row and lock the field', async () => {
		await setAppSetting(AppSettingsKey.SCHEDULER_TIMEZONE, 'America/New_York');
		envRecord().TZ = 'Europe/Copenhagen';

		const config = await getSchedulerTimezoneConfigWithSource();

		expect(config.timezone).toEqual({
			value: 'Europe/Copenhagen',
			source: 'env',
			isLocked: true
		});
	});

	it('canonicalizes a lowercase TZ value', async () => {
		envRecord().TZ = 'europe/copenhagen';

		expect(await getSchedulerTimezone()).toBe('Europe/Copenhagen');
	});

	it('ignores an unknown TZ instead of locking the field to it', async () => {
		await setAppSetting(AppSettingsKey.SCHEDULER_TIMEZONE, 'America/New_York');
		envRecord().TZ = 'Mars/Olympus_Mons';

		const config = await getSchedulerTimezoneConfigWithSource();

		expect(config.timezone).toEqual({
			value: 'America/New_York',
			source: 'db',
			isLocked: false
		});
	});

	it('falls back to the default when the stored row is not a known zone', async () => {
		await setAppSetting(AppSettingsKey.SCHEDULER_TIMEZONE, 'Not/AZone');

		expect(await getSchedulerTimezone()).toBe('UTC');
	});

	it('stores the canonical identifier and rejects an unknown zone', async () => {
		const written = await setSchedulerTimezone('europe/copenhagen');

		expect(written.timezone).toBe('Europe/Copenhagen');
		expect(await getAppSetting(AppSettingsKey.SCHEDULER_TIMEZONE)).toBe('Europe/Copenhagen');
		expect(setSchedulerTimezone('Mars/Olympus_Mons')).rejects.toThrow();
	});
});

describe('startup reconciliation of the timezone row', () => {
	it('drops the shadowed DB row when TZ is authoritative', async () => {
		await setAppSetting(AppSettingsKey.SCHEDULER_TIMEZONE, 'America/New_York');
		envRecord().TZ = 'Europe/Copenhagen';

		const cleared = await clearConflictingDbSettings();

		expect(cleared).toContain('TZ');
		expect(await getAppSetting(AppSettingsKey.SCHEDULER_TIMEZONE)).toBeNull();
	});

	it('keeps the DB row when TZ is unset or unusable', async () => {
		await setAppSetting(AppSettingsKey.SCHEDULER_TIMEZONE, 'America/New_York');
		envRecord().TZ = 'Mars/Olympus_Mons';

		const cleared = await clearConflictingDbSettings();

		expect(cleared).not.toContain('TZ');
		expect(await getAppSetting(AppSettingsKey.SCHEDULER_TIMEZONE)).toBe('America/New_York');
	});
});

describe('sync scheduler runs in the configured timezone', () => {
	it('interprets the cron expression in the configured zone', () => {
		const cron = setupSyncScheduler({
			cronExpression: '0 0 * * *',
			timezone: 'Europe/Copenhagen',
			startImmediately: true
		});

		expect(cron.options.timezone).toBe('Europe/Copenhagen');
		const nextRun = getSchedulerStatus().nextRun;
		expect(nextRun).not.toBeNull();
		expect(localTimeIn(nextRun!, 'Europe/Copenhagen')).toBe('00:00');
	});

	it('initScheduler builds the job with the TZ-configured zone', async () => {
		envRecord().TZ = 'Europe/Copenhagen';

		const result = await runAction(
			actions.initScheduler as InitSchedulerAction,
			formRequest('initScheduler', { cronExpression: '0 0 * * *' })
		);

		expect(result).toMatchObject({ success: true });
		const nextRun = getSchedulerStatus().nextRun;
		expect(nextRun).not.toBeNull();
		expect(localTimeIn(nextRun!, 'Europe/Copenhagen')).toBe('00:00');
	});

	it('keeps the configured zone when only the cron expression changes', async () => {
		envRecord().TZ = 'Europe/Copenhagen';
		await runAction(
			actions.initScheduler as InitSchedulerAction,
			formRequest('initScheduler', { cronExpression: '0 0 * * *' })
		);

		const result = await runAction(
			actions.updateSchedule as UpdateScheduleAction,
			formRequest('updateSchedule', { cronExpression: '0 4 * * *' })
		);

		expect(result).toMatchObject({ success: true });
		const status = getSchedulerStatus();
		expect(status.cronExpression).toBe('0 4 * * *');
		expect(localTimeIn(status.nextRun!, 'Europe/Copenhagen')).toBe('04:00');
	});

	it('falls back to UTC when nothing is configured', async () => {
		await runAction(
			actions.initScheduler as InitSchedulerAction,
			formRequest('initScheduler', { cronExpression: '0 0 * * *' })
		);

		expect(localTimeIn(getSchedulerStatus().nextRun!, 'UTC')).toBe('00:00');
	});
});

describe('scheduler run state survives a restart', () => {
	it('restores a RUNNING schedule with the configured expression and zone', async () => {
		envRecord().TZ = 'Europe/Copenhagen';
		await setAppSetting(AppSettingsKey.SYNC_CRON_EXPRESSION, '30 2 * * *');
		await persistSyncSchedulerState(SyncSchedulerState.RUNNING);

		await restoreSyncScheduler();

		const status = getSchedulerStatus();
		expect(status.isRunning).toBe(true);
		expect(status.isPaused).toBe(false);
		expect(status.cronExpression).toBe('30 2 * * *');
		expect(localTimeIn(status.nextRun!, 'Europe/Copenhagen')).toBe('02:30');
	});

	it('restores a PAUSED schedule without resuming it', async () => {
		await setAppSetting(AppSettingsKey.SYNC_CRON_EXPRESSION, '0 5 * * *');
		await persistSyncSchedulerState(SyncSchedulerState.PAUSED);

		await restoreSyncScheduler();

		const status = getSchedulerStatus();
		expect(status.isPaused).toBe(true);
		expect(status.isRunning).toBe(false);
		expect(status.cronExpression).toBe('0 5 * * *');
	});

	it('leaves a STOPPED instance inactive', async () => {
		await setAppSetting(AppSettingsKey.SYNC_CRON_EXPRESSION, '0 5 * * *');
		await persistSyncSchedulerState(SyncSchedulerState.STOPPED);

		expect(await restoreSyncScheduler()).toBeNull();
		expect(isSchedulerConfigured()).toBe(false);
	});

	it('treats a pre-existing cron row without a state row as RUNNING and backfills it', async () => {
		await setAppSetting(AppSettingsKey.SYNC_CRON_EXPRESSION, '0 1 * * *');

		await restoreSyncScheduler();

		expect(getSchedulerStatus().isRunning).toBe(true);
		expect(await readSyncSchedulerState()).toBe(SyncSchedulerState.RUNNING);
	});

	it('stays inactive on an instance that never configured a schedule', async () => {
		expect(await restoreSyncScheduler()).toBeNull();
		expect(isSchedulerConfigured()).toBe(false);
	});

	it('refuses to restore a corrupted cron row instead of throwing on boot', async () => {
		await setAppSetting(AppSettingsKey.SYNC_CRON_EXPRESSION, 'not a cron');
		await persistSyncSchedulerState(SyncSchedulerState.RUNNING);

		expect(await restoreSyncScheduler()).toBeNull();
		expect(isSchedulerConfigured()).toBe(false);
	});
});

describe('scheduler actions persist operator intent', () => {
	it('records running / paused / stopped as the admin drives the scheduler', async () => {
		await runAction(
			actions.initScheduler as InitSchedulerAction,
			formRequest('initScheduler', { cronExpression: '0 0 * * *' })
		);
		expect(await readSyncSchedulerState()).toBe(SyncSchedulerState.RUNNING);

		await runAction(actions.pauseScheduler as PauseSchedulerAction, formRequest('pauseScheduler'));
		expect(await readSyncSchedulerState()).toBe(SyncSchedulerState.PAUSED);

		await runAction(
			actions.resumeScheduler as ResumeSchedulerAction,
			formRequest('resumeScheduler')
		);
		expect(await readSyncSchedulerState()).toBe(SyncSchedulerState.RUNNING);

		await runAction(actions.stopScheduler as StopSchedulerAction, formRequest('stopScheduler'));
		expect(await readSyncSchedulerState()).toBe(SyncSchedulerState.STOPPED);
	});

	it('leaves the live scheduler untouched when the durable write fails', async () => {
		await runAction(
			actions.initScheduler as InitSchedulerAction,
			formRequest('initScheduler', { cronExpression: '0 0 * * *' })
		);
		expect(getSchedulerStatus().isPaused).toBe(false);

		// Persisting the operator's intent runs BEFORE the live croner instance is
		// touched, so a failed write must report the error with both sides still on
		// the previous state — never a 500 for a scheduler that already flipped.
		const spy = spyOn(settingsService, 'setAppSetting').mockRejectedValueOnce(
			new Error('disk full')
		);
		try {
			const result = await runAction(
				actions.pauseScheduler as PauseSchedulerAction,
				formRequest('pauseScheduler')
			);
			expect(result).toMatchObject({ status: 500 });
		} finally {
			spy.mockRestore();
		}

		expect(getSchedulerStatus().isPaused).toBe(false);
		expect(await readSyncSchedulerState()).toBe(SyncSchedulerState.RUNNING);
	});

	it('does not resurrect a stopped scheduler on the next restart', async () => {
		await runAction(
			actions.initScheduler as InitSchedulerAction,
			formRequest('initScheduler', { cronExpression: '0 0 * * *' })
		);
		await runAction(actions.stopScheduler as StopSchedulerAction, formRequest('stopScheduler'));

		expect(await restoreSyncScheduler()).toBeNull();
		expect(isSchedulerConfigured()).toBe(false);
	});
});
