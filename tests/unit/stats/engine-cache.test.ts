import { beforeEach, describe, expect, it } from 'bun:test';
import { db } from '$lib/server/db/client';
import { cachedStats, playHistory, plexAccounts, users } from '$lib/server/db/schema';
import { calculateUserStats } from '$lib/server/stats/engine';
import { createPlayHistoryRecord, createTimestamp } from '../../helpers/factories';

describe('stats engine cache keys', () => {
	beforeEach(async () => {
		await db.delete(cachedStats);
		await db.delete(playHistory);
		await db.delete(plexAccounts);
		await db.delete(users);
	});

	it('caches user stats by Plex account id instead of local user id', async () => {
		const localUserId = 17;
		const accountId = 200042;
		const year = 2024;

		await db.insert(users).values({
			id: localUserId,
			plexId: 900042,
			accountId,
			username: 'plex-user',
			isAdmin: false
		});

		const record = createPlayHistoryRecord({
			historyKey: 'history-cache-account-id',
			ratingKey: 'movie-cache-account-id',
			accountId,
			viewedAt: createTimestamp(year, 3, 15),
			duration: 3600
		});
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

		const stats = await calculateUserStats(accountId, year, { forceRecalculate: true });
		const cacheRows = await db.select().from(cachedStats);

		expect(stats.userId).toBe(accountId);
		expect(cacheRows).toHaveLength(1);
		expect(cacheRows[0]?.userId).toBe(accountId);
		expect(cacheRows[0]?.userId).not.toBe(localUserId);
	});
});
