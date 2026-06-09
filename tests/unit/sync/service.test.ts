import { afterAll, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { desc, eq } from 'drizzle-orm';
import * as fc from 'fast-check';
import { db } from '$lib/server/db/client';
import { metadataCache, playHistory, syncStatus } from '$lib/server/db/schema';
import { logger } from '$lib/server/logging';
import type { FetchHistoryOptions, ValidPlexHistoryMetadata } from '$lib/server/plex/types';
import type { SyncProgress } from '$lib/server/sync/types';
import { resetSharedTestDb } from '../../helpers/db';
import { createPlexHistoryItem } from '../../helpers/sync';

// Captured logger calls for asserting WARN vs INFO in enrichment tests.
const loggerCalls: { level: string; message: string }[] = [];

// Spy on the real logger singleton instead of mock.module — mock.module is
// process-wide and permanent, which poisons other test files that load later.
const loggerSpies = [
	spyOn(logger, 'info').mockImplementation((message: string) => {
		loggerCalls.push({ level: 'info', message });
	}),
	spyOn(logger, 'warn').mockImplementation((message: string) => {
		loggerCalls.push({ level: 'warn', message });
	}),
	spyOn(logger, 'error').mockImplementation((message: string) => {
		loggerCalls.push({ level: 'error', message });
	}),
	spyOn(logger, 'debug').mockImplementation(async (message: string) => {
		loggerCalls.push({ level: 'debug', message });
	})
];

// Restore the real logger so subsequently-loaded test files are not affected.
afterAll(() => {
	for (const spy of loggerSpies) {
		spy.mockRestore();
	}
});

type HistoryPage = {
	items: ValidPlexHistoryMetadata[];
	skippedCount: number;
};

type MetadataResult = {
	duration?: number;
	genres?: string[];
	releaseYear?: number;
} | null;

let historyPages: HistoryPage[] = [];
let historyError: Error | null = null;
let historyOptions: FetchHistoryOptions[] = [];
let metadataByRatingKey = new Map<string, MetadataResult>();
let metadataBatchRequests: string[][] = [];
let plexAccountsError: Error | null = null;

mock.module('$lib/server/plex/client', () => ({
	async *fetchAllHistory(options: FetchHistoryOptions) {
		historyOptions.push(options);
		if (historyError) {
			throw historyError;
		}
		for (const page of historyPages) {
			yield page;
		}
	},
	fetchMetadataBatch: async (ratingKeys: string[]) => {
		metadataBatchRequests.push([...ratingKeys]);
		return new Map(
			ratingKeys.map((ratingKey) => [ratingKey, metadataByRatingKey.get(ratingKey) ?? null])
		);
	},
	fetchShowsMetadataBatch: async () => new Map(),
	fetchMediaMetadata: async () => null,
	fetchShowMetadata: async () => null,
	fetchAllHistoryArray: async () => [],
	plexRequest: async () => ({})
}));

mock.module('$lib/server/sync/plex-accounts.service', () => ({
	syncPlexAccounts: async () => {
		if (plexAccountsError) {
			throw plexAccountsError;
		}
	}
}));

const { enrichMetadata, getYearStartTimestamp, reconcileInterruptedSyncs, startSync } =
	await import('$lib/server/sync/service');

async function resetSyncHarness(): Promise<void> {
	await resetSharedTestDb();
	historyPages = [];
	historyError = null;
	historyOptions = [];
	metadataByRatingKey = new Map();
	metadataBatchRequests = [];
	plexAccountsError = null;
}

describe('startSync service behavior', () => {
	beforeEach(resetSyncHarness);

	it('persists cancelled status with completedAt when the signal aborts', async () => {
		const controller = new AbortController();
		controller.abort();

		const result = await startSync({ signal: controller.signal });

		expect(result.status).toBe('cancelled');

		const rows = await db.select().from(syncStatus).orderBy(desc(syncStatus.id)).limit(1);
		const row = rows[0];
		expect(row).toBeDefined();
		expect(row?.status).toBe('cancelled');
		expect(row?.completedAt).not.toBeNull();
		expect(row?.error).toBeNull();
		// Aborting before the first page must not invent a sync watermark.
		expect(row?.lastViewedAt).toBeNull();
	});

	it('persists completed sync, inserted history, progress, and enrichment state', async () => {
		const item = createPlexHistoryItem({
			historyKey: 'history-complete-1',
			ratingKey: 'rating-complete-1',
			title: 'Complete Movie',
			viewedAt: 1_704_067_200,
			duration: undefined,
			year: undefined
		});
		historyPages = [{ items: [item], skippedCount: 0 }];
		metadataByRatingKey.set('rating-complete-1', {
			duration: 3_600,
			genres: ['Drama'],
			releaseYear: 2024
		});
		const progressEvents: SyncProgress[] = [];

		const result = await startSync({
			onProgress: (progress) => progressEvents.push(progress)
		});

		expect(result.status).toBe('completed');
		expect(result.recordsProcessed).toBe(1);
		expect(result.recordsInserted).toBe(1);
		expect(result.recordsSkipped).toBe(0);
		expect(result.lastViewedAt).toBe(1_704_067_200);

		const rows = await db.select().from(playHistory);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			historyKey: 'history-complete-1',
			title: 'Complete Movie',
			duration: 3_600,
			genres: JSON.stringify(['Drama']),
			releaseYear: 2024
		});

		const cacheRows = await db.select().from(metadataCache);
		expect(cacheRows).toHaveLength(1);
		expect(metadataBatchRequests).toEqual([['rating-complete-1']]);
		expect(progressEvents.some((event) => event.phase === 'enriching')).toBe(true);
		expect(progressEvents.at(-1)).toMatchObject({ isComplete: true, recordsInserted: 1 });
	});

	it('counts duplicate history keys as skipped without inserting another row', async () => {
		await db.insert(playHistory).values({
			historyKey: 'duplicate-history',
			ratingKey: 'existing-rating',
			title: 'Existing',
			type: 'movie',
			viewedAt: 1_704_067_000,
			accountId: 1,
			librarySectionId: 1
		});
		historyPages = [
			{
				items: [
					createPlexHistoryItem({
						historyKey: 'duplicate-history',
						ratingKey: 'new-rating',
						title: 'Duplicate',
						viewedAt: 1_704_067_001
					})
				],
				skippedCount: 0
			}
		];

		const result = await startSync();

		expect(result.status).toBe('completed');
		expect(result.recordsProcessed).toBe(1);
		expect(result.recordsInserted).toBe(0);
		expect(result.recordsSkipped).toBe(1);
		expect(await db.select().from(playHistory)).toHaveLength(1);
	});

	it('records failed fetches as failed sync rows with a generic result error', async () => {
		historyError = new Error('Plex history fetch failed');

		const result = await startSync();

		expect(result.status).toBe('failed');
		expect(result.error).toBe('Plex history fetch failed');

		const rows = await db.select().from(syncStatus).where(eq(syncStatus.status, 'failed'));
		expect(rows).toHaveLength(1);
		expect(rows[0]?.completedAt).not.toBeNull();
		expect(rows[0]?.error).toBe('Plex history fetch failed');
	});

	it('uses last successful sync timestamps for incremental sync and year starts for backfill', async () => {
		await db.insert(syncStatus).values({
			startedAt: new Date(1_704_067_000_000),
			completedAt: new Date(1_704_067_100_000),
			status: 'completed',
			recordsProcessed: 2,
			lastViewedAt: 1_704_067_123
		});

		await startSync();

		expect(historyOptions[0]).toMatchObject({
			pageSize: 100,
			minViewedAt: 1_704_067_123
		});

		await resetSharedTestDb();
		historyOptions = [];

		await startSync({ backfillYear: 2023 });

		expect(historyOptions[0]).toMatchObject({
			pageSize: 100,
			minViewedAt: getYearStartTimestamp(2023)
		});
	});

	it('completes when Plex account sync fails so history sync still runs', async () => {
		plexAccountsError = new Error('accounts endpoint unavailable');
		historyPages = [
			{
				items: [
					createPlexHistoryItem({
						historyKey: 'account-warning-history',
						ratingKey: 'account-warning-rating'
					})
				],
				skippedCount: 0
			}
		];

		const result = await startSync();

		expect(result.status).toBe('completed');
		expect(result.recordsInserted).toBe(1);
		expect(await db.select().from(playHistory)).toHaveLength(1);
	});
});

