import { and, gte, lte, sql } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { playHistory } from '$lib/server/db/schema';
import type * as schema from '$lib/server/db/schema';
import type { YearFilter } from '../utils';

export function calculatePercentileRank(
	userWatchTimeMinutes: number,
	allUserWatchTimes: number[]
): number {
	if (allUserWatchTimes.length === 0) {
		return 0;
	}

	let usersWithLess = 0;
	for (const watchTime of allUserWatchTimes) {
		if (watchTime < userWatchTimeMinutes) {
			usersWithLess += 1;
		}
	}

	return (usersWithLess / allUserWatchTimes.length) * 100;
}

export async function getAllUsersWatchTime(
	db: BunSQLiteDatabase<typeof schema>,
	yearFilter: YearFilter
): Promise<Map<number, number>> {
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

	const watchTimeMap = new Map<number, number>();
	for (const row of results) {
		const totalMinutes = row.totalSeconds / 60;
		watchTimeMap.set(row.accountId, totalMinutes);
	}

	return watchTimeMap;
}
