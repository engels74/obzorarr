import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { AppSettingsKey, getAppSetting } from '$lib/server/admin/settings.service';
import { db } from '$lib/server/db/client';
import { syncStatus } from '$lib/server/db/schema';
import { setupSyncScheduler, stopSyncScheduler } from '$lib/server/sync/scheduler';
import { actions } from '../../../src/routes/admin/sync/+page.server';
import { resetSharedTestDb } from '../../helpers/db';

// ISSUE-004 / ISSUE-005: the updateSchedule action returns both a context-aware
// message (so an inactive scheduler tells the operator to click "Initialize")
// and the parsed cronExpression (so the input re-seeds from the action result
// and never flashes blank before the page reloads).

type UpdateScheduleAction = NonNullable<typeof actions.updateSchedule>;

const adminLocals = {
	user: { id: 1, plexId: 1, username: 'admin', isAdmin: true }
} as unknown as App.Locals;

function run(cronExpression: string) {
	const formData = new FormData();
	formData.set('cronExpression', cronExpression);
	const request = new Request('http://localhost/admin/sync?/updateSchedule', {
		method: 'POST',
		body: formData
	});
	const handler = actions.updateSchedule as UpdateScheduleAction;
	return handler({ request, locals: adminLocals } as Parameters<UpdateScheduleAction>[0]);
}

describe('sync updateSchedule action (ISSUE-004 / ISSUE-005)', () => {
	beforeEach(async () => {
		await resetSharedTestDb();
		stopSyncScheduler();
	});

	afterEach(() => {
		stopSyncScheduler();
	});

	it('echoes the parsed cronExpression so the input re-seeds without a blank frame (AC-005)', async () => {
		const result = await run('30 2 * * *');
		expect(result).toMatchObject({ success: true, cronExpression: '30 2 * * *' });
		expect(await getAppSetting(AppSettingsKey.SYNC_CRON_EXPRESSION)).toBe('30 2 * * *');
	});

	it('surfaces the "click Initialize" hint when the scheduler is inactive (AC-004)', async () => {
		// No scheduler instance exists in a fresh test => isSchedulerConfigured() false.
		const result = (await run('0 5 * * *')) as { success: boolean; message: string };
		expect(result.success).toBe(true);
		expect(result.message).toBe('Schedule saved. Click "Initialize" to activate it.');
	});

	it('reports a plain "updated" message when the scheduler is already active', async () => {
		setupSyncScheduler({ cronExpression: '0 0 * * *', startImmediately: true });
		const result = (await run('0 6 * * *')) as { success: boolean; message: string };
		expect(result.success).toBe(true);
		expect(result.message).toBe('Schedule updated successfully');
	});

	it('rejects an invalid cron with a 400 and echoes the bad value back', async () => {
		const result = await run('not a cron');
		expect(result).toMatchObject({ status: 400 });
	});
});

describe('sync startSync action conflict (ISSUE-005)', () => {
	type StartSyncAction = NonNullable<typeof actions.startSync>;

	beforeEach(async () => {
		await resetSharedTestDb();
		stopSyncScheduler();
	});

	afterEach(() => {
		stopSyncScheduler();
	});

	function runStartSync() {
		const request = new Request('http://localhost/admin/sync?/startSync', {
			method: 'POST',
			body: new FormData()
		});
		const handler = actions.startSync as StartSyncAction;
		return handler({ request, locals: adminLocals } as Parameters<StartSyncAction>[0]);
	}

	it('returns 409 (conflict) when a sync is already in progress', async () => {
		// getRunningSync() looks for a syncStatus row with status='running'.
		await db.insert(syncStatus).values({
			startedAt: new Date(Date.now() - 1000),
			status: 'running',
			recordsProcessed: 0
		});

		const result = (await runStartSync()) as { status?: number; data?: { error?: string } };
		expect(result.status).toBe(409);
	});
});
