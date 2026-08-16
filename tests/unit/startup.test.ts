import { afterAll, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { AppSettingsKey, setAppSetting } from '$lib/server/admin/settings.service';
import { db } from '$lib/server/db/client';
import { syncStatus } from '$lib/server/db/schema';
import { isRetentionSchedulerConfigured, stopLogRetentionScheduler } from '$lib/server/logging';
import { createServerInitializer, initializeServer } from '$lib/server/startup';
import { getSchedulerStatus, stopSyncScheduler } from '$lib/server/sync';
import { persistSyncSchedulerState, SyncSchedulerState } from '$lib/server/sync/scheduler-state';
import { resetSharedTestDb } from '../helpers/db';

describe('server startup initialization', () => {
	afterAll(() => {
		stopLogRetentionScheduler();
		stopSyncScheduler();
	});

	it('shares one initialization across concurrent callers', async () => {
		let calls = 0;
		let release!: () => void;
		const task = () => {
			calls += 1;
			return new Promise<void>((resolve) => {
				release = resolve;
			});
		};
		const initialize = createServerInitializer(task);

		const first = initialize();
		const second = initialize();

		expect(first).toBe(second);
		expect(calls).toBe(0);

		await Promise.resolve();
		expect(calls).toBe(1);
		release();
		await Promise.all([first, second]);
		expect(calls).toBe(1);
	});

	it('propagates and caches startup failures', async () => {
		const failure = new Error('startup failed');
		let calls = 0;
		const initialize = createServerInitializer(async () => {
			calls += 1;
			throw failure;
		});

		const first = initialize();
		const second = initialize();

		expect(first).toBe(second);
		await expect(first).rejects.toBe(failure);
		await expect(second).rejects.toBe(failure);
		expect(calls).toBe(1);
	});

	// `initializeServer` is memoized, so the process only ever runs the real
	// startup task once. Everything that must happen before the first request is
	// therefore asserted against that single invocation.
	it('reconciles interrupted syncs and starts both schedulers, only on the first call', async () => {
		await resetSharedTestDb();
		await setAppSetting(AppSettingsKey.SCHEDULER_TIMEZONE, 'Europe/Copenhagen');
		await setAppSetting(AppSettingsKey.SYNC_CRON_EXPRESSION, '15 4 * * *');
		await persistSyncSchedulerState(SyncSchedulerState.RUNNING);
		await db.insert(syncStatus).values({
			startedAt: new Date(Date.now() - 60_000),
			status: 'running',
			recordsProcessed: 0
		});

		await initializeServer();

		const failedRows = await db.select().from(syncStatus).where(eq(syncStatus.status, 'failed'));
		expect(failedRows).toHaveLength(1);
		expect(failedRows[0]?.error).toBe('Interrupted by restart');

		// Both cron jobs used to exist only after an admin opened /admin/sync or
		// /admin/logs, so a restart silently dropped the configured schedule.
		expect(isRetentionSchedulerConfigured()).toBe(true);
		const schedulerStatus = getSchedulerStatus();
		expect(schedulerStatus.isRunning).toBe(true);
		expect(schedulerStatus.cronExpression).toBe('15 4 * * *');
		expect(
			new Intl.DateTimeFormat('en-GB', {
				timeZone: 'Europe/Copenhagen',
				hour: '2-digit',
				minute: '2-digit',
				hourCycle: 'h23'
			}).format(schedulerStatus.nextRun!)
		).toBe('04:15');

		await db.insert(syncStatus).values({
			startedAt: new Date(),
			status: 'running',
			recordsProcessed: 0
		});
		await initializeServer();

		const runningRows = await db.select().from(syncStatus).where(eq(syncStatus.status, 'running'));
		expect(runningRows).toHaveLength(1);
	});
});
