import { fail } from '@sveltejs/kit';
import { z } from 'zod';
import { CRON_REQUIRED_MESSAGE, validateCronExpression } from '$lib/cron/validation';
import { AppSettingsKey, getAppSetting, setAppSetting } from '$lib/server/admin/settings.service';
import { requireAdminActions } from '$lib/server/auth/guards';
import { cancelSync } from '$lib/server/sync/progress';
import {
	getSchedulerStatus,
	isSchedulerConfigured,
	pauseSyncScheduler,
	resumeSyncScheduler,
	setupSyncScheduler,
	startBackgroundSync,
	stopSyncScheduler,
	updateSchedulerCron
} from '$lib/server/sync/scheduler';
import {
	getLastSuccessfulSync,
	getPlayHistoryCount,
	getSyncHistory,
	isSyncRunning
} from '$lib/server/sync/service';
import type { Actions, PageServerLoad } from './$types';

const BackfillYearSchema = z
	.string()
	.optional()
	.transform((val) => (val ? parseInt(val, 10) : undefined))
	.pipe(z.number().min(2000).max(2100).optional());

const UpdateScheduleSchema = z.object({
	cronExpression: z
		.preprocess((value) => (typeof value === 'string' ? value : ''), z.string())
		.superRefine((expression, ctx) => {
			const error = validateCronExpression(expression);
			if (error) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: error
				});
			}
		})
		.transform((expression) => expression.trim())
});

const HISTORY_PAGE_SIZE = 8;

export const load: PageServerLoad = async ({ url }) => {
	const pageParam = url.searchParams.get('page');
	const page = Math.max(1, parseInt(pageParam ?? '1', 10) || 1);

	const [isRunning, lastSync, paginatedHistory, schedulerStatus, historyCount, storedCron] =
		await Promise.all([
			isSyncRunning(),
			getLastSuccessfulSync(),
			getSyncHistory({ page, pageSize: HISTORY_PAGE_SIZE }),
			getSchedulerStatus(),
			getPlayHistoryCount(),
			getAppSetting(AppSettingsKey.SYNC_CRON_EXPRESSION)
		]);

	const currentYear = new Date().getFullYear();
	const availableYears = Array.from({ length: currentYear - 2000 + 1 }, (_, i) => currentYear - i);

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
			cronExpression: schedulerStatus.cronExpression ?? storedCron
		},
		historyCount,
		availableYears
	};
};

export const actions: Actions = requireAdminActions({
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
			const result = await startBackgroundSync(backfillYear);

			if (!result.started) {
				return fail(400, {
					error: result.error ?? 'Failed to start sync',
					selectedYear: backfillYear ?? null
				});
			}

			// Echo back the year we acted on so the form can re-select it after the
			// post-submit update() — without this, the dropdown reverts to
			// "New Activity Only" once the sync completes (ISSUE-004).
			return {
				success: true,
				started: true,
				message: 'Sync started',
				selectedYear: backfillYear ?? null
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to start sync';
			return fail(500, { error: message, selectedYear: backfillYear ?? null });
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

		const parsed = UpdateScheduleSchema.safeParse({ cronExpression });
		if (!parsed.success) {
			const error = parsed.error.issues[0]?.message ?? CRON_REQUIRED_MESSAGE;
			return fail(400, {
				error,
				cronError: error,
				cronExpression: typeof cronExpression === 'string' ? cronExpression : ''
			});
		}

		try {
			updateSchedulerCron(parsed.data.cronExpression);
			await setAppSetting(AppSettingsKey.SYNC_CRON_EXPRESSION, parsed.data.cronExpression);
			const isActive = isSchedulerConfigured();
			const message = isActive
				? 'Schedule updated successfully'
				: 'Schedule saved. Click "Initialize" to activate it.';
			return { success: true, message, cronExpression: parsed.data.cronExpression };
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

	stopScheduler: async () => {
		try {
			stopSyncScheduler();
			return { success: true, message: 'Scheduler stopped' };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to stop scheduler';
			return fail(500, { error: message });
		}
	},

	initScheduler: async ({ request }) => {
		const formData = await request.formData();
		const cronExpression = formData.get('cronExpression');

		const expression = cronExpression ?? '0 0 * * *';

		const parsed = UpdateScheduleSchema.safeParse({ cronExpression: expression });
		if (!parsed.success) {
			const error = parsed.error.issues[0]?.message ?? CRON_REQUIRED_MESSAGE;
			return fail(400, {
				error,
				cronError: error,
				cronExpression: typeof expression === 'string' ? expression : ''
			});
		}

		try {
			setupSyncScheduler({
				cronExpression: parsed.data.cronExpression,
				startImmediately: true
			});
			await setAppSetting(AppSettingsKey.SYNC_CRON_EXPRESSION, parsed.data.cronExpression);
			return { success: true, message: 'Scheduler initialized' };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to initialize scheduler';
			return fail(500, { error: message });
		}
	}
});
