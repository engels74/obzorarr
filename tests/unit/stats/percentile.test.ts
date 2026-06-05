import { beforeEach, describe, expect, it } from 'bun:test';
import { db } from '$lib/server/db/client';
import { playHistory } from '$lib/server/db/schema';
import {
	calculatePercentileRank,
	getAllUsersWatchTime
} from '$lib/server/stats/calculators/percentile';
import { createYearFilter } from '$lib/server/stats/utils';
import { resetSharedTestDb } from '../../helpers/db';
import { createMultipleRecords, createTimestamp } from '../../helpers/factories';

type PlayHistoryInsert = typeof playHistory.$inferInsert;

const yearFilter = createYearFilter(2024);
const watchRow = (
	historyKey: string,
	overrides: Partial<PlayHistoryInsert> = {}
): PlayHistoryInsert => ({
	historyKey,
	ratingKey: `${historyKey}-rating`,
	title: historyKey,
	type: 'movie',
	viewedAt: yearFilter.startTimestamp + 1000,
	accountId: 1,
	librarySectionId: 1,
	duration: 3600,
	...overrides
});
const watchTimesObject = async () => Object.fromEntries(await getAllUsersWatchTime(db, yearFilter));

describe('Percentile Calculator', () => {
	beforeEach(resetSharedTestDb);

	describe('calculatePercentileRank', () => {
		it.each([
			['empty population', 100, [], 0],
			['lowest watch time', 50, [50, 100, 150, 200], 0],
			['highest watch time', 200, [50, 100, 150, 200], 75],
			['middle value', 100, [50, 75, 100, 150], 50],
			['single user', 100, [100], 0],
			['ties', 100, [50, 100, 100, 100], 25],
			['all values equal', 100, [100, 100, 100, 100], 0],
			['top decile', 100, [10, 20, 30, 40, 50, 60, 70, 80, 90, 100], 90],
			['zero watch time', 0, [0, 50, 100], 0]
		] as const)('returns %s', (_name, userWatchTime, allWatchTimes, expected) => {
			expect(calculatePercentileRank(userWatchTime, [...allWatchTimes])).toBe(expected);
		});
	});

	describe('getAllUsersWatchTime', () => {
		it.each([
			['empty history', [], {}],
			[
				'account aggregation',
				[
					watchRow('history-1', { accountId: 1, duration: 7200 }),
					watchRow('history-2', {
						accountId: 1,
						duration: 5400,
						viewedAt: yearFilter.startTimestamp + 2000
					}),
					watchRow('history-3', {
						accountId: 2,
						duration: 3600,
						viewedAt: yearFilter.startTimestamp + 3000
					})
				],
				{ 1: 210, 2: 60 }
			],
			[
				'year range filtering',
				[
					watchRow('in-year', { duration: 6000 }),
					watchRow('before-year', { duration: 6000, viewedAt: yearFilter.startTimestamp - 1000 }),
					watchRow('after-year', { duration: 6000, viewedAt: yearFilter.endTimestamp + 1000 })
				],
				{ 1: 100 }
			],
			[
				'null durations',
				[
					watchRow('with-duration', { duration: 3600 }),
					watchRow('null-duration', { duration: null, viewedAt: yearFilter.startTimestamp + 2000 })
				],
				{ 1: 60 }
			],
			[
				'inclusive year boundaries',
				[
					watchRow('start-of-year', { viewedAt: yearFilter.startTimestamp }),
					watchRow('end-of-year', { viewedAt: yearFilter.endTimestamp })
				],
				{ 1: 120 }
			],
			[
				'seconds-to-minutes conversion',
				[watchRow('precise-duration', { duration: 5400 })],
				{ 1: 90 }
			]
		] as const)('handles %s', async (_name, rows, expected) => {
			if (rows.length) await db.insert(playHistory).values([...rows]);

			expect(await watchTimesObject()).toEqual(expected);
		});

		it('handles multiple accounts', async () => {
			await db
				.insert(playHistory)
				.values(
					Array.from({ length: 5 }, (_, i) =>
						watchRow(`history-${i + 1}`, { accountId: i + 1, duration: (i + 1) * 1800 })
					)
				);

			expect(await watchTimesObject()).toEqual({ 1: 30, 2: 60, 3: 90, 4: 120, 5: 150 });
		});

		it('aggregates multiple plays from the same account using factories', async () => {
			await db.insert(playHistory).values(
				createMultipleRecords(3, {
					accountId: 1,
					viewedAt: createTimestamp(2024, 6, 15),
					duration: 1800
				})
			);

			expect(await watchTimesObject()).toEqual({ 1: 90 });
		});
	});

	describe('Integration: Full Percentile Flow', () => {
		it('calculates percentile from database data', async () => {
			await db
				.insert(playHistory)
				.values(
					Array.from({ length: 10 }, (_, i) =>
						watchRow(`history-${i + 1}`, { accountId: i + 1, duration: (i + 1) * 6000 })
					)
				);

			const allWatchTimesByUser = await getAllUsersWatchTime(db, yearFilter);
			const allWatchTimes = Array.from(allWatchTimesByUser.values());
			for (const [userId, expectedPercentile] of [
				[10, 90],
				[5, 40],
				[1, 0]
			] as const) {
				expect(calculatePercentileRank(allWatchTimesByUser.get(userId)!, allWatchTimes)).toBe(
					expectedPercentile
				);
			}
		});
	});
});
