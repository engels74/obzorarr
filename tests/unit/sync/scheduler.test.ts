import { afterEach, describe, expect, it } from 'bun:test';
import {
	getSchedulerStatus,
	pauseSyncScheduler,
	resumeSyncScheduler,
	setupSyncScheduler,
	stopSyncScheduler
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
