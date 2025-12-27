import type { PageServerLoad } from './$types';
import { getUserCount } from '$lib/server/admin/users.service';
import {
	getPlayHistoryCount,
	getLastSuccessfulSync,
	isSyncRunning
} from '$lib/server/sync/service';
import { getSchedulerStatus } from '$lib/server/sync/scheduler';
import { calculateServerStats } from '$lib/server/stats/engine';

/**
 * Admin Dashboard Server
 *
 * Loads overview data for the admin dashboard.
 *
 * Implements Requirements:
 * - 11.1: Dashboard with server overview, total users, total watch time, sync status
 */

export const load: PageServerLoad = async () => {
	const year = new Date().getFullYear();

	// Load all dashboard data in parallel
	const [userCount, historyCount, lastSync, schedulerStatus, serverStats, isRunning] =
		await Promise.all([
			getUserCount(),
			getPlayHistoryCount(),
			getLastSuccessfulSync(),
			getSchedulerStatus(),
			calculateServerStats(year, { cacheTtlSeconds: 3600 }).catch(() => null),
			isSyncRunning()
		]);

	return {
		year,
		userCount,
		historyCount,
		lastSync: lastSync
			? {
					id: lastSync.id,
					startedAt: lastSync.startedAt.toISOString(),
					completedAt: lastSync.completedAt?.toISOString() ?? null,
					recordsProcessed: lastSync.recordsProcessed,
					status: lastSync.status
				}
			: null,
		schedulerStatus: schedulerStatus
			? {
					isRunning: schedulerStatus.isRunning,
					isPaused: schedulerStatus.isPaused,
					nextRun: schedulerStatus.nextRun?.toISOString() ?? null,
					previousRun: schedulerStatus.previousRun?.toISOString() ?? null,
					cronExpression: schedulerStatus.cronExpression
				}
			: null,
		stats: serverStats
			? {
					totalWatchTimeMinutes: serverStats.totalWatchTimeMinutes,
					totalPlays: serverStats.totalPlays
				}
			: null,
		isRunning
	};
};
