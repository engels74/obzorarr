import { db } from '$lib/server/db/client';
import { logs, appSettings } from '$lib/server/db/schema';
import { eq, and, or, lt, desc, sql, like, inArray } from 'drizzle-orm';
import type { LogEntry, NewLogEntry, LogQueryOptions, LogQueryResult, LogLevelType } from './types';
import { LogSettingsKey, LogSettingsDefaults } from './types';

/**
 * Logging Service
 *
 * Provides database operations for the logging system.
 * Handles log insertion, querying, and cleanup.
 */

// =============================================================================
// Log Insertion
// =============================================================================

/**
 * Insert a single log entry
 *
 * @param entry - The log entry to insert
 */
export async function insertLog(entry: NewLogEntry): Promise<void> {
	await db.insert(logs).values({
		level: entry.level,
		message: entry.message,
		source: entry.source ?? null,
		metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
		timestamp: Date.now()
	});
}

/**
 * Insert multiple log entries in a batch
 *
 * @param entries - Array of log entries to insert
 */
export async function insertLogsBatch(entries: NewLogEntry[]): Promise<void> {
	if (entries.length === 0) return;

	const now = Date.now();
	const values = entries.map((entry, index) => ({
		level: entry.level,
		message: entry.message,
		source: entry.source ?? null,
		metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
		// Offset timestamp slightly to preserve order
		timestamp: now + index
	}));

	await db.insert(logs).values(values);
}

// =============================================================================
// Log Querying
// =============================================================================

/**
 * Query logs with filtering and pagination
 *
 * @param options - Query options for filtering and pagination
 * @returns Query result with logs, hasMore flag, and total count
 */
export async function queryLogs(options: LogQueryOptions = {}): Promise<LogQueryResult> {
	const { levels, search, source, fromTimestamp, toTimestamp, cursor, limit = 100 } = options;

	// Build conditions array
	const conditions = [];

	// Level filter
	if (levels && levels.length > 0) {
		conditions.push(inArray(logs.level, levels));
	}

	// Source filter
	if (source) {
		conditions.push(eq(logs.source, source));
	}

	// Time range filter
	if (fromTimestamp) {
		conditions.push(sql`${logs.timestamp} >= ${fromTimestamp}`);
	}
	if (toTimestamp) {
		conditions.push(sql`${logs.timestamp} <= ${toTimestamp}`);
	}

	// Cursor-based pagination (for older logs)
	if (cursor) {
		conditions.push(lt(logs.id, cursor));
	}

	// Text search in message
	if (search) {
		conditions.push(like(logs.message, `%${search}%`));
	}

	// Build where clause
	const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

	// Get total count (without pagination)
	const countResult = await db
		.select({ count: sql<number>`count(*)` })
		.from(logs)
		.where(whereClause);
	const totalCount = countResult[0]?.count ?? 0;

	// Get logs with limit + 1 to check if there are more
	const logResults = await db
		.select()
		.from(logs)
		.where(whereClause)
		.orderBy(desc(logs.id))
		.limit(limit + 1);

	// Check if there are more results
	const hasMore = logResults.length > limit;
	const logsToReturn = hasMore ? logResults.slice(0, limit) : logResults;

	return {
		logs: logsToReturn as LogEntry[],
		hasMore,
		totalCount
	};
}

/**
 * Get logs newer than a specific ID (for SSE streaming)
 *
 * @param afterId - The log ID to get logs after
 * @param limit - Maximum number of logs to return
 * @returns Array of new log entries
 */
export async function getLogsAfterId(afterId: number, limit = 100): Promise<LogEntry[]> {
	const result = await db
		.select()
		.from(logs)
		.where(sql`${logs.id} > ${afterId}`)
		.orderBy(logs.id)
		.limit(limit);

	return result as LogEntry[];
}

/**
 * Get the latest log ID
 *
 * @returns The ID of the most recent log, or 0 if no logs exist
 */
export async function getLatestLogId(): Promise<number> {
	const result = await db.select({ id: logs.id }).from(logs).orderBy(desc(logs.id)).limit(1);

	return result[0]?.id ?? 0;
}

/**
 * Get distinct sources from logs
 *
 * @returns Array of unique source names
 */
export async function getDistinctSources(): Promise<string[]> {
	const result = await db
		.selectDistinct({ source: logs.source })
		.from(logs)
		.where(sql`${logs.source} IS NOT NULL`)
		.orderBy(logs.source);

	return result.map((r) => r.source).filter((s): s is string => s !== null);
}

/**
 * Get log count by level
 *
 * @returns Object with counts per log level
 */