async function countSyncRows(): Promise<number> {
	const rows = await db.select({ id: syncStatus.id }).from(syncStatus);
	return rows.length;
}

async function countRunningRows(): Promise<number> {
	const rows = await db
		.select({ id: syncStatus.id })
		.from(syncStatus)
		.where(eq(syncStatus.status, 'running'));
	return rows.length;
}

function isAlreadyRunningError(reason: unknown): boolean {
	return reason instanceof Error && /already in progress/i.test(reason.message);
}

describe('sync single-flight via atomic DB claim (ISSUE-001)', () => {
	beforeEach(resetSyncHarness);

	it('lets exactly one of N concurrent startSync calls claim the running slot', async () => {
		const N = 6;
		const results = await Promise.allSettled(Array.from({ length: N }, () => startSync()));

		const fulfilled = results.filter((result) => result.status === 'fulfilled');
		const rejected = results.filter(
			(result): result is PromiseRejectedResult => result.status === 'rejected'
		);

		expect(fulfilled).toHaveLength(1);
		expect(rejected).toHaveLength(N - 1);
		expect(rejected.every((result) => isAlreadyRunningError(result.reason))).toBe(true);
		expect(await countSyncRows()).toBe(1);
		expect(await countRunningRows()).toBe(0);
	});

	it('keeps single-flight when triggerImmediateSync races a manual startSync', async () => {
		const { triggerImmediateSync } = await import('$lib/server/sync/scheduler');

		const results = await Promise.allSettled([
			startSync(),
			triggerImmediateSync(),
			startSync(),
			triggerImmediateSync()
		]);

		expect(results.filter((result) => result.status === 'fulfilled').length).toBeGreaterThanOrEqual(
			1
		);
		expect(await countSyncRows()).toBe(1);
		expect(await countRunningRows()).toBe(0);
	});
});

