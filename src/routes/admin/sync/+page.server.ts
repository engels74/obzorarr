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
	triggerImmediateSync,
	getSchedulerStatus,
	updateSchedulerCron,
	pauseSyncScheduler,
	resumeSyncScheduler,
	setupSyncScheduler,
	isSchedulerConfigured
} from '$lib/server/sync/scheduler';

/**
 * Admin Sync Page Server
 *
 * Handles sync management operations.
 *
 * Implements Requirements:
 * - 3.1: Manual sync button triggers immediate sync
 * - 3.2: Progress indicator (via status polling)
 * - 3.3: Cron schedule configuration
 * - 3.4: Display sync status after completion
 * - 3.5: History log of previous sync operations
 */

// =============================================================================
// Validation Schemas
// =============================================================================

const CronExpressionSchema = z.string().regex(/^[\d\s\*\/\-,]+$/, 'Invalid cron expression format');

const BackfillYearSchema = z
	.string()
	.optional()
	.transform((val) => (val ? parseInt(val, 10) : undefined))
	.pipe(z.number().min(2000).max(2100).optional());

// =============================================================================
// Load Function
// =============================================================================

export const load: PageServerLoad = async () => {
	const [isRunning, lastSync, history, schedulerStatus, historyCount] = await Promise.all([
		isSyncRunning(),
		getLastSuccessfulSync(),
		getSyncHistory(20), // Last 20 syncs
		getSchedulerStatus(),
		getPlayHistoryCount()
	]);

	// Get available years for backfill (current year and last 5 years)
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
		history: history.map((h) => ({
			id: h.id,
			startedAt: h.startedAt.toISOString(),
			completedAt: h.completedAt?.toISOString() ?? null,
			recordsProcessed: h.recordsProcessed,
			status: h.status,
			error: h.error
		})),
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

// =============================================================================
// Actions
// =============================================================================

export const actions: Actions = {
	/**
	 * Start a manual sync
	 */
	startSync: async ({ request }) => {
		// Check if sync is already running
		if (await isSyncRunning()) {
			return fail(400, { error: 'A sync is already in progress' });
		}

		const formData = await request.formData();
		const backfillYearRaw = formData.get('backfillYear');

		// Parse backfill year if provided
		let backfillYear: number | undefined;
		if (backfillYearRaw && backfillYearRaw !== '') {
			const parsed = BackfillYearSchema.safeParse(backfillYearRaw);
			if (!parsed.success) {
				return fail(400, { error: 'Invalid backfill year' });
			}
			backfillYear = parsed.data;
		}

		try {
			// Start sync (this runs in the foreground - could be made async with SSE)
			const result = await triggerImmediateSync(backfillYear);

			if (result.status === 'failed') {
				return fail(500, { error: result.error ?? 'Sync failed' });
			}

			return {
				success: true,
				message: `Sync completed: ${result.recordsInserted} records added`
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to start sync';
			return fail(500, { error: message });
		}
	},

	/**
	 * Update the scheduler cron expression
	 */
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

	/**
	 * Pause the scheduler
	 */
	pauseScheduler: async () => {
		try {
			pauseSyncScheduler();
			return { success: true, message: 'Scheduler paused' };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to pause scheduler';
			return fail(500, { error: message });
		}
	},

	/**
	 * Resume the scheduler
	 */
	resumeScheduler: async () => {
		try {
			resumeSyncScheduler();
			return { success: true, message: 'Scheduler resumed' };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to resume scheduler';
			return fail(500, { error: message });
		}
	},

	/**
	 * Initialize scheduler with default settings
	 */
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
