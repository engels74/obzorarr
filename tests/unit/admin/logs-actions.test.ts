import { beforeEach, describe, expect, it } from 'bun:test';
import { db } from '$lib/server/db/client';
import { appSettings, logs } from '$lib/server/db/schema';
import { LogLevel } from '$lib/server/logging';
import { actions, load } from '../../../src/routes/admin/logs/+page.server';

type ExportLogsAction = NonNullable<typeof actions.exportLogs>;
type LoadArgs = Parameters<typeof load>[0];
type LogsLoadData = Exclude<Awaited<ReturnType<typeof load>>, void>;

const adminLocals = {
	user: { id: 1, plexId: 1, username: 'admin', isAdmin: true }
} as unknown as App.Locals;

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

async function invokeLoad(url: string): Promise<LogsLoadData> {
	return (await load({ url: new URL(url) } as unknown as LoadArgs)) as LogsLoadData;
}

async function invokeExport(url: string) {
	const exportLogs = actions.exportLogs as ExportLogsAction;
	return exportLogs({
		locals: adminLocals,
		url: new URL(url)
	} as unknown as Parameters<ExportLogsAction>[0]);
}

function logMessages(data: LogsLoadData): string[] {
	return (data.logs as Array<{ message: string }>).map((entry) => entry.message);
}

describe('admin logs page load/actions', () => {
	beforeEach(async () => {
		await db.delete(logs);
		await db.delete(appSettings);
	});

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

		const result = await invokeExport(
			'http://localhost/admin/logs?levels=INFO&search=sync&source=Sync'
		);

		expect(result).toMatchObject({ success: true });
		const exportData = (result as { exportData?: string }).exportData;
		expect(exportData).toBeString();
		const parsed = JSON.parse(exportData ?? '[]') as Array<{ message: string; level: string }>;
		expect(parsed.map((entry) => entry.message)).toEqual(['kept sync event']);
		expect(parsed[0]?.level).toBe(LogLevel.INFO);
	});

	it('load paginates with cursor and reports hasMore for load-more links', async () => {
		for (let i = 1; i <= 4; i++) {
			await seedLog({
				level: LogLevel.INFO,
				message: `entry ${i}`,
				timestamp: 1000 + i
			});
		}

		const firstPage = await invokeLoad('http://localhost/admin/logs?limit=2');
		expect(logMessages(firstPage)).toEqual(['entry 4', 'entry 3']);
		expect(firstPage.hasMore).toBe(true);

		const cursor = firstPage.logs.at(-1)?.id;
		expect(cursor).toBeNumber();

		const secondPage = await invokeLoad(`http://localhost/admin/logs?limit=2&cursor=${cursor}`);
		expect(logMessages(secondPage)).toEqual(['entry 2', 'entry 1']);
		expect(secondPage.hasMore).toBe(false);
		expect(secondPage.filters.cursor).toBe(cursor);
	});

	it('load filters by manual datetime timestamp fields', async () => {
		await seedLog({
			level: LogLevel.INFO,
			message: 'before window',
			timestamp: 999
		});
		await seedLog({
			level: LogLevel.INFO,
			message: 'inside window',
			timestamp: 1500
		});
		await seedLog({
			level: LogLevel.INFO,
			message: 'after window',
			timestamp: 2001
		});

		const data = await invokeLoad('http://localhost/admin/logs?from=1000&to=2000');

		expect(logMessages(data)).toEqual(['inside window']);
		expect(data.filters.fromTimestamp).toBe(1000);
		expect(data.filters.toTimestamp).toBe(2000);
	});
});