describe('reconcileInterruptedSyncs startup sweep (ISSUE-001)', () => {
	beforeEach(resetSyncHarness);

	it('marks a stale running row as failed and unblocks a fresh sync', async () => {
		await db
			.insert(syncStatus)
			.values({ startedAt: new Date(Date.now() - 60_000), status: 'running', recordsProcessed: 0 });

		expect(await reconcileInterruptedSyncs()).toBe(1);

		const swept = await db.select().from(syncStatus).where(eq(syncStatus.status, 'failed'));
		expect(swept).toHaveLength(1);
		expect(swept[0]?.error).toBe('Interrupted by restart');
		expect(swept[0]?.completedAt).not.toBeNull();
		expect(await countRunningRows()).toBe(0);
		expect((await startSync()).status).toBe('completed');
	});

	it('returns 0 when there is no orphaned row and never sweeps post-boot rows', async () => {
		expect(await reconcileInterruptedSyncs()).toBe(0);
		expect(await countSyncRows()).toBe(0);

		await db
			.insert(syncStatus)
			.values({ startedAt: new Date(), status: 'running', recordsProcessed: 0 });

		expect(await countRunningRows()).toBe(1);
	});
});

describe('sync single-flight property (ISSUE-001)', () => {
	it('for any K concurrent startSync, exactly one running row is ever claimed', async () => {
		await fc.assert(
			fc.asyncProperty(fc.integer({ min: 2, max: 8 }), async (k) => {
				await resetSyncHarness();

				const results = await Promise.allSettled(Array.from({ length: k }, () => startSync()));

				expect(await countSyncRows()).toBe(1);
				expect(await countRunningRows()).toBe(0);
				expect(
					results.filter(
						(result) =>
							result.status === 'fulfilled' ||
							!isAlreadyRunningError((result as PromiseRejectedResult).reason)
					)
				).toHaveLength(1);
			}),
			{ numRuns: 25 }
		);
	});
});

