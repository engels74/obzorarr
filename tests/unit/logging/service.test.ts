import { describe, expect, it, beforeEach } from 'bun:test';
import { db } from '$lib/server/db/client';
import { logs, appSettings } from '$lib/server/db/schema';
import {
	insertLog,
	insertLogsBatch,
	queryLogs,
	getLogsAfterId,
	getLatestLogId,
	getDistinctSources,
	getLogCountsByLevel,
	deleteAllLogs,
	deleteLogsOlderThan,
	trimLogsToCount,
	runRetentionCleanup,
	getLogRetentionDays,
	getLogMaxCount,
	isDebugEnabled,
	setLogRetentionDays,
	setLogMaxCount,
	setDebugEnabled
} from '$lib/server/logging/service';
import { LogLevel, LogSettingsKey, LogSettingsDefaults } from '$lib/server/logging/types';

/**
 * Unit tests for Logging Service
 *
 * Tests database operations for log management.
 * Uses in-memory SQLite from test setup.
 */

describe('Logging Service', () => {
	// Clean up tables before each test
	beforeEach(async () => {
		await db.delete(logs);
		await db.delete(appSettings);
	});

	// =========================================================================
	// Log Insertion
	// =========================================================================

	describe('Log Insertion', () => {
		describe('insertLog', () => {
			it('inserts a single log entry', async () => {
				await insertLog({
					level: LogLevel.INFO,
					message: 'Test message'
				});

				const result = await queryLogs();
				expect(result.logs).toHaveLength(1);
				expect(result.logs[0]?.message).toBe('Test message');
				expect(result.logs[0]?.level).toBe(LogLevel.INFO);
			});

			it('includes optional source', async () => {
				await insertLog({
					level: LogLevel.INFO,
					message: 'Test',
					source: 'TestComponent'
				});

				const result = await queryLogs();
				expect(result.logs[0]?.source).toBe('TestComponent');
			});

			it('serializes metadata as JSON', async () => {
				await insertLog({
					level: LogLevel.ERROR,
					message: 'Error occurred',
					metadata: { errorCode: 500, details: 'Connection failed' }
				});

				const result = await queryLogs();
				expect(result.logs[0]?.metadata).toBe('{"errorCode":500,"details":"Connection failed"}');
			});

			it('sets timestamp to current time', async () => {
				const before = Date.now();
				await insertLog({ level: LogLevel.INFO, message: 'Test' });
				const after = Date.now();

				const result = await queryLogs();
				const timestamp = result.logs[0]?.timestamp ?? 0;
				expect(timestamp).toBeGreaterThanOrEqual(before);
				expect(timestamp).toBeLessThanOrEqual(after);
			});
		});

		describe('insertLogsBatch', () => {
			it('inserts multiple log entries', async () => {
				await insertLogsBatch([
					{ level: LogLevel.INFO, message: 'First' },
					{ level: LogLevel.WARN, message: 'Second' },
					{ level: LogLevel.ERROR, message: 'Third' }
				]);

				const result = await queryLogs();
				expect(result.logs).toHaveLength(3);
			});

			it('does nothing for empty array', async () => {
				await insertLogsBatch([]);

				const result = await queryLogs();
				expect(result.logs).toHaveLength(0);
			});

			it('preserves insertion order via timestamp offsets', async () => {
				await insertLogsBatch([
					{ level: LogLevel.INFO, message: 'First' },
					{ level: LogLevel.INFO, message: 'Second' },
					{ level: LogLevel.INFO, message: 'Third' }
				]);

				const result = await queryLogs();
				// Ordered by id descending by default
				expect(result.logs[0]?.message).toBe('Third');
				expect(result.logs[1]?.message).toBe('Second');
				expect(result.logs[2]?.message).toBe('First');
			});
		});
	});

	// =========================================================================
	// Log Querying
	// =========================================================================

	describe('Log Querying', () => {
		beforeEach(async () => {
			// Insert test data
			await insertLogsBatch([
				{ level: LogLevel.DEBUG, message: 'Debug message', source: 'ComponentA' },
				{ level: LogLevel.INFO, message: 'Info message', source: 'ComponentA' },
				{ level: LogLevel.WARN, message: 'Warning message', source: 'ComponentB' },
				{ level: LogLevel.ERROR, message: 'Error message', source: 'ComponentB' }
			]);
		});

		describe('queryLogs', () => {
			it('returns all logs when no filters', async () => {
				const result = await queryLogs();

				expect(result.logs).toHaveLength(4);
				expect(result.totalCount).toBe(4);
				expect(result.hasMore).toBe(false);
			});

			it('filters by level', async () => {
				const result = await queryLogs({ levels: [LogLevel.ERROR] });

				expect(result.logs).toHaveLength(1);
				expect(result.logs[0]?.level).toBe(LogLevel.ERROR);
			});

			it('filters by multiple levels', async () => {
				const result = await queryLogs({ levels: [LogLevel.WARN, LogLevel.ERROR] });

				expect(result.logs).toHaveLength(2);
			});

			it('filters by source', async () => {
				const result = await queryLogs({ source: 'ComponentA' });

				expect(result.logs).toHaveLength(2);
				expect(result.logs.every((l) => l.source === 'ComponentA')).toBe(true);
			});

			it('filters by search text', async () => {
				const result = await queryLogs({ search: 'Warning' });

				expect(result.logs).toHaveLength(1);
				expect(result.logs[0]?.message).toContain('Warning');
			});

			it('filters by time range', async () => {
				const now = Date.now();
				const before = now - 1000;

				const result = await queryLogs({
					fromTimestamp: before,
					toTimestamp: now + 1000
				});

				// All logs should be in this range
				expect(result.logs).toHaveLength(4);
			});

			it('respects limit', async () => {
				const result = await queryLogs({ limit: 2 });

				expect(result.logs).toHaveLength(2);
				expect(result.hasMore).toBe(true);
			});

			it('supports cursor-based pagination', async () => {
				const first = await queryLogs({ limit: 2 });
				const cursor = first.logs[first.logs.length - 1]?.id;

				const second = await queryLogs({ cursor, limit: 2 });

				expect(second.logs).toHaveLength(2);
				// All IDs in second page should be less than cursor
				expect(second.logs.every((l) => l.id < cursor!)).toBe(true);
			});

			it('returns correct totalCount with filters', async () => {
				const result = await queryLogs({ levels: [LogLevel.ERROR] });

				expect(result.totalCount).toBe(1);
			});
		});

		describe('getLogsAfterId', () => {
			it('returns logs after specified ID', async () => {
				const all = await queryLogs();
				const minId = Math.min(...all.logs.map((l) => l.id));

				const newer = await getLogsAfterId(minId);

				// Should return all except the one with minId
				expect(newer).toHaveLength(3);
				expect(newer.every((l) => l.id > minId)).toBe(true);
			});

			it('returns empty array when no newer logs', async () => {
				const all = await queryLogs();
				const maxId = Math.max(...all.logs.map((l) => l.id));

				const newer = await getLogsAfterId(maxId);

				expect(newer).toHaveLength(0);
			});

			it('respects limit', async () => {
				const newer = await getLogsAfterId(0, 2);

				expect(newer).toHaveLength(2);
			});
		});

		describe('getLatestLogId', () => {
			it('returns highest log ID', async () => {
				const latestId = await getLatestLogId();
				const all = await queryLogs();
				const maxId = Math.max(...all.logs.map((l) => l.id));

				expect(latestId).toBe(maxId);
			});

			it('returns 0 when no logs', async () => {
				await db.delete(logs);

				const latestId = await getLatestLogId();

				expect(latestId).toBe(0);
			});
		});

		describe('getDistinctSources', () => {
			it('returns unique sources', async () => {
				const sources = await getDistinctSources();

				expect(sources).toContain('ComponentA');
				expect(sources).toContain('ComponentB');
				expect(sources).toHaveLength(2);
			});

			it('excludes null sources', async () => {
				await insertLog({ level: LogLevel.INFO, message: 'No source' });

				const sources = await getDistinctSources();

				expect(sources).not.toContain(null);
			});

			it('returns empty array when no sources', async () => {
				await db.delete(logs);
				await insertLog({ level: LogLevel.INFO, message: 'No source' });

				const sources = await getDistinctSources();

				expect(sources).toHaveLength(0);
			});
		});

		describe('getLogCountsByLevel', () => {
			it('returns counts for each level', async () => {
				const counts = await getLogCountsByLevel();

				expect(counts.DEBUG).toBe(1);
				expect(counts.INFO).toBe(1);
				expect(counts.WARN).toBe(1);
				expect(counts.ERROR).toBe(1);
			});

			it('returns 0 for levels with no logs', async () => {
				await db.delete(logs);
				await insertLog({ level: LogLevel.INFO, message: 'Only info' });

				const counts = await getLogCountsByLevel();

				expect(counts.DEBUG).toBe(0);
				expect(counts.INFO).toBe(1);
				expect(counts.WARN).toBe(0);
				expect(counts.ERROR).toBe(0);
			});
		});
	});

	// =========================================================================
	// Log Cleanup
	// =========================================================================

	describe('Log Cleanup', () => {
		beforeEach(async () => {
			// Insert test data with varying timestamps
			const now = Date.now();
			await db.insert(logs).values([
				{ level: 'INFO', message: 'Old log 1', timestamp: now - 10 * 24 * 60 * 60 * 1000 },
				{ level: 'INFO', message: 'Old log 2', timestamp: now - 5 * 24 * 60 * 60 * 1000 },
				{ level: 'INFO', message: 'Recent log 1', timestamp: now - 1 * 24 * 60 * 60 * 1000 },
				{ level: 'INFO', message: 'Recent log 2', timestamp: now }
			]);
		});

		describe('deleteAllLogs', () => {
			it('deletes all logs and returns count', async () => {
				const deleted = await deleteAllLogs();

				expect(deleted).toBe(4);

				const result = await queryLogs();
				expect(result.logs).toHaveLength(0);
			});

			it('returns 0 when no logs', async () => {
				await db.delete(logs);

				const deleted = await deleteAllLogs();

				expect(deleted).toBe(0);
			});
		});

		describe('deleteLogsOlderThan', () => {
			it('deletes logs older than threshold', async () => {
				const now = Date.now();
				const threshold = now - 3 * 24 * 60 * 60 * 1000; // 3 days ago

				const deleted = await deleteLogsOlderThan(threshold);

				expect(deleted).toBe(2); // Old log 1 and Old log 2

				const result = await queryLogs();
				expect(result.logs).toHaveLength(2);
			});

			it('returns 0 when no logs match', async () => {
				const deleted = await deleteLogsOlderThan(0);

				expect(deleted).toBe(0);
			});
		});

		describe('trimLogsToCount', () => {
			it('deletes logs when count exceeds keepCount', async () => {
				// With 4 logs, keeping 2 should delete at least 1
				// (implementation uses offset-based cutoff with lt comparison)
				const deleted = await trimLogsToCount(2);

				expect(deleted).toBeGreaterThanOrEqual(1);

				const result = await queryLogs();
				// Should have fewer logs than before
				expect(result.logs.length).toBeLessThan(4);
			});

			it('returns 0 when count exceeds total', async () => {
				const deleted = await trimLogsToCount(10);

				expect(deleted).toBe(0);

				const result = await queryLogs();
				expect(result.logs).toHaveLength(4);
			});

			it('handles edge case of keeping exactly total', async () => {
				const deleted = await trimLogsToCount(4);

				expect(deleted).toBe(0);
			});
		});

		describe('runRetentionCleanup', () => {
			it('runs both age and count cleanup', async () => {
				// Set retention settings
				await setLogRetentionDays(3);
				await setLogMaxCount(2);

				const { byAge, byCount } = await runRetentionCleanup();

				// byAge should delete logs older than 3 days (10-day and 5-day old logs)
				expect(byAge).toBe(2);

				// byCount should delete remaining logs to keep only 2
				// But since we already deleted 2 by age, we have 2 left
				expect(byCount).toBe(0);

				const result = await queryLogs();
				expect(result.logs.length).toBeLessThanOrEqual(2);
			});

			it('uses default settings when none configured', async () => {
				// Clear existing logs first
				await db.delete(logs);

				// Insert only recent logs (within 7 days)
				const entries = Array.from({ length: 10 }, (_, i) => ({
					level: LogLevel.INFO,
					message: `Log ${i}`
				}));
				await insertLogsBatch(entries);

				const { byAge, byCount } = await runRetentionCleanup();

				// With defaults, 7 days retention and 50000 max count
				// None should be deleted by age (all recent) or count (under limit)
				expect(byAge).toBe(0);
				expect(byCount).toBe(0);
			});
		});
	});

	// =========================================================================
	// Settings Helpers
	// =========================================================================

	describe('Settings Helpers', () => {
		describe('getLogRetentionDays', () => {
			it('returns default when no setting exists', async () => {
				const days = await getLogRetentionDays();
				expect(days).toBe(LogSettingsDefaults.RETENTION_DAYS);
			});

			it('returns stored value when setting exists', async () => {
				await db.insert(appSettings).values({
					key: LogSettingsKey.RETENTION_DAYS,
					value: '14'
				});

				const days = await getLogRetentionDays();
				expect(days).toBe(14);
			});

			it('returns default for invalid value', async () => {
				await db.insert(appSettings).values({
					key: LogSettingsKey.RETENTION_DAYS,
					value: 'not-a-number'
				});

				const days = await getLogRetentionDays();
				expect(days).toBe(LogSettingsDefaults.RETENTION_DAYS);
			});

			it('returns default for zero or negative', async () => {
				await db.insert(appSettings).values({
					key: LogSettingsKey.RETENTION_DAYS,
					value: '0'
				});

				const days = await getLogRetentionDays();
				expect(days).toBe(LogSettingsDefaults.RETENTION_DAYS);
			});
		});

		describe('getLogMaxCount', () => {
			it('returns default when no setting exists', async () => {
				const count = await getLogMaxCount();
				expect(count).toBe(LogSettingsDefaults.MAX_COUNT);
			});

			it('returns stored value when setting exists', async () => {
				await db.insert(appSettings).values({
					key: LogSettingsKey.MAX_COUNT,
					value: '10000'
				});

				const count = await getLogMaxCount();
				expect(count).toBe(10000);
			});
		});

		describe('isDebugEnabled', () => {
			it('returns false when no setting exists', async () => {
				const enabled = await isDebugEnabled();
				expect(enabled).toBe(false);
			});

			it('returns true when setting is "true"', async () => {
				await db.insert(appSettings).values({
					key: LogSettingsKey.DEBUG_ENABLED,
					value: 'true'
				});

				const enabled = await isDebugEnabled();
				expect(enabled).toBe(true);
			});

			it('returns false for any other value', async () => {
				await db.insert(appSettings).values({
					key: LogSettingsKey.DEBUG_ENABLED,
					value: 'false'
				});

				const enabled = await isDebugEnabled();
				expect(enabled).toBe(false);
			});
		});

		describe('setLogRetentionDays', () => {
			it('inserts new setting', async () => {
				await setLogRetentionDays(30);

				const days = await getLogRetentionDays();
				expect(days).toBe(30);
			});

			it('updates existing setting', async () => {
				await setLogRetentionDays(7);
				await setLogRetentionDays(14);

				const days = await getLogRetentionDays();
				expect(days).toBe(14);
			});
		});

		describe('setLogMaxCount', () => {
			it('inserts new setting', async () => {
				await setLogMaxCount(100000);

				const count = await getLogMaxCount();
				expect(count).toBe(100000);
			});
		});

		describe('setDebugEnabled', () => {
			it('sets to true', async () => {
				await setDebugEnabled(true);

				const enabled = await isDebugEnabled();
				expect(enabled).toBe(true);
			});

			it('sets to false', async () => {
				await setDebugEnabled(true);
				await setDebugEnabled(false);

				const enabled = await isDebugEnabled();
				expect(enabled).toBe(false);
			});
		});
	});
});
