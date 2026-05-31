import { afterEach, describe, expect, it } from 'bun:test';
import {
	getSchedulerStatus,
	pauseSyncScheduler,
	resumeSyncScheduler,
	setupSyncScheduler,
	stopSyncScheduler,
	updateSchedulerCron
} from '$lib/server/sync/scheduler';

describe('getSchedulerStatus pause/resume', () => {
	afterEach(() => {
		stopSyncScheduler();
	});

	it('returns isPaused=false and isRunning=true after setup with startImmediately', () => {
		setupSyncScheduler({ cronExpression: '0 0 * * *', startImmediately: true });
		const status = getSchedulerStatus();
		expect(status.isRunning).toBe(true);
		expect(status.isPaused).toBe(false);
	});

	it('returns isPaused=true after pauseSyncScheduler — ISSUE-005 regression guard', () => {
		setupSyncScheduler({ cronExpression: '0 0 * * *', startImmediately: true });
		pauseSyncScheduler();
		const status = getSchedulerStatus();
		expect(status.isPaused).toBe(true);
		expect(status.isRunning).toBe(false);
		expect(status.nextRun).toBeNull();
	});

	it('returns isPaused=false and isRunning=true after resumeSyncScheduler', () => {
		setupSyncScheduler({ cronExpression: '0 0 * * *', startImmediately: true });
		pauseSyncScheduler();
		resumeSyncScheduler();
		const status = getSchedulerStatus();
		expect(status.isRunning).toBe(true);
		expect(status.isPaused).toBe(false);
	});

	it('clears the paused flag on stop so a fresh setup never inherits stale state', () => {
		setupSyncScheduler({ cronExpression: '0 0 * * *', startImmediately: true });
		pauseSyncScheduler();
		stopSyncScheduler();
		const stoppedStatus = getSchedulerStatus();
		expect(stoppedStatus.isRunning).toBe(false);
		expect(stoppedStatus.isPaused).toBe(false);

		setupSyncScheduler({ cronExpression: '0 0 * * *', startImmediately: true });
		const restartedStatus = getSchedulerStatus();
		expect(restartedStatus.isRunning).toBe(true);
		expect(restartedStatus.isPaused).toBe(false);
	});
});

describe('updateSchedulerCron preserves run-state — ISSUE-012 regression guard', () => {
	afterEach(() => {
		stopSyncScheduler();
	});

	it('does NOT activate an INACTIVE scheduler when only the cron is updated', () => {
		// Scheduler is inactive (never set up)
		const before = getSchedulerStatus();
		expect(before.isRunning).toBe(false);
		expect(before.isPaused).toBe(false);
		expect(before.cronExpression).toBeNull();

		// Updating the cron must not flip it to active
		updateSchedulerCron('0 6 * * *');

		const after = getSchedulerStatus();
		expect(after.isRunning).toBe(false);
		expect(after.isPaused).toBe(false);
	});

	it('keeps a PAUSED scheduler paused after a cron update', () => {
		setupSyncScheduler({ cronExpression: '0 0 * * *', startImmediately: true });
		pauseSyncScheduler();
		expect(getSchedulerStatus().isPaused).toBe(true);

		updateSchedulerCron('0 3 * * *');

		const after = getSchedulerStatus();
		expect(after.isPaused).toBe(true);
		expect(after.isRunning).toBe(false);
		// The new expression should be applied
		expect(after.cronExpression).toBe('0 3 * * *');
	});

	it('keeps an ACTIVE scheduler active after a cron update', () => {
		setupSyncScheduler({ cronExpression: '0 0 * * *', startImmediately: true });
		expect(getSchedulerStatus().isRunning).toBe(true);

		updateSchedulerCron('0 12 * * *');

		const after = getSchedulerStatus();
		expect(after.isRunning).toBe(true);
		expect(after.isPaused).toBe(false);
		expect(after.cronExpression).toBe('0 12 * * *');
	});
});
