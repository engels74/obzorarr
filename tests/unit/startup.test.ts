import { describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { syncStatus } from '$lib/server/db/schema';
import { createServerInitializer, initializeServer } from '$lib/server/startup';
import { resetSharedTestDb } from '../helpers/db';

describe('server startup initialization', () => {
	it('shares one initialization across concurrent callers', async () => {
		let calls = 0;
		let release!: () => void;
		const task = () => {
			calls += 1;
			return new Promise<void>((resolve) => {
				release = resolve;
			});
		};
		const initialize = createServerInitializer(task);

		const first = initialize();
		const second = initialize();

		expect(first).toBe(second);
		expect(calls).toBe(0);

		await Promise.resolve();
		expect(calls).toBe(1);
		release();
		await Promise.all([first, second]);
		expect(calls).toBe(1);
	});

	it('propagates and caches startup failures', async () => {
		const failure = new Error('startup failed');
		let calls = 0;
		const initialize = createServerInitializer(async () => {
			calls += 1;
			throw failure;
		});

		const first = initialize();
		const second = initialize();

		expect(first).toBe(second);
		await expect(first).rejects.toBe(failure);
		await expect(second).rejects.toBe(failure);
		expect(calls).toBe(1);
	});

	it('reconciles only rows that predate server startup', async () => {
		await resetSharedTestDb();
		await db.insert(syncStatus).values({
			startedAt: new Date(Date.now() - 60_000),
			status: 'running',
			recordsProcessed: 0
		});

		await initializeServer();

		const failedRows = await db.select().from(syncStatus).where(eq(syncStatus.status, 'failed'));
		expect(failedRows).toHaveLength(1);
		expect(failedRows[0]?.error).toBe('Interrupted by restart');

		await db.insert(syncStatus).values({
			startedAt: new Date(),
			status: 'running',
			recordsProcessed: 0
		});
		await initializeServer();

		const runningRows = await db.select().from(syncStatus).where(eq(syncStatus.status, 'running'));
		expect(runningRows).toHaveLength(1);
	});
});
