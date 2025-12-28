import { db } from '$lib/server/db/client';
import { logs, appSettings } from '$lib/server/db/schema';
import { eq, and, or, lt, desc, sql, like, inArray } from 'drizzle-orm';
import type { LogEntry, NewLogEntry, LogQueryOptions, LogQueryResult, LogLevelType } from './types';
import { LogSettingsKey, LogSettingsDefaults } from './types';

export async function insertLog(entry: NewLogEntry): Promise<void> {
	await db.insert(logs).values({
		level: entry.level,
		message: entry.message,
		source: entry.source ?? null,
		metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
		timestamp: Date.now()
	});
}

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

export async function queryLogs(options: LogQueryOptions = {}): Promise<LogQueryResult> {
	const { levels, search, source, fromTimestamp, toTimestamp, cursor, limit = 100 } = options;

	const conditions = [];

	if (levels && levels.length > 0) {
		conditions.push(inArray(logs.level, levels));
	}

	if (source) {
		conditions.push(eq(logs.source, source));
	}

	if (fromTimestamp) {
		conditions.push(sql`${logs.timestamp} >= ${fromTimestamp}`);
	}
	if (toTimestamp) {
		conditions.push(sql`${logs.timestamp} <= ${toTimestamp}`);
	}

	if (cursor) {
		conditions.push(lt(logs.id, cursor));
	}

	if (search) {
		conditions.push(like(logs.message, `%${search}%`));
	}

	const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

	const countResult = await db
		.select({ count: sql<number>`count(*)` })
		.from(logs)
		.where(whereClause);
	const totalCount = countResult[0]?.count ?? 0;

	const logResults = await db
		.select()
		.from(logs)
		.where(whereClause)
		.orderBy(desc(logs.id))
		.limit(limit + 1);

	const hasMore = logResults.length > limit;
	const logsToReturn = hasMore ? logResults.slice(0, limit) : logResults;

	return {
		logs: logsToReturn as LogEntry[],
		hasMore,
		totalCount
	};
}

export async function getLogsAfterId(afterId: number, limit = 100): Promise<LogEntry[]> {
	const result = await db
		.select()
		.from(logs)
		.where(sql`${logs.id} > ${afterId}`)
		.orderBy(logs.id)
		.limit(limit);

	return result as LogEntry[];
}

export async function getLatestLogId(): Promise<number> {
	const result = await db.select({ id: logs.id }).from(logs).orderBy(desc(logs.id)).limit(1);

	return result[0]?.id ?? 0;
}

export async function getDistinctSources(): Promise<string[]> {
	const result = await db
		.selectDistinct({ source: logs.source })
		.from(logs)
		.where(sql`${logs.source} IS NOT NULL`)
		.orderBy(logs.source);

	return result.map((r) => r.source).filter((s): s is string => s !== null);
}

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

export async function deleteAllLogs(): Promise<number> {
	const result = await db.delete(logs).returning();
	return result.length;
}

export async function deleteLogsOlderThan(olderThanTimestamp: number): Promise<number> {
	const result = await db.delete(logs).where(lt(logs.timestamp, olderThanTimestamp)).returning();
	return result.length;
}

export async function trimLogsToCount(keepCount: number): Promise<number> {
	const cutoffResult = await db
		.select({ id: logs.id })
		.from(logs)
		.orderBy(desc(logs.id))
		.limit(1)
		.offset(keepCount);

	const cutoffEntry = cutoffResult[0];
	if (!cutoffEntry) {
		return 0;
	}

	const cutoffId = cutoffEntry.id;
	const result = await db.delete(logs).where(lt(logs.id, cutoffId)).returning();
	return result.length;
}

export async function runRetentionCleanup(): Promise<{ byAge: number; byCount: number }> {
	const retentionDays = await getLogRetentionDays();
	const maxCount = await getLogMaxCount();

	const ageThreshold = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
	const byAge = await deleteLogsOlderThan(ageThreshold);

	const byCount = await trimLogsToCount(maxCount);

	return { byAge, byCount };
}

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

export async function isDebugEnabled(): Promise<boolean> {
	const result = await db
		.select()
		.from(appSettings)
		.where(eq(appSettings.key, LogSettingsKey.DEBUG_ENABLED))
		.limit(1);

	return result[0]?.value === 'true';
}

export async function setLogRetentionDays(days: number): Promise<void> {
	await db
		.insert(appSettings)
		.values({ key: LogSettingsKey.RETENTION_DAYS, value: days.toString() })
		.onConflictDoUpdate({
			target: appSettings.key,
			set: { value: days.toString() }
		});
}

export async function setLogMaxCount(count: number): Promise<void> {
	await db
		.insert(appSettings)
		.values({ key: LogSettingsKey.MAX_COUNT, value: count.toString() })
		.onConflictDoUpdate({
			target: appSettings.key,
			set: { value: count.toString() }
		});
}

export async function setDebugEnabled(enabled: boolean): Promise<void> {
	await db
		.insert(appSettings)
		.values({ key: LogSettingsKey.DEBUG_ENABLED, value: enabled.toString() })
		.onConflictDoUpdate({
			target: appSettings.key,
			set: { value: enabled.toString() }
		});
}
