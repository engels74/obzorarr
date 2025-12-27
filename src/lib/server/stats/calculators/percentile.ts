/**
 * Percentile Calculator
 *
 * Property 13: Percentile Calculation
 * For any user U among N users, the percentile rank SHALL equal
 * (number of users with less watch time than U) / N * 100.
 */

import { and, gte, lte, sql } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { playHistory } from '$lib/server/db/schema';
import type * as schema from '$lib/server/db/schema';
import type { YearFilter } from '../utils';

/**
 * Calculate user's percentile rank among all server users
 *
 * @param userWatchTimeMinutes - The user's total watch time in minutes
 * @param allUserWatchTimes - Array of all users' watch times (including this user)
 * @returns Percentile rank (0-100)
 *
 * @example
 * ```ts
 * // User watched 100 minutes, 3 others watched [50, 75, 150]
 * const percentile = calculatePercentileRank(100, [50, 75, 100, 150]);
 * // percentile = 50 (2 users have less watch time out of 4)
 * ```
 */
export function calculatePercentileRank(
	userWatchTimeMinutes: number,
	allUserWatchTimes: number[]
): number {
	if (allUserWatchTimes.length === 0) {
		return 0;
	}

	// Count users with less watch time than this user
	let usersWithLess = 0;
	for (const watchTime of allUserWatchTimes) {
		if (watchTime < userWatchTimeMinutes) {
			usersWithLess += 1;
		}
	}

	// Calculate percentile: (users with less) / total * 100
	const percentile = (usersWithLess / allUserWatchTimes.length) * 100;

	return percentile;
}

/**
 * Get all users' total watch times for a year from the database
 *
 * Aggregates play history by accountId and sums durations.
 *
 * @param db - Drizzle database instance
 * @param yearFilter - Year filter with timestamps
 * @returns Map of accountId to total watch time in minutes
 *
 * @example
 * ```ts
 * const yearFilter = createYearFilter(2024);
 * const watchTimes = await getAllUsersWatchTime(db, yearFilter);
 * // Map { 1 => 5000, 2 => 3000, 3 => 7500 }
 * ```
 */
export async function getAllUsersWatchTime(
	db: BunSQLiteDatabase<typeof schema>,
	yearFilter: YearFilter
): Promise<Map<number, number>> {
	// Aggregate duration by accountId for records in the year range
	const results = await db
		.select({
			accountId: playHistory.accountId,
			totalSeconds: sql<number>`COALESCE(SUM(${playHistory.duration}), 0)`.as('total_seconds')
		})
		.from(playHistory)
		.where(
			and(
				gte(playHistory.viewedAt, yearFilter.startTimestamp),
				lte(playHistory.viewedAt, yearFilter.endTimestamp)
			)
		)
		.groupBy(playHistory.accountId);

	// Convert to Map with minutes
	const watchTimeMap = new Map<number, number>();
	for (const row of results) {
		const totalMinutes = row.totalSeconds / 60;
		watchTimeMap.set(row.accountId, totalMinutes);
	}

	return watchTimeMap;
}
