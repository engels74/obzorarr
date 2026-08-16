import { fail } from '@sveltejs/kit';
import { z } from 'zod';
import { CRON_REQUIRED_MESSAGE, validateCronExpression } from '$lib/cron/validation';
import {
	AppSettingsKey,
	getAppSetting,
	getSchedulerTimezoneConfigWithSource,
	setAppSetting
} from '$lib/server/admin/settings.service';
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
	persistSyncSchedulerState,
	SyncSchedulerState,
	withSchedulerMutation
} from '$lib/server/sync/scheduler-state';
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

/** Shown when pause/resume is submitted with no scheduler configured. */
const NO_SCHEDULER_MESSAGE = 'No schedule is configured. Initialize it first.';

export const load: PageServerLoad = async ({ url }) => {
	const pageParam = url.searchParams.get('page');
	const page = Math.max(1, parseInt(pageParam ?? '1', 10) || 1);

	const [
		isRunning,
		lastSync,
		paginatedHistory,
		schedulerStatus,
		historyCount,
		storedCron,
		timezoneConfig
	] = await Promise.all([
		isSyncRunning(),
		getLastSuccessfulSync(),
		getSyncHistory({ page, pageSize: HISTORY_PAGE_SIZE }),
		getSchedulerStatus(),
		getPlayHistoryCount(),
		getAppSetting(AppSettingsKey.SYNC_CRON_EXPRESSION),
		getSchedulerTimezoneConfigWithSource()
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
			cronExpression: schedulerStatus.cronExpression ?? storedCron,
			timezone: timezoneConfig.timezone.value,
			timezoneSource: timezoneConfig.timezone.source
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
				// ISSUE-005: the only !started path is an in-progress sync, which is a
				// conflict (409), not a bad request (400). The client surfaces the
				// message; the status code lets a concurrent double-trigger be told
				// apart from a validation failure.
				return fail(409, {
					error: result.error ?? 'A sync is already in progress',
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
			return await withSchedulerMutation(async () => {
				const { timezone } = await getSchedulerTimezoneConfigWithSource();
				updateSchedulerCron(parsed.data.cronExpression, timezone.value);
				await setAppSetting(AppSettingsKey.SYNC_CRON_EXPRESSION, parsed.data.cronExpression);
				const isActive = isSchedulerConfigured();
				const message = isActive
					? 'Schedule updated'
					: 'Schedule saved. Click "Initialize" to activate it.';
				return { success: true, message, cronExpression: parsed.data.cronExpression };
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to update schedule';
			return fail(500, { error: message });
		}
	},

	// Every scheduler mutation runs inside `withSchedulerMutation` and writes its
	// durable intent BEFORE touching the live croner instance.
	//
	// Persist-first means a failed write leaves both sides on the previous state
	// and reports the error, rather than returning a 500 for a scheduler that has
	// already flipped. Serializing means overlapping requests cannot both commit
	// before either applies its change — which mattered because the live calls are
	// not symmetric with the rows they follow: `resumeSyncScheduler` silently does
	// nothing once another request has stopped the scheduler, so an unserialized
	// resume could leave the row on `running` with no job to restore.
	//
	// `isSchedulerConfigured` is therefore checked INSIDE the serialized section:
	// checking it outside would let a stop land between the check and the write.
	pauseScheduler: async () => {
		try {
			return await withSchedulerMutation(async () => {
				if (!isSchedulerConfigured()) {
					return fail(400, { error: NO_SCHEDULER_MESSAGE });
				}
				await persistSyncSchedulerState(SyncSchedulerState.PAUSED);
				pauseSyncScheduler();
				return { success: true, message: 'Scheduler paused' };
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to pause scheduler';
			return fail(500, { error: message });
		}
	},

	resumeScheduler: async () => {
		try {
			return await withSchedulerMutation(async () => {
				if (!isSchedulerConfigured()) {
					return fail(400, { error: NO_SCHEDULER_MESSAGE });
				}
				await persistSyncSchedulerState(SyncSchedulerState.RUNNING);
				resumeSyncScheduler();
				return { success: true, message: 'Scheduler resumed' };
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to resume scheduler';
			return fail(500, { error: message });
		}
	},

	// No precondition guard: stopping an already-stopped scheduler is idempotent
	// and `stopped` describes the live instance either way.
	stopScheduler: async () => {
		try {
			return await withSchedulerMutation(async () => {
				await persistSyncSchedulerState(SyncSchedulerState.STOPPED);
				stopSyncScheduler();
				return { success: true, message: 'Scheduler stopped' };
			});
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
			return await withSchedulerMutation(async () => {
				const { timezone } = await getSchedulerTimezoneConfigWithSource();
				// Same persist-then-apply ordering as pause/resume/stop above. The
				// expression is already schema-validated, so committing the durable
				// intent first cannot persist a schedule the restore path would reject.
				await setAppSetting(AppSettingsKey.SYNC_CRON_EXPRESSION, parsed.data.cronExpression);
				await persistSyncSchedulerState(SyncSchedulerState.RUNNING);
				setupSyncScheduler({
					cronExpression: parsed.data.cronExpression,
					timezone: timezone.value,
					startImmediately: true
				});
				return { success: true, message: 'Scheduler initialized' };
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to initialize scheduler';
			return fail(500, { error: message });
		}
	}
});
