import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { db } from '$lib/server/db/client';
import { appSettings, logs } from '$lib/server/db/schema';
import { Logger } from '$lib/server/logging/logger';
import {
	deleteAllLogs,
	deleteLogsOlderThan,
	getDistinctSources,
	getLatestLogId,
	getLogCountsByLevel,
	getLogMaxCount,
	getLogRetentionDays,
	getLogsAfterId,
	insertLog,
	insertLogsBatch,
	isDebugEnabled,
	queryLogs,
	runRetentionCleanup,
	setDebugEnabled,
	setLogMaxCount,
	setLogRetentionDays,
	trimLogsToCount
} from '$lib/server/logging/service';
import {
	LogLevel,
	type LogQueryOptions,
	LogSettingsDefaults,
	LogSettingsKey
} from '$lib/server/logging/types';
import { resetSharedTestDb } from '../../helpers/db';

const DAY_MS = 24 * 60 * 60 * 1000;
const QUERY_FIXTURE = [
	{ level: LogLevel.DEBUG, message: 'Debug message', source: 'ComponentA' },
	{ level: LogLevel.INFO, message: 'Info message', source: 'ComponentA' },
	{ level: LogLevel.WARN, message: 'Warning message', source: 'ComponentB' },
	{ level: LogLevel.ERROR, message: 'Error message', source: 'ComponentB' }
] as const;

type ConsoleMethod = 'debug' | 'error' | 'log' | 'warn';
type LogMethod = 'error' | 'info' | 'warn';

async function seedQueryLogs() {
	await insertLogsBatch([...QUERY_FIXTURE]);
}

async function seedAgedLogs() {
	const now = Date.now();
	await db.insert(logs).values([
		{ level: LogLevel.INFO, message: 'Old log 1', timestamp: now - 10 * DAY_MS },
		{ level: LogLevel.INFO, message: 'Old log 2', timestamp: now - 5 * DAY_MS },
		{ level: LogLevel.INFO, message: 'Recent log 1', timestamp: now - DAY_MS },
		{ level: LogLevel.INFO, message: 'Recent log 2', timestamp: now }
	]);
}

async function logRows() {
	return db.select().from(logs);
}

function messagesFrom(rows: Awaited<ReturnType<typeof logRows>>) {
	return rows.map((row) => row.message);
}

