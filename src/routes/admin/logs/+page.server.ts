import { fail } from '@sveltejs/kit';
import { z } from 'zod';
import type { PageServerLoad, Actions } from './$types';
import {
	queryLogs,
	getDistinctSources,
	getLogCountsByLevel,
	deleteAllLogs,
	getLogRetentionDays,
	getLogMaxCount,
	isDebugEnabled,
	setupLogRetentionScheduler,
	isRetentionSchedulerConfigured,
	getRetentionSchedulerStatus,
	triggerRetentionCleanup,
	LogLevel,
	type LogLevelType
} from '$lib/server/logging';

/**
 * Admin Logs Page Server
 *
 * Handles log viewing and management operations.
 *
 * Features:
 * - Load logs with filtering and pagination
 * - Filter by log level, search text, source, date range
 * - Clear all logs
 * - Export logs as JSON
 * - Trigger manual retention cleanup
 */

// =============================================================================
// Validation Schemas
// =============================================================================

const LogLevelFilterSchema = z
	.string()
	.optional()
	.transform((val) => {
		if (!val) return undefined;
		const levels = val.split(',').filter((l) => l in LogLevel) as LogLevelType[];
		return levels.length > 0 ? levels : undefined;
	});

const TimestampSchema = z
	.string()
	.optional()
	.transform((val) => {
		if (!val) return undefined;
		const parsed = parseInt(val, 10);
		return isNaN(parsed) ? undefined : parsed;
	});

const LimitSchema = z
	.string()
	.optional()
	.transform((val) => {
		if (!val) return 100;
		const parsed = parseInt(val, 10);
		return isNaN(parsed) || parsed < 1 ? 100 : Math.min(parsed, 500);
	});

const CursorSchema = z
	.string()
	.optional()
	.transform((val) => {
		if (!val) return undefined;
		const parsed = parseInt(val, 10);
		return isNaN(parsed) ? undefined : parsed;
	});

// =============================================================================
// Load Function
// =============================================================================

export const load: PageServerLoad = async ({ url }) => {
	// Initialize retention scheduler if not already configured
	if (!isRetentionSchedulerConfigured()) {
		setupLogRetentionScheduler();
	}

	// Parse query parameters
	const levelsParam = url.searchParams.get('levels');
	const search = url.searchParams.get('search') || undefined;
	const source = url.searchParams.get('source') || undefined;
	const fromParam = url.searchParams.get('from');
	const toParam = url.searchParams.get('to');
	const limitParam = url.searchParams.get('limit');
	const cursorParam = url.searchParams.get('cursor');

	// Parse and validate
	const levels = LogLevelFilterSchema.parse(levelsParam);
	const fromTimestamp = TimestampSchema.parse(fromParam);
	const toTimestamp = TimestampSchema.parse(toParam);
	const limit = LimitSchema.parse(limitParam);
	const cursor = CursorSchema.parse(cursorParam);

	// Fetch data in parallel
	const [logsResult, sources, levelCounts, retentionDays, maxCount, debugEnabled, retentionStatus] =
		await Promise.all([
			queryLogs({ levels, search, source, fromTimestamp, toTimestamp, cursor, limit }),
			getDistinctSources(),
			getLogCountsByLevel(),
			getLogRetentionDays(),
			getLogMaxCount(),
			isDebugEnabled(),
			getRetentionSchedulerStatus()
		]);

	return {
		logs: logsResult.logs,
		hasMore: logsResult.hasMore,
		totalCount: logsResult.totalCount,
		sources,
		levelCounts,
		settings: {
			retentionDays,
			maxCount,
			debugEnabled
		},
		retentionScheduler: {
			isConfigured: retentionStatus.isConfigured,
			nextRun: retentionStatus.nextRun?.toISOString() ?? null
		},
		filters: {
			levels: levels ?? [],
			search: search ?? '',
			source: source ?? '',
			fromTimestamp,
			toTimestamp,
			limit,
			cursor
		}
	};
};

// =============================================================================
// Actions
// =============================================================================

export const actions: Actions = {
	/**
	 * Clear all logs
	 */
	clearLogs: async () => {
		try {
			const count = await deleteAllLogs();
			return { success: true, message: `Deleted ${count} log entries` };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to clear logs';
			return fail(500, { error: message });
		}
	},

	/**
	 * Trigger manual retention cleanup
	 */
	runCleanup: async () => {
		try {
			const result = await triggerRetentionCleanup();
			return {
				success: true,
				message: `Cleanup completed: ${result.byAge} deleted by age, ${result.byCount} deleted by count`
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to run cleanup';
			return fail(500, { error: message });
		}
	},

	/**
	 * Export logs as JSON
	 */
	exportLogs: async ({ url }) => {
		// Parse the same filters as load function
		const levelsParam = url.searchParams.get('levels');
		const search = url.searchParams.get('search') || undefined;
		const source = url.searchParams.get('source') || undefined;
		const fromParam = url.searchParams.get('from');
		const toParam = url.searchParams.get('to');

		const levels = LogLevelFilterSchema.parse(levelsParam);
		const fromTimestamp = TimestampSchema.parse(fromParam);
		const toTimestamp = TimestampSchema.parse(toParam);

		try {
			// Get all logs matching filters (no limit for export)
			const result = await queryLogs({
				levels,
				search,
				source,
				fromTimestamp,
				toTimestamp,
				limit: 10000 // Reasonable max for export
			});

			// Return as JSON download
			return {
				success: true,
				exportData: JSON.stringify(result.logs, null, 2),
				exportFilename: `logs-export-${Date.now()}.json`
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to export logs';
			return fail(500, { error: message });
		}
	}
};
