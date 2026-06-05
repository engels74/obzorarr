import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { desc, eq } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { metadataCache, playHistory, syncStatus } from '$lib/server/db/schema';
import type { FetchHistoryOptions, ValidPlexHistoryMetadata } from '$lib/server/plex/types';
import type { SyncProgress } from '$lib/server/sync/types';
import { resetSharedTestDb } from '../../helpers/db';
import { createPlexHistoryItem } from '../../helpers/sync';

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

const { getYearStartTimestamp, startSync } = await import('$lib/server/sync/service');

describe('startSync service behavior', () => {
	beforeEach(async () => {
		await resetSharedTestDb();
		historyPages = [];
		historyError = null;
		historyOptions = [];
		metadataByRatingKey = new Map();
		metadataBatchRequests = [];
		plexAccountsError = null;
	});

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
		// lastViewedAt should be persisted even for cancelled syncs (null when aborted before any pages)
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