describe('enrichMetadata counter accuracy (DF-14)', () => {
	beforeEach(async () => {
		await resetSharedTestDb();
		loggerCalls.length = 0;
	});

	async function insertHistoryRow(opts: {
		historyKey: string;
		ratingKey: string;
		viewedAt?: number;
		duration?: number | null;
		genres?: string | null;
		releaseYear?: number | null;
	}) {
		await db.insert(playHistory).values({
			historyKey: opts.historyKey,
			ratingKey: opts.ratingKey,
			title: 'Test',
			type: 'movie',
			viewedAt: opts.viewedAt ?? 1_704_067_200,
			accountId: 1,
			librarySectionId: 1,
			duration: opts.duration ?? null,
			genres: opts.genres ?? null,
			releaseYear: opts.releaseYear ?? null
		});
	}

	async function insertCacheRow(opts: {
		ratingKey: string;
		duration?: number | null;
		genres?: string | null;
		releaseYear?: number | null;
		fetchFailed?: boolean;
	}) {
		await db.insert(metadataCache).values({
			ratingKey: opts.ratingKey,
			duration: opts.duration ?? null,
			genres: opts.genres ?? null,
			releaseYear: opts.releaseYear ?? null,
			fetchedAt: Math.floor(Date.now() / 1000),
			fetchFailed: opts.fetchFailed ?? false
		});
	}

	it('counts cache-hit no-op records as skipped, not failed', async () => {
		// Record whose duration is null but the cache entry also has null duration —
		// metadata was cached but cannot fill the gap. Should be skipped, not failed.
		await insertHistoryRow({ historyKey: 'h-noop', ratingKey: 'rk-noop', duration: null });
		await insertCacheRow({ ratingKey: 'rk-noop', duration: null });

		const result = await enrichMetadata();

		expect(result.enriched).toBe(0);
		expect(result.skipped).toBe(1);
		expect(result.failed).toBe(0);
	});

	it('counts only genuine API failures as failed', async () => {
		// fetchFailed=true in cache means the API call previously errored.
		await insertHistoryRow({ historyKey: 'h-fail', ratingKey: 'rk-fail', duration: null });
		await insertCacheRow({ ratingKey: 'rk-fail', duration: null, fetchFailed: true });

		const result = await enrichMetadata();

		expect(result.failed).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.enriched).toBe(0);
	});

	it('correctly splits enriched / skipped / failed across a mixed batch', async () => {
		// 3 enriched: cache hit with real data that fills the null field
		await insertHistoryRow({ historyKey: 'h-enrich-1', ratingKey: 'rk-enrich', duration: null });
		await insertHistoryRow({ historyKey: 'h-enrich-2', ratingKey: 'rk-enrich', duration: null });
		await insertHistoryRow({ historyKey: 'h-enrich-3', ratingKey: 'rk-enrich', duration: null });
		await insertCacheRow({ ratingKey: 'rk-enrich', duration: 5400 });

		// 2 skipped: cache hit but nothing to fill
		await insertHistoryRow({ historyKey: 'h-skip-1', ratingKey: 'rk-skip', duration: null });
		await insertHistoryRow({ historyKey: 'h-skip-2', ratingKey: 'rk-skip', duration: null });
		await insertCacheRow({ ratingKey: 'rk-skip', duration: null });

		// 1 failed: fetchFailed flag set
		await insertHistoryRow({ historyKey: 'h-fail', ratingKey: 'rk-fail', duration: null });
		await insertCacheRow({ ratingKey: 'rk-fail', fetchFailed: true });

		const result = await enrichMetadata();

		expect(result.enriched).toBe(3);
		expect(result.skipped).toBe(2);
		expect(result.failed).toBe(1);
	});

	it('a cache-dominated run does not report a near-100% failure rate', async () => {
		// Simulate the dogfood scenario: many records, all served from cache with
		// real data. The old bug counted every no-op as failed.
		const ratingKey = 'rk-cached-movie';
		for (let i = 0; i < 20; i++) {
			await insertHistoryRow({
				historyKey: `h-bulk-${i}`,
				ratingKey,
				duration: null,
				genres: null
			});
		}
		await insertCacheRow({ ratingKey, duration: 7200, genres: JSON.stringify(['Drama']) });

		const result = await enrichMetadata();

		expect(result.enriched).toBe(20);
		expect(result.failed).toBe(0);
		// failed must never be a majority of total records when cache has real data
		const total = result.enriched + result.skipped + result.failed;
		expect(result.failed / total).toBe(0);
	});

	it('logs WARN when there are genuine failures, INFO when there are none', async () => {
		// No-failure run: one record enriched from cache
		await insertHistoryRow({ historyKey: 'h-ok', ratingKey: 'rk-ok', duration: null });
		await insertCacheRow({ ratingKey: 'rk-ok', duration: 3600 });

		await enrichMetadata();

		const completionLog = loggerCalls.find((c) => c.message.includes('Enrichment complete'));
		expect(completionLog).toBeDefined();
		expect(completionLog?.level).toBe('info');

		// Reset and run with a genuine failure
		await resetSharedTestDb();
		loggerCalls.length = 0;

		await insertHistoryRow({ historyKey: 'h-fail2', ratingKey: 'rk-fail2', duration: null });
		await insertCacheRow({ ratingKey: 'rk-fail2', fetchFailed: true });

		await enrichMetadata();

		const warnLog = loggerCalls.find((c) => c.message.includes('Enrichment complete'));
		expect(warnLog).toBeDefined();
		expect(warnLog?.level).toBe('warn');
	});
});