export async function getLogCountsByLevel(): Promise<Record<LogLevelType, number>> {
	const result = await db
		.select({
			level: logs.level,
			count: sql<number>`count(*)`
		})
		.from(logs)
		.groupBy(logs.level);

	const counts: Record<string, number> = {
		DEBUG: 0,
		INFO: 0,
		WARN: 0,
		ERROR: 0
	};

	for (const row of result) {
		counts[row.level] = row.count;
	}

	return counts as Record<LogLevelType, number>;
}

// =============================================================================
// Log Cleanup
// =============================================================================

/**
 * Delete all logs
 *
 * @returns Number of logs deleted
 */
export async function deleteAllLogs(): Promise<number> {
	const result = await db.delete(logs).returning();
	return result.length;
}

/**
 * Delete logs older than a certain timestamp
 *
 * @param olderThanTimestamp - Delete logs with timestamp less than this
 * @returns Number of logs deleted
 */
export async function deleteLogsOlderThan(olderThanTimestamp: number): Promise<number> {
	const result = await db
		.delete(logs)
		.where(lt(logs.timestamp, olderThanTimestamp))
		.returning();
	return result.length;
}

/**
 * Keep only the most recent N logs
 *
 * @param keepCount - Number of logs to keep
 * @returns Number of logs deleted
 */
export async function trimLogsToCount(keepCount: number): Promise<number> {
	// Get the ID of the Nth most recent log
	const cutoffResult = await db
		.select({ id: logs.id })
		.from(logs)
		.orderBy(desc(logs.id))
		.limit(1)
		.offset(keepCount);

	const cutoffEntry = cutoffResult[0];
	if (!cutoffEntry) {
		// Not enough logs to trim
		return 0;
	}

	const cutoffId = cutoffEntry.id;

	// Delete logs older than the cutoff
	const result = await db.delete(logs).where(lt(logs.id, cutoffId)).returning();
	return result.length;
}

/**
 * Run retention cleanup based on settings
 *
 * @returns Object with counts of logs deleted by each method
 */
export async function runRetentionCleanup(): Promise<{ byAge: number; byCount: number }> {
	// Get retention settings
	const retentionDays = await getLogRetentionDays();
	const maxCount = await getLogMaxCount();

	// Delete by age
	const ageThreshold = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
	const byAge = await deleteLogsOlderThan(ageThreshold);

	// Delete by count
	const byCount = await trimLogsToCount(maxCount);

	return { byAge, byCount };
}

// =============================================================================
// Settings Helpers
// =============================================================================

/**
 * Get log retention days setting
 */
export async function getLogRetentionDays(): Promise<number> {
	const result = await db
		.select()
		.from(appSettings)
		.where(eq(appSettings.key, LogSettingsKey.RETENTION_DAYS))
		.limit(1);

	if (result[0]?.value) {
		const parsed = parseInt(result[0].value, 10);
		if (!isNaN(parsed) && parsed > 0) {
			return parsed;
		}
	}

	return LogSettingsDefaults.RETENTION_DAYS;
}

/**
 * Get log max count setting
 */
export async function getLogMaxCount(): Promise<number> {
	const result = await db
		.select()
		.from(appSettings)
		.where(eq(appSettings.key, LogSettingsKey.MAX_COUNT))
		.limit(1);

	if (result[0]?.value) {
		const parsed = parseInt(result[0].value, 10);
		if (!isNaN(parsed) && parsed > 0) {
			return parsed;
		}
	}

	return LogSettingsDefaults.MAX_COUNT;
}

/**
 * Check if debug logging is enabled
 */
export async function isDebugEnabled(): Promise<boolean> {
	const result = await db
		.select()
		.from(appSettings)
		.where(eq(appSettings.key, LogSettingsKey.DEBUG_ENABLED))
		.limit(1);

	return result[0]?.value === 'true';
}

/**
 * Set log retention days
 */
export async function setLogRetentionDays(days: number): Promise<void> {
	await db
		.insert(appSettings)
		.values({ key: LogSettingsKey.RETENTION_DAYS, value: days.toString() })
		.onConflictDoUpdate({
			target: appSettings.key,
			set: { value: days.toString() }
		});
}

/**
 * Set log max count
 */
export async function setLogMaxCount(count: number): Promise<void> {
	await db
		.insert(appSettings)
		.values({ key: LogSettingsKey.MAX_COUNT, value: count.toString() })
		.onConflictDoUpdate({
			target: appSettings.key,
			set: { value: count.toString() }
		});
}

/**
 * Set debug enabled
 */
export async function setDebugEnabled(enabled: boolean): Promise<void> {
	await db
		.insert(appSettings)
		.values({ key: LogSettingsKey.DEBUG_ENABLED, value: enabled.toString() })
		.onConflictDoUpdate({
			target: appSettings.key,
			set: { value: enabled.toString() }
		});
}
