import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { cachedStats, metadataCache, playHistory } from '$lib/server/db/schema';
import { calculateServerStats } from '$lib/server/stats/engine';
import { resetSharedTestDb } from '../../helpers/db';
import { createPlayHistoryRecord, createTimestamp } from '../../helpers/factories';
import { createPlexHistoryItem } from '../../helpers/sync';

// enrichMetadata fetches show metadata through the Plex client; stub it so the
// enrichment path runs offline against seeded metadataCache rows only.
let metadataByRatingKey = new Map<string, { duration?: number } | null>();
let historyPages: { items: ReturnType<typeof createPlexHistoryItem>[]; skippedCount: number }[] =
	[];

mock.module('$lib/server/plex/client', () => ({
	async *fetchAllHistory() {
		for (const page of historyPages) {
			yield page;
		}
	},
	fetchMetadataBatch: async (ratingKeys: string[]) =>
		new Map(ratingKeys.map((rk) => [rk, metadataByRatingKey.get(rk) ?? null])),
	fetchShowsMetadataBatch: async () => new Map(),
	fetchMediaMetadata: async () => null,
	fetchShowMetadata: async () => null,
	fetchAllHistoryArray: async () => [],
	plexRequest: async () => ({})
}));

mock.module('$lib/server/sync/plex-accounts.service', () => ({
	syncPlexAccounts: async () => {}
}));

const { enrichMetadata, startSync } = await import('$lib/server/sync/service');

async function insertRecord(
	overrides: Parameters<typeof createPlayHistoryRecord>[0]
): Promise<void> {
	const record = createPlayHistoryRecord(overrides);
	await db.insert(playHistory).values({
		historyKey: record.historyKey,
		ratingKey: record.ratingKey,
		title: record.title,
		type: record.type,
		viewedAt: record.viewedAt,
		accountId: record.accountId,
		librarySectionId: record.librarySectionId,
		thumb: record.thumb,
		duration: record.duration,
		grandparentTitle: record.grandparentTitle,
		grandparentRatingKey: record.grandparentRatingKey,
		grandparentThumb: record.grandparentThumb,
		parentTitle: record.parentTitle,
		genres: record.genres,
		releaseYear: record.releaseYear
	});
}

describe('ISSUE-002: stats hours-watched determinism', () => {
	beforeEach(async () => {
		await resetSharedTestDb();
		metadataByRatingKey = new Map();
		historyPages = [];
	});

	it('produces identical aggregate hours-watched across repeated cold recomputes for identical input', async () => {
		const year = 2025;
		const durations = [3600, 1234, 7200, 59, 600];
		for (let i = 0; i < durations.length; i++) {
			await insertRecord({
				historyKey: `det-${i}`,
				ratingKey: `det-key-${i}`,
				accountId: 1 + (i % 3),
				viewedAt: createTimestamp(year, 1 + i, 5 + i),
				duration: durations[i]
			});
		}

		const runs: number[] = [];
		for (let run = 0; run < 5; run++) {
			// Cold recompute: bypass and overwrite any cache each pass.
			const stats = await calculateServerStats(year, { forceRecalculate: true });
			runs.push(stats.totalWatchTimeMinutes);
		}

		const expectedMinutes = durations.reduce((sum, d) => sum + d, 0) / 60;
		expect(new Set(runs).size).toBe(1);
		expect(runs[0]).toBe(expectedMinutes);
	});

	it('enrichMetadata reports the actual years it changed, including years outside the sync window (superset)', async () => {
		// Record from an OLD year with a missing duration that enrichment will fill.
		await insertRecord({
			historyKey: 'old-null',
			ratingKey: 'shared-rating',
			viewedAt: createTimestamp(2023, 6, 15),
			duration: null
		});
		// Record from a NEWER year sharing the same media item, also missing duration.
		await insertRecord({
			historyKey: 'new-null',
			ratingKey: 'shared-rating',
			viewedAt: createTimestamp(2026, 1, 2),
			duration: null
		});

		await db.insert(metadataCache).values({
			ratingKey: 'shared-rating',
			duration: 5400,
			genres: null,
			releaseYear: null,
			fetchedAt: Math.floor(Date.now() / 1000),
			fetchFailed: false
		});

		const result = await enrichMetadata();

		expect(result.enriched).toBe(2);
		expect(result.affectedYears.slice().sort((a, b) => a - b)).toEqual([2023, 2026]);
	});

	it('startSync invalidates the cache for an enriched older year so its stats are not stale', async () => {
		const oldYear = 2023;
		// Pre-existing record in an old year, duration already known.
		await insertRecord({
			historyKey: 'old-existing',
			ratingKey: 'old-existing-rating',
			viewedAt: createTimestamp(oldYear, 3, 10),
			duration: 1800
		});
		// Pre-existing record in the same old year with a NULL duration, awaiting enrichment.
		await insertRecord({
			historyKey: 'old-missing',
			ratingKey: 'enrich-rating',
			viewedAt: createTimestamp(oldYear, 4, 11),
			duration: null
		});

		// Seed a stale cache for the old year computed BEFORE enrichment fills the gap.
		const staleStats = await calculateServerStats(oldYear, { forceRecalculate: true });
		expect(staleStats.totalWatchTimeMinutes).toBe(1800 / 60);

		// A fresh incremental sync brings in a NEW-year record; its viewed-at window
		// would NOT cover oldYear, but enrichment fills the old NULL-duration record.
		metadataByRatingKey.set('enrich-rating', { duration: 3600 });
		historyPages = [
			{
				items: [
					createPlexHistoryItem({
						historyKey: 'new-incoming',
						ratingKey: 'new-incoming-rating',
						viewedAt: createTimestamp(2026, 2, 1),
						duration: 7_200_000
					})
				],
				skippedCount: 0
			}
		];

		const syncResult = await startSync();
		expect(syncResult.status).toBe('completed');

		// The old year's cache must have been invalidated by the enrichment step.
		const remainingOldCache = await db
			.select()
			.from(cachedStats)
			.where(eq(cachedStats.year, oldYear));
		expect(remainingOldCache).toHaveLength(0);

		// Recompute reflects the now-enriched old-year duration (1800 + 3600 seconds).
		const fresh = await calculateServerStats(oldYear, { forceRecalculate: true });
		expect(fresh.totalWatchTimeMinutes).toBe((1800 + 3600) / 60);
	});
});
