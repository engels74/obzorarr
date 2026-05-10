import { beforeEach, describe, expect, it } from 'bun:test';
import { getAllUsersWithStats } from '$lib/server/admin/users.service';
import { db } from '$lib/server/db/client';
import { playHistory, shareSettings, users } from '$lib/server/db/schema';
import { createTimestamp } from '../../helpers/factories';

describe('admin users service', () => {
	beforeEach(async () => {
		await db.delete(shareSettings);
		await db.delete(playHistory);
		await db.delete(users);
	});

	it('returns play counts and watch-history state for the selected year', async () => {
		await db.insert(users).values([
			{
				id: 1,
				plexId: 1001,
				accountId: 2001,
				username: 'viewer'
			},
			{
				id: 2,
				plexId: 1002,
				accountId: 2002,
				username: 'no-history'
			}
		]);

		await db.insert(playHistory).values([
			{
				historyKey: 'history-1',
				ratingKey: 'rating-1',
				title: 'Movie 1',
				type: 'movie',
				viewedAt: createTimestamp(2025, 1, 15),
				accountId: 2001,
				librarySectionId: 1,
				duration: 1800
			},
			{
				historyKey: 'history-2',
				ratingKey: 'rating-2',
				title: 'Movie 2',
				type: 'movie',
				viewedAt: createTimestamp(2025, 2, 15),
				accountId: 2001,
				librarySectionId: 1,
				duration: 3600
			},
			{
				historyKey: 'history-outside-year',
				ratingKey: 'rating-outside-year',
				title: 'Old Movie',
				type: 'movie',
				viewedAt: createTimestamp(2024, 12, 31),
				accountId: 2001,
				librarySectionId: 1,
				duration: 7200
			}
		]);

		const results = (await getAllUsersWithStats(2025)).sort((a, b) => a.id - b.id);

		expect(results[0]).toMatchObject({
			id: 1,
			totalWatchTimeMinutes: 90,
			totalPlays: 2,
			hasWatchHistory: true
		});
		expect(results[1]).toMatchObject({
			id: 2,
			totalWatchTimeMinutes: 0,
			totalPlays: 0,
			hasWatchHistory: false
		});
	});
});