describe('logging service and logger', () => {
	let logger: InstanceType<typeof Logger>;
	let originalConsole: Pick<Console, ConsoleMethod>;
	let debugCalls: string[];

	beforeEach(async () => {
		await resetSharedTestDb();
		logger = new Logger();
		debugCalls = [];
		originalConsole = {
			debug: console.debug,
			error: console.error,
			log: console.log,
			warn: console.warn
		};
		console.debug = mock((message: string) => debugCalls.push(message)) as typeof console.debug;
		console.error = mock(() => {}) as typeof console.error;
		console.log = mock(() => {}) as typeof console.log;
		console.warn = mock(() => {}) as typeof console.warn;
	});

	afterEach(async () => {
		await logger.forceFlush();
		console.debug = originalConsole.debug;
		console.error = originalConsole.error;
		console.log = originalConsole.log;
		console.warn = originalConsole.warn;
	});

	describe('service persistence and querying', () => {
		it('inserts single and batch entries with source, metadata, timestamp, and newest-first order', async () => {
			const before = Date.now();
			await insertLog({
				level: LogLevel.ERROR,
				message: 'Single entry',
				source: 'ServiceTest',
				metadata: { errorCode: 500 }
			});
			await insertLogsBatch([
				{ level: LogLevel.INFO, message: 'First' },
				{ level: LogLevel.WARN, message: 'Second' }
			]);
			await insertLogsBatch([]);

			const result = await queryLogs();
			expect(result.totalCount).toBe(3);
			expect(messagesFrom(result.logs)).toEqual(['Second', 'First', 'Single entry']);
			expect(result.logs.at(-1)).toMatchObject({
				level: LogLevel.ERROR,
				message: 'Single entry',
				source: 'ServiceTest',
				metadata: '{"errorCode":500}'
			});
			expect(result.logs.at(-1)?.timestamp).toBeGreaterThanOrEqual(before);
		});

		describe('queryLogs filters', () => {
			const queryCases: Array<[string, LogQueryOptions | undefined, number, string[]]> = [
				[
					'no filters',
					undefined,
					4,
					['Error message', 'Warning message', 'Info message', 'Debug message']
				],
				['level', { levels: [LogLevel.ERROR] }, 1, ['Error message']],
				[
					'multiple levels',
					{ levels: [LogLevel.WARN, LogLevel.ERROR] },
					2,
					['Error message', 'Warning message']
				],
				['source', { source: 'ComponentA' }, 2, ['Info message', 'Debug message']],
				['trimmed search', { search: ' Warning ' }, 1, ['Warning message']],
				[
					'blank search',
					{ search: '   ' },
					4,
					['Error message', 'Warning message', 'Info message', 'Debug message']
				]
			];

			beforeEach(seedQueryLogs);

			it.each(queryCases)('applies %s', async (_name, options, expectedCount, expectedMessages) => {
				const result = await queryLogs(options);

				expect(result.totalCount).toBe(expectedCount);
				expect(messagesFrom(result.logs)).toEqual(expectedMessages);
				expect(result.hasMore).toBe(false);
			});

			it('filters by time and supports cursor pagination', async () => {
				const ranged = await queryLogs({
					fromTimestamp: Date.now() - 1000,
					toTimestamp: Date.now() + 1000
				});
				const firstPage = await queryLogs({ limit: 2 });
				const cursor = firstPage.logs.at(-1)?.id;
				const secondPage = await queryLogs({ cursor, limit: 2 });

				expect(ranged.logs).toHaveLength(4);
				expect(firstPage).toMatchObject({ hasMore: true, totalCount: 4 });
				expect(secondPage.logs).toHaveLength(2);
				expect(secondPage.logs.every((log) => log.id < cursor!)).toBe(true);
			});

			it('returns incremental IDs, latest ID, distinct sources, and level counts', async () => {
				const all = await queryLogs();
				const minId = Math.min(...all.logs.map((log) => log.id));
				const maxId = Math.max(...all.logs.map((log) => log.id));

				expect(await getLogsAfterId(minId)).toHaveLength(3);
				expect(await getLogsAfterId(0, 2)).toHaveLength(2);
				expect(await getLogsAfterId(maxId)).toHaveLength(0);
				expect(await getLatestLogId()).toBe(maxId);
				expect(await getDistinctSources()).toEqual(['ComponentA', 'ComponentB']);
				expect(await getLogCountsByLevel()).toEqual({ DEBUG: 1, INFO: 1, WARN: 1, ERROR: 1 });

				await resetSharedTestDb();
				await insertLog({ level: LogLevel.INFO, message: 'No source' });
				expect(await getLatestLogId()).toBeGreaterThan(0);
				expect(await getDistinctSources()).toEqual([]);
				expect(await getLogCountsByLevel()).toEqual({ DEBUG: 0, INFO: 1, WARN: 0, ERROR: 0 });
			});
		});
	});

	describe('cleanup and settings helpers', () => {
		beforeEach(seedAgedLogs);

		it.each([
			['deleteAllLogs', async () => deleteAllLogs(), 4, 0],
			['deleteLogsOlderThan', async () => deleteLogsOlderThan(Date.now() - 3 * DAY_MS), 2, 2],
			['trimLogsToCount', async () => trimLogsToCount(2), 1, 3],
			['trimLogsToCount above total', async () => trimLogsToCount(10), 0, 4]
		] as const)('%s returns deleted count and leaves expected rows', async (_name, cleanup, deleted, remaining) => {
			expect(await cleanup()).toBe(deleted);
			expect((await queryLogs()).logs).toHaveLength(remaining);
		});

		it('runs retention cleanup with configured and default settings', async () => {
			await setLogRetentionDays(3);
			await setLogMaxCount(2);
			expect(await runRetentionCleanup()).toEqual({ byAge: 2, byCount: 0 });

			await resetSharedTestDb();
			await insertLogsBatch(
				Array.from({ length: 10 }, (_, i) => ({ level: LogLevel.INFO, message: `Log ${i}` }))
			);
			expect(await runRetentionCleanup()).toEqual({ byAge: 0, byCount: 0 });
		});

		it.each([
			[
				'retention days default',
				getLogRetentionDays,
				undefined,
				LogSettingsDefaults.RETENTION_DAYS
			],
			['retention days stored', getLogRetentionDays, ['14'], 14],
			[
				'retention days invalid',
				getLogRetentionDays,
				['not-a-number'],
				LogSettingsDefaults.RETENTION_DAYS
			],
			[
				'retention days non-positive',
				getLogRetentionDays,
				['0'],
				LogSettingsDefaults.RETENTION_DAYS
			],
			['max count default', getLogMaxCount, undefined, LogSettingsDefaults.MAX_COUNT],
			['max count stored', getLogMaxCount, ['10000'], 10000],
			['max count invalid', getLogMaxCount, ['nope'], LogSettingsDefaults.MAX_COUNT],
			['debug missing', isDebugEnabled, undefined, false],
			['debug true', isDebugEnabled, ['true'], true],
			['debug false', isDebugEnabled, ['false'], false]
		] as const)('%s', async (name, getter, value, expected) => {
			await resetSharedTestDb();
			const key = name.startsWith('retention')
				? LogSettingsKey.RETENTION_DAYS
				: name.startsWith('max count')
					? LogSettingsKey.MAX_COUNT
					: LogSettingsKey.DEBUG_ENABLED;
			if (value) await db.insert(appSettings).values({ key, value: value[0] });

			expect(await getter()).toBe(expected);
		});

		it('upserts writable settings', async () => {
			await setLogRetentionDays(7);
			await setLogRetentionDays(14);
			await setLogMaxCount(100_000);
			await setDebugEnabled(true);
			await setDebugEnabled(false);

			expect(await getLogRetentionDays()).toBe(14);
			expect(await getLogMaxCount()).toBe(100_000);
			expect(await isDebugEnabled()).toBe(false);
		});
	});

	describe('Logger facade', () => {
		it.each([
			['info', LogLevel.INFO],
			['warn', LogLevel.WARN],
			['error', LogLevel.ERROR]
		] as const)('buffers and flushes %s entries', async (method: LogMethod, level) => {
			logger[method](`${method} message`, 'Facade', { key: 'value' });
			await logger.forceFlush();

			const row = (await logRows()).find((log) => log.message === `${method} message`);
			expect(row).toMatchObject({ level, source: 'Facade', metadata: '{"key":"value"}' });
		});

		it('uses a nullable source by default and forceFlush is idempotent', async () => {
			logger.info('Single log');
			await logger.forceFlush();
			await logger.forceFlush();

			const rows = await logRows();
			expect(rows.filter((row) => row.message === 'Single log')).toHaveLength(1);
			expect(rows[0]?.source).toBeNull();
		});

		it('auto-flushes at the batch size', async () => {
			for (let i = 0; i < 50; i++) logger.info(`Batch message ${i}`);
			await new Promise((resolve) => setTimeout(resolve, 200));

			expect((await logRows()).length).toBeGreaterThanOrEqual(50);
		});

		it('only persists and prints debug entries when enabled, with cache reset support', async () => {
			await logger.debug('disabled debug', 'Debug');
			expect(debugCalls).toEqual([]);

			await setDebugEnabled(true);
			logger.clearDebugCache();
			await logger.debug('enabled debug', 'Debug');
			await resetSharedTestDb();
			await logger.debug('cached debug', 'Debug');
			logger.clearDebugCache();
			await logger.debug('disabled after clear', 'Debug');
			await logger.forceFlush();

			const messages = messagesFrom(await logRows());
			expect(messages).toContain('enabled debug');
			expect(messages).toContain('cached debug');
			expect(messages).not.toContain('disabled debug');
			expect(messages).not.toContain('disabled after clear');
			expect(debugCalls).toHaveLength(2);
		});

		it('redacts secrets before printing and persisting debug logs', async () => {
			await setDebugEnabled(true);
			logger.clearDebugCache();

			await logger.debug(
				'GET https://user:pass@example.com/?X-Plex-Token=secret Authorization: Bearer secret Cookie: session=secret',
				'Debug',
				{
					url: 'https://example.com/?token=secret',
					authToken: 'provider-auth-token',
					access_token: 'provider-access-token',
					authorization: 'Bearer provider-authorization-token',
					'X-Plex-Token': 'provider-plex-token',
					apiKey: 'provider-api-key',
					password: 'provider-password',
					nested: { auth_token: 'nested-provider-token' }
				}
			);
			await logger.forceFlush();

			const debugLog = (await logRows()).find((row) => row.level === LogLevel.DEBUG);
			expect(debugLog?.message).toContain('<redacted>');
			expect(debugLog?.message).not.toContain('secret');
			expect(debugLog?.message).not.toContain('user:pass');
			expect(debugCalls[0]).toBe(`[Debug] ${debugLog?.message}`);
			const metadata = JSON.parse(debugLog?.metadata ?? '{}') as Record<string, unknown>;
			expect(metadata.access_token).toBe('<redacted>');
			expect(metadata.authorization).toBe('<redacted>');
			expect(metadata['X-Plex-Token']).toBe('<redacted>');
			expect(metadata.apiKey).toBe('<redacted>');
			expect((metadata.nested as Record<string, unknown>).auth_token).toBe('<redacted>');
			expect(debugLog?.metadata).not.toContain('provider-');
			expect(debugLog?.metadata).not.toContain('token=secret');
		});
	});
});
