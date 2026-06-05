import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { CRON_REQUIRED_MESSAGE } from '$lib/cron/validation';
import { db } from '$lib/server/db/client';
import { logs } from '$lib/server/db/schema';
import { LogLevel, stopLogRetentionScheduler } from '$lib/server/logging';
import {
	actions as logActions,
	load as logsLoad
} from '../../../src/routes/admin/logs/+page.server';
import { actions as dataActions } from '../../../src/routes/admin/settings/data/+page.server';
import { actions as syncActions } from '../../../src/routes/admin/sync/+page.server';
import { resetSharedTestDb } from '../../helpers/db';

type DataActionName = keyof typeof dataActions;
type ExportLogsAction = NonNullable<typeof logActions.exportLogs>;
type InitSchedulerAction = NonNullable<typeof syncActions.initScheduler>;
type LogsLoadData = Exclude<Awaited<ReturnType<typeof logsLoad>>, void>;

const adminLocals = {
	user: { id: 1, plexId: 1, username: 'admin', isAdmin: true }
} as unknown as App.Locals;

beforeEach(resetSharedTestDb);
afterEach(stopLogRetentionScheduler);

function formRequest(url: string, fields: Record<string, string> = {}): Request {
	const formData = new FormData();
	for (const [key, value] of Object.entries(fields)) formData.set(key, value);
	return new Request(url, { method: 'POST', body: formData });
}

async function runDataAction(action: DataActionName, fields: Record<string, string> = {}) {
	const handler = dataActions[action] as (args: {
		request: Request;
		locals: App.Locals;
	}) => unknown;
	return handler({
		request: formRequest(`http://localhost/admin/settings/data?/${action}`, fields),
		locals: adminLocals
	});
}

async function seedLog(entry: {
	level: (typeof LogLevel)[keyof typeof LogLevel];
	message: string;
	timestamp: number;
	source?: string;
}): Promise<void> {
	await db.insert(logs).values({
		level: entry.level,
		message: entry.message,
		source: entry.source ?? null,
		metadata: null,
		timestamp: entry.timestamp
	});
}

const messages = (data: LogsLoadData) =>
	(data.logs as Array<{ message: string }>).map((entry) => entry.message);

describe('admin data maintenance actions', () => {
	it.each([
		['getCacheCount', {}, { success: true, count: 0, year: undefined }],
		['getCacheCount', { year: '2024' }, { success: true, count: 0, year: 2024 }],
		['getCacheCount', { year: '   ' }, { success: true, count: 0, year: undefined }],
		['getCacheCount', { year: '2024.5' }, { success: true, count: 0, year: 2024 }],
		['getCacheCount', { year: '-1' }, { success: true, count: 0, year: -1 }],
		['getPlayHistoryCount', {}, { success: true, count: 0, year: undefined }],
		['getPlayHistoryCount', { year: '2024' }, { success: true, count: 0, year: 2024 }]
	] as const)('%s returns count for %o', async (action, fields, expected) => {
		const result = (await runDataAction(action, fields)) as Record<string, unknown>;
		expect(result).toMatchObject({ success: true, count: expected.count });
		if (expected.year === undefined) expect(result.year).toBeUndefined();
		else expect(result.year).toBe(expected.year);
	});

	it.each([
		['clearCache', {}, 'Cleared 0 cache entries'],
		['clearCache', { year: '2025' }, 'Cleared 0 cache entries for 2025'],
		['clearPlayHistory', {}, 'Deleted 0 play history records'],
		['clearPlayHistory', { year: '2023' }, 'Deleted 0 play history records for 2023']
	] as const)('%s reports empty-table result for %o', async (action, fields, message) => {
		expect(await runDataAction(action, fields)).toMatchObject({ success: true, message });
	});

	it.each([
		['getCacheCount', 'twenty-two'],
		['clearCache', 'NaN'],
		['getPlayHistoryCount', 'recent'],
		['clearPlayHistory', 'all-of-time']
	] as const)('%s rejects unparseable year', async (action, year) => {
		expect(await runDataAction(action, { year })).toMatchObject({
			status: 400,
			data: { error: 'Invalid year' }
		});
	});
});

describe('admin logs page load/actions', () => {
	it('exportLogs returns valid JSON for the filtered result set', async () => {
		await seedLog({
			level: LogLevel.INFO,
			message: 'kept sync event',
			source: 'Sync',
			timestamp: 1000
		});
		await seedLog({
			level: LogLevel.ERROR,
			message: 'ignored auth event',
			source: 'Auth',
			timestamp: 2000
		});

		const exportLogs = logActions.exportLogs as ExportLogsAction;
		const result = await exportLogs({
			locals: adminLocals,
			url: new URL('http://localhost/admin/logs?levels=INFO&search=sync&source=Sync')
		} as unknown as Parameters<ExportLogsAction>[0]);

		expect(result).toMatchObject({ success: true });
		const parsed = JSON.parse((result as { exportData?: string }).exportData ?? '[]') as Array<{
			message: string;
			level: string;
		}>;
		expect(parsed.map((entry) => entry.message)).toEqual(['kept sync event']);
		expect(parsed[0]?.level).toBe(LogLevel.INFO);
	});

	it('load paginates with cursor and reports hasMore for load-more links', async () => {
		for (let i = 1; i <= 4; i++) {
			await seedLog({ level: LogLevel.INFO, message: `entry ${i}`, timestamp: 1000 + i });
		}

		const firstPage = (await logsLoad({
			url: new URL('http://localhost/admin/logs?limit=2')
		} as Parameters<typeof logsLoad>[0])) as LogsLoadData;
		expect(messages(firstPage)).toEqual(['entry 4', 'entry 3']);
		expect(firstPage.hasMore).toBe(true);

		const cursor = firstPage.logs.at(-1)?.id;
		expect(cursor).toBeNumber();
		const secondPage = (await logsLoad({
			url: new URL(`http://localhost/admin/logs?limit=2&cursor=${cursor}`)
		} as Parameters<typeof logsLoad>[0])) as LogsLoadData;
		expect(messages(secondPage)).toEqual(['entry 2', 'entry 1']);
		expect(secondPage).toMatchObject({ hasMore: false, filters: { cursor } });
	});

	it('load filters by manual datetime timestamp fields', async () => {
		await seedLog({ level: LogLevel.INFO, message: 'before window', timestamp: 999 });
		await seedLog({ level: LogLevel.INFO, message: 'inside window', timestamp: 1500 });
		await seedLog({ level: LogLevel.INFO, message: 'after window', timestamp: 2001 });

		const data = (await logsLoad({
			url: new URL('http://localhost/admin/logs?from=1000&to=2000')
		} as Parameters<typeof logsLoad>[0])) as LogsLoadData;

		expect(messages(data)).toEqual(['inside window']);
		expect(data.filters).toMatchObject({ fromTimestamp: 1000, toTimestamp: 2000 });
	});
});

describe('admin sync actions', () => {
	it('rejects an explicitly empty cron expression', async () => {
		const handler = syncActions.initScheduler as InitSchedulerAction;
		const result = await handler({
			request: formRequest('http://localhost/admin/sync?/initScheduler', { cronExpression: '' }),
			locals: adminLocals
		} as Parameters<InitSchedulerAction>[0]);

		expect(result).toMatchObject({
			status: 400,
			data: { error: CRON_REQUIRED_MESSAGE, cronError: CRON_REQUIRED_MESSAGE, cronExpression: '' }
		});
	});
});
