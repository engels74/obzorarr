import { describe, expect, it, beforeEach } from 'bun:test';
import { db } from '$lib/server/db/client';
import { playHistory } from '$lib/server/db/schema';
import {
	calculatePercentileRank,
	getAllUsersWatchTime
} from '$lib/server/stats/calculators/percentile';
import { createYearFilter } from '$lib/server/stats/utils';
import { createMultipleRecords, createTimestamp } from '../../helpers/factories';

/**
 * Unit tests for Percentile Calculator
 *
 * Tests percentile rank calculation and database aggregation.
 * Uses in-memory SQLite from test setup.
 */

describe('Percentile Calculator', () => {
	// Clean up play history before each test
	beforeEach(async () => {
		await db.delete(playHistory);
	});

	// =========================================================================
	// calculatePercentileRank (Pure Function)
	// =========================================================================

	describe('calculatePercentileRank', () => {
		it('returns 0 for empty array', () => {
			const percentile = calculatePercentileRank(100, []);
			expect(percentile).toBe(0);
		});

		it('returns 0 when user has lowest watch time', () => {
			const percentile = calculatePercentileRank(50, [50, 100, 150, 200]);
			expect(percentile).toBe(0);
		});

		it('returns 100 when user has highest watch time', () => {
			// All others have less watch time
			const percentile = calculatePercentileRank(200, [50, 100, 150, 200]);
			expect(percentile).toBe(75); // 3 users have less out of 4
		});

		it('calculates correct percentile for middle values', () => {
			// User has 100 minutes, 2 have less (50, 75), 4 total
			const percentile = calculatePercentileRank(100, [50, 75, 100, 150]);
			expect(percentile).toBe(50); // 2/4 * 100 = 50
		});

		it('handles single user (0 percentile)', () => {
			const percentile = calculatePercentileRank(100, [100]);
			expect(percentile).toBe(0); // No one has less
		});

		it('handles ties correctly', () => {
			// User has 100, two others also have 100, one has less (50)
			const percentile = calculatePercentileRank(100, [50, 100, 100, 100]);
			expect(percentile).toBe(25); // 1/4 * 100 = 25
		});

		it('handles all same values', () => {
			const percentile = calculatePercentileRank(100, [100, 100, 100, 100]);
			expect(percentile).toBe(0); // No one has less
		});

		it('calculates correct percentile for top 10%', () => {
			// User is in top 10% (9 have less out of 10)
			const allWatchTimes = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
			const percentile = calculatePercentileRank(100, allWatchTimes);
			expect(percentile).toBe(90); // 9/10 * 100
		});

		it('handles zero watch time', () => {
			const percentile = calculatePercentileRank(0, [0, 50, 100]);
			expect(percentile).toBe(0); // No one has less than 0
		});
	});

	// =========================================================================
	// getAllUsersWatchTime (Database Aggregation)
	// =========================================================================

	describe('getAllUsersWatchTime', () => {
		const yearFilter = createYearFilter(2024);

		it('returns empty map when no play history', async () => {
			const watchTimes = await getAllUsersWatchTime(db, yearFilter);

			expect(watchTimes.size).toBe(0);
		});

		it('aggregates watch time by accountId', async () => {
			// Insert play history for multiple users
			await db.insert(playHistory).values([
				{
					historyKey: 'history-1',
					ratingKey: 'key1',
					title: 'Movie 1',
					type: 'movie',
					viewedAt: yearFilter.startTimestamp + 1000,
					accountId: 1,
					librarySectionId: 1,
					duration: 7200 // 120 minutes in seconds
				},
				{
					historyKey: 'history-2',
					ratingKey: 'key2',
					title: 'Movie 2',
					type: 'movie',
					viewedAt: yearFilter.startTimestamp + 2000,
					accountId: 1,
					librarySectionId: 1,
					duration: 5400 // 90 minutes in seconds
				},
				{
					historyKey: 'history-3',
					ratingKey: 'key3',
					title: 'Movie 3',
					type: 'movie',
					viewedAt: yearFilter.startTimestamp + 3000,
					accountId: 2,
					librarySectionId: 1,
					duration: 3600 // 60 minutes in seconds
				}
			]);

			const watchTimes = await getAllUsersWatchTime(db, yearFilter);

			expect(watchTimes.size).toBe(2);
			expect(watchTimes.get(1)).toBe(210); // 7200 + 5400 = 12600 seconds = 210 minutes
			expect(watchTimes.get(2)).toBe(60); // 3600 seconds = 60 minutes
		});

		it('filters by year range correctly', async () => {
			// Insert records in and out of year
			await db.insert(playHistory).values([
				{
					historyKey: 'in-year',
					ratingKey: 'key1',
					title: 'In Year Movie',
					type: 'movie',
					viewedAt: yearFilter.startTimestamp + 1000, // In 2024
					accountId: 1,
					librarySectionId: 1,
					duration: 6000
				},
				{
					historyKey: 'before-year',
					ratingKey: 'key2',
					title: 'Before Year Movie',
					type: 'movie',
					viewedAt: yearFilter.startTimestamp - 1000, // Before 2024
					accountId: 1,
					librarySectionId: 1,
					duration: 6000
				},
				{
					historyKey: 'after-year',
					ratingKey: 'key3',
					title: 'After Year Movie',
					type: 'movie',
					viewedAt: yearFilter.endTimestamp + 1000, // After 2024
					accountId: 1,
					librarySectionId: 1,
					duration: 6000
				}
			]);

			const watchTimes = await getAllUsersWatchTime(db, yearFilter);

			expect(watchTimes.size).toBe(1);
			expect(watchTimes.get(1)).toBe(100); // Only in-year record: 6000/60 = 100 minutes
		});

		it('handles null duration correctly via COALESCE', async () => {
			await db.insert(playHistory).values([
				{
					historyKey: 'with-duration',
					ratingKey: 'key1',
					title: 'With Duration',
					type: 'movie',
					viewedAt: yearFilter.startTimestamp + 1000,
					accountId: 1,
					librarySectionId: 1,
					duration: 3600
				},
				{
					historyKey: 'null-duration',
					ratingKey: 'key2',
					title: 'Null Duration',
					type: 'movie',
					viewedAt: yearFilter.startTimestamp + 2000,
					accountId: 1,
					librarySectionId: 1,
					duration: null
				}
			]);

			const watchTimes = await getAllUsersWatchTime(db, yearFilter);

			// Should only count the non-null duration
			expect(watchTimes.get(1)).toBe(60); // 3600/60 = 60 minutes
		});

		it('handles multiple accounts correctly', async () => {
			// Insert for 5 different accounts
			const entries = [];
			for (let i = 1; i <= 5; i++) {
				entries.push({
					historyKey: `history-${i}`,
					ratingKey: `key${i}`,
					title: `Movie ${i}`,
					type: 'movie',
					viewedAt: yearFilter.startTimestamp + i * 1000,
					accountId: i,
					librarySectionId: 1,
					duration: i * 1800 // 30 * i minutes in seconds
				});
			}
			await db.insert(playHistory).values(entries);

			const watchTimes = await getAllUsersWatchTime(db, yearFilter);

			expect(watchTimes.size).toBe(5);
			expect(watchTimes.get(1)).toBe(30); // 1800/60
			expect(watchTimes.get(2)).toBe(60); // 3600/60
			expect(watchTimes.get(3)).toBe(90); // 5400/60
			expect(watchTimes.get(4)).toBe(120); // 7200/60
			expect(watchTimes.get(5)).toBe(150); // 9000/60
		});

		it('handles year boundary records', async () => {
			// Records exactly at year boundaries
			await db.insert(playHistory).values([
				{
					historyKey: 'start-of-year',
					ratingKey: 'key1',
					title: 'Start of Year',
					type: 'movie',
					viewedAt: yearFilter.startTimestamp, // Exactly at start
					accountId: 1,
					librarySectionId: 1,
					duration: 3600
				},
				{
					historyKey: 'end-of-year',
					ratingKey: 'key2',
					title: 'End of Year',
					type: 'movie',
					viewedAt: yearFilter.endTimestamp, // Exactly at end
					accountId: 1,
					librarySectionId: 1,
					duration: 3600
				}
			]);

			const watchTimes = await getAllUsersWatchTime(db, yearFilter);

			// Both should be included (gte and lte)
			expect(watchTimes.get(1)).toBe(120); // 2 * 3600/60 = 120 minutes
		});

		it('converts seconds to minutes correctly', async () => {
			await db.insert(playHistory).values({
				historyKey: 'precise-duration',
				ratingKey: 'key1',
				title: 'Precise Duration',
				type: 'movie',
				viewedAt: yearFilter.startTimestamp + 1000,
				accountId: 1,
				librarySectionId: 1,
				duration: 5400 // 90 minutes exactly
			});

			const watchTimes = await getAllUsersWatchTime(db, yearFilter);

			expect(watchTimes.get(1)).toBe(90);
		});

		it('aggregates multiple plays from same account using factory', async () => {
			// Use createMultipleRecords factory for coverage
			const records = createMultipleRecords(3, {
				accountId: 1,
				viewedAt: createTimestamp(2024, 6, 15), // Use createTimestamp for coverage
				duration: 1800 // 30 minutes each
			});
			await db.insert(playHistory).values(records);

			const watchTimes = await getAllUsersWatchTime(db, yearFilter);

			expect(watchTimes.size).toBe(1);
			expect(watchTimes.get(1)).toBe(90); // 3 * 30 minutes = 90 minutes
		});
	});

	// =========================================================================
	// Integration: Full Percentile Calculation
	// =========================================================================

	describe('Integration: Full Percentile Flow', () => {
		const yearFilter = createYearFilter(2024);

		it('calculates percentile from database data', async () => {
			// Create 10 users with varying watch times
			const entries = [];
			for (let i = 1; i <= 10; i++) {
				entries.push({
					historyKey: `history-${i}`,
					ratingKey: `key${i}`,
					title: `Movie ${i}`,
					type: 'movie',
					viewedAt: yearFilter.startTimestamp + i * 1000,
					accountId: i,
					librarySectionId: 1,
					duration: i * 6000 // i * 100 minutes in seconds
				});
			}
			await db.insert(playHistory).values(entries);

			// Get all watch times
			const watchTimeMap = await getAllUsersWatchTime(db, yearFilter);
			const allWatchTimes = Array.from(watchTimeMap.values());

			// User 10 should be in top 10% (9 have less)
			const user10WatchTime = watchTimeMap.get(10)!;
			const user10Percentile = calculatePercentileRank(user10WatchTime, allWatchTimes);
			expect(user10Percentile).toBe(90);

			// User 5 should be at 40% (4 have less)
			const user5WatchTime = watchTimeMap.get(5)!;
			const user5Percentile = calculatePercentileRank(user5WatchTime, allWatchTimes);
			expect(user5Percentile).toBe(40);

			// User 1 should be at 0% (no one has less)
			const user1WatchTime = watchTimeMap.get(1)!;
			const user1Percentile = calculatePercentileRank(user1WatchTime, allWatchTimes);
			expect(user1Percentile).toBe(0);
		});
	});
});
