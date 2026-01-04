import { fail } from '@sveltejs/kit';
import { z } from 'zod';
import {
	deleteAllLogs,
	getDistinctSources,
	getLogCountsByLevel,
	getLogMaxCount,
	getLogRetentionDays,
	getRetentionSchedulerStatus,
	isDebugEnabled,
	isRetentionSchedulerConfigured,
	LogLevel,
	type LogLevelType,
	queryLogs,
	setupLogRetentionScheduler,
	triggerRetentionCleanup
} from '$lib/server/logging';
import type { Actions, PageServerLoad } from './$types';

const LogLevelFilterSchema = z
	.string()
	.nullish()
	.transform((val) => {
		if (!val) return undefined;
		const levels = val.split(',').filter((l) => l in LogLevel) as LogLevelType[];
		return levels.length > 0 ? levels : undefined;
	});

const TimestampSchema = z
	.string()
	.nullish()
	.transform((val) => {
		if (!val) return undefined;
		const parsed = parseInt(val, 10);
		return Number.isNaN(parsed) ? undefined : parsed;
	});

const LimitSchema = z
	.string()
	.nullish()
	.transform((val) => {
		if (!val) return 100;
		const parsed = parseInt(val, 10);
		return Number.isNaN(parsed) || parsed < 1 ? 100 : Math.min(parsed, 500);
	});

const CursorSchema = z
	.string()
	.nullish()
	.transform((val) => {
		if (!val) return undefined;
		const parsed = parseInt(val, 10);
		return Number.isNaN(parsed) ? undefined : parsed;
	});

export const load: PageServerLoad = async ({ url }) => {
	// Initialize retention scheduler if not already configured
	if (!isRetentionSchedulerConfigured()) {
		setupLogRetentionScheduler();
	}

	const levelsParam = url.searchParams.get('levels');
	const search = url.searchParams.get('search') || undefined;
	const source = url.searchParams.get('source') || undefined;
	const fromParam = url.searchParams.get('from');
	const toParam = url.searchParams.get('to');
	const limitParam = url.searchParams.get('limit');
	const cursorParam = url.searchParams.get('cursor');

	const levels = LogLevelFilterSchema.parse(levelsParam);
	const fromTimestamp = TimestampSchema.parse(fromParam);
	const toTimestamp = TimestampSchema.parse(toParam);
	const limit = LimitSchema.parse(limitParam);
	const cursor = CursorSchema.parse(cursorParam);

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

export const actions: Actions = {
	clearLogs: async () => {
		try {
			const count = await deleteAllLogs();
			return { success: true, message: `Deleted ${count} log entries` };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to clear logs';
			return fail(500, { error: message });
		}
	},

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

	exportLogs: async ({ url }) => {
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
				limit: 10000
			});

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
