import { getSyncedViewerCount, getUserCount } from '$lib/server/admin/users.service';
import { calculateServerStats } from '$lib/server/stats/engine';
import { getSchedulerStatus } from '$lib/server/sync/scheduler';
import {
	getLastSuccessfulSync,
	getPlayHistoryCount,
	isSyncRunning
} from '$lib/server/sync/service';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const year = new Date().getFullYear();

	const [
		userCount,
		syncedViewerCount,
		historyCount,
		lastSync,
		schedulerStatus,
		serverStats,
		isRunning
	] = await Promise.all([
		getUserCount(),
		getSyncedViewerCount(),
		getPlayHistoryCount(),
		getLastSuccessfulSync(),
		getSchedulerStatus(),
		calculateServerStats(year, { cacheTtlSeconds: 3600 }).catch(() => null),
		isSyncRunning()
	]);

	return {
		year,
		userCount,
		syncedViewerCount,
		historyCount,
		lastSync: lastSync
			? {
					id: lastSync.id,
					startedAt: lastSync.startedAt.toISOString(),
					completedAt: lastSync.completedAt?.toISOString() ?? null,
					recordsProcessed: lastSync.recordsProcessed,
					status: lastSync.status,
					durationMs: lastSync.completedAt
						? lastSync.completedAt.getTime() - lastSync.startedAt.getTime()
						: null
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
