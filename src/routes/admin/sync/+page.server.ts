import { fail } from '@sveltejs/kit';
import { z } from 'zod';
import type { PageServerLoad, Actions } from './$types';
import {
	isSyncRunning,
	getLastSuccessfulSync,
	getSyncHistory,
	getPlayHistoryCount,
	getYearStartTimestamp
} from '$lib/server/sync/service';
import {
	startBackgroundSync,
	getSchedulerStatus,
	updateSchedulerCron,
	pauseSyncScheduler,
	resumeSyncScheduler,
	setupSyncScheduler,
	isSchedulerConfigured
} from '$lib/server/sync/scheduler';
import { cancelSync } from '$lib/server/sync/progress';

const CronExpressionSchema = z.string().regex(/^[\d\s\*\/\-,]+$/, 'Invalid cron expression format');

const BackfillYearSchema = z
	.string()
	.optional()
	.transform((val) => (val ? parseInt(val, 10) : undefined))
	.pipe(z.number().min(2000).max(2100).optional());

const HISTORY_PAGE_SIZE = 8;

export const load: PageServerLoad = async ({ url }) => {
	const pageParam = url.searchParams.get('page');
	const page = Math.max(1, parseInt(pageParam ?? '1', 10) || 1);

	const [isRunning, lastSync, paginatedHistory, schedulerStatus, historyCount] = await Promise.all([
		isSyncRunning(),
		getLastSuccessfulSync(),
		getSyncHistory({ page, pageSize: HISTORY_PAGE_SIZE }),
		getSchedulerStatus(),
		getPlayHistoryCount()
	]);

	const currentYear = new Date().getFullYear();
	const availableYears = Array.from({ length: 6 }, (_, i) => currentYear - i);

	return {
		isRunning,
		lastSync: lastSync
			? {
					id: lastSync.id,
					startedAt: lastSync.startedAt.toISOString(),
					completedAt: lastSync.completedAt?.toISOString() ?? null,
					recordsProcessed: lastSync.recordsProcessed,
					lastViewedAt: lastSync.lastViewedAt,
					status: lastSync.status
				}
			: null,
		history: paginatedHistory.items.map((h) => ({
			id: h.id,
			startedAt: h.startedAt.toISOString(),
			completedAt: h.completedAt?.toISOString() ?? null,
			recordsProcessed: h.recordsProcessed,
			status: h.status,
			error: h.error
		})),
		pagination: {
			page: paginatedHistory.page,
			pageSize: paginatedHistory.pageSize,
			total: paginatedHistory.total,
			totalPages: paginatedHistory.totalPages
		},
		schedulerStatus: {
			isRunning: schedulerStatus.isRunning,
			isPaused: schedulerStatus.isPaused,
			nextRun: schedulerStatus.nextRun?.toISOString() ?? null,
			previousRun: schedulerStatus.previousRun?.toISOString() ?? null,
			cronExpression: schedulerStatus.cronExpression
		},
		historyCount,
		availableYears
	};
};

export const actions: Actions = {
	startSync: async ({ request }) => {
		const formData = await request.formData();
		const backfillYearRaw = formData.get('backfillYear');

		let backfillYear: number | undefined;
		if (backfillYearRaw && backfillYearRaw !== '') {
			const parsed = BackfillYearSchema.safeParse(backfillYearRaw);
			if (!parsed.success) {
				return fail(400, { error: 'Invalid backfill year' });
			}
			backfillYear = parsed.data;
		}

		try {
			// Start sync in background (returns immediately)
			const result = await startBackgroundSync(backfillYear);

			if (!result.started) {
				return fail(400, { error: result.error ?? 'Failed to start sync' });
			}

			return {
				success: true,
				started: true,
				message: 'Sync started'
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to start sync';
			return fail(500, { error: message });
		}
	},

	cancelSync: async () => {
		const cancelled = cancelSync();

		if (!cancelled) {
			return fail(400, { error: 'No sync is currently running' });
		}

		return {
			success: true,
			message: 'Sync cancelled'
		};
	},

	updateSchedule: async ({ request }) => {
		const formData = await request.formData();
		const cronExpression = formData.get('cronExpression');

		if (!cronExpression || typeof cronExpression !== 'string') {
			return fail(400, { error: 'Cron expression is required' });
		}

		const parsed = CronExpressionSchema.safeParse(cronExpression);
		if (!parsed.success) {
			return fail(400, { error: 'Invalid cron expression format' });
		}

		try {
			updateSchedulerCron(parsed.data);
			return { success: true, message: 'Schedule updated successfully' };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to update schedule';
			return fail(500, { error: message });
		}
	},

	pauseScheduler: async () => {
		try {
			pauseSyncScheduler();
			return { success: true, message: 'Scheduler paused' };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to pause scheduler';
			return fail(500, { error: message });
		}
	},

	resumeScheduler: async () => {
		try {
			resumeSyncScheduler();
			return { success: true, message: 'Scheduler resumed' };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to resume scheduler';
			return fail(500, { error: message });
		}
	},

	initScheduler: async ({ request }) => {
		const formData = await request.formData();
		const cronExpression = formData.get('cronExpression');

		const expression =
			cronExpression && typeof cronExpression === 'string' ? cronExpression : '0 0 * * *';

		const parsed = CronExpressionSchema.safeParse(expression);
		if (!parsed.success) {
			return fail(400, { error: 'Invalid cron expression format' });
		}

		try {
			setupSyncScheduler({
				cronExpression: parsed.data,
				startImmediately: true
			});
			return { success: true, message: 'Scheduler initialized' };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to initialize scheduler';
			return fail(500, { error: message });
		}
	}
};
