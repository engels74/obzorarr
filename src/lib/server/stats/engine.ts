import { and, asc, eq, gte, isNull, lte, sql } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { cachedStats, playHistory, users, plexAccounts } from '$lib/server/db/schema';
import type { UserStats, ServerStats, Stats } from './types';
import { UserStatsSchema, ServerStatsSchema } from './types';
import { serializeStats, parseStats, StatsParseError } from './serialization';
import { createYearFilter } from './utils';
import {
	calculateWatchTime,
	calculateTopMovies,
	calculateTopShows,
	calculateTopGenres,
	calculateMonthlyDistribution,
	calculateHourlyDistribution,
	calculatePercentileRank,
	getAllUsersWatchTime,
	detectLongestBinge,
	findFirstWatch,
	findLastWatch,
	calculateWeekdayDistribution,
	calculateContentTypeBreakdown,
	calculateDecadeDistribution,
	calculateTopRewatches,
	calculateMarathonDay,
	calculateWatchStreak,
	calculateYearComparison,
	calculateSeriesProgress,
	seriesProgressToCompletion
} from './calculators';
import { fetchShowsMetadataBatch } from '$lib/server/plex/client';

import type { SeriesCompletionItem } from '$lib/stats/types';
import type { PlayHistoryRecord } from '$lib/server/db/schema';

export interface CalculateStatsOptions {
	forceRecalculate?: boolean;
	cacheTtlSeconds?: number;
}

const DEFAULT_CACHE_TTL_SECONDS = 3600;

async function calculateSeriesCompletion(
	records: PlayHistoryRecord[],
	limit: number = 10
): Promise<SeriesCompletionItem[]> {
	const seriesMap = calculateSeriesProgress(records);

	if (seriesMap.size === 0) {
		return [];
	}

	const showRatingKeys = Array.from(seriesMap.values())
		.filter((s) => /^\d+$/.test(s.grandparentRatingKey))
		.map((s) => s.grandparentRatingKey);

	const totalEpisodesMap = new Map<string, number>();

	if (showRatingKeys.length > 0) {
		try {
			const showMetadata = await fetchShowsMetadataBatch(showRatingKeys);
			for (const [ratingKey, metadata] of showMetadata) {
				if (metadata?.leafCount) {
					totalEpisodesMap.set(ratingKey, metadata.leafCount);
				}
			}
		} catch {
			// Plex API unavailable, fall back to watched episodes as total
		}
	}

	return seriesProgressToCompletion(seriesMap, totalEpisodesMap, limit);
}

export async function getCachedStats(
	userId: number | null,
	year: number,
	cacheTtlSeconds: number
): Promise<Stats | null> {
	const statsType = userId === null ? 'server' : 'user';

	const whereCondition =
		userId === null
			? and(
					isNull(cachedStats.userId),
					eq(cachedStats.year, year),
					eq(cachedStats.statsType, statsType)
				)
			: and(
					eq(cachedStats.userId, userId),
					eq(cachedStats.year, year),
					eq(cachedStats.statsType, statsType)
				);

	const result = await db.select().from(cachedStats).where(whereCondition).limit(1);

	const cached = result[0];
	if (!cached) {
		return null;
	}

	const calculatedAt = cached.calculatedAt;
	if (!calculatedAt) {
		return null;
	}

	const ageSeconds = (Date.now() - calculatedAt.getTime()) / 1000;
	if (ageSeconds > cacheTtlSeconds) {
		return null;
	}

	try {
		return parseStats(cached.statsJson);
	} catch {
		return null;
	}
}

export async function cacheStats(stats: Stats, userId: number | null, year: number): Promise<void> {
	const statsType = userId === null ? 'server' : 'user';
	const statsJson = serializeStats(stats);

	const whereCondition =
		userId === null
			? and(
					isNull(cachedStats.userId),
					eq(cachedStats.year, year),
					eq(cachedStats.statsType, statsType)
				)
			: and(
					eq(cachedStats.userId, userId),
					eq(cachedStats.year, year),
					eq(cachedStats.statsType, statsType)
				);

	await db.delete(cachedStats).where(whereCondition);

	await db.insert(cachedStats).values({
		userId,
		year,
		statsType,
		statsJson
	});
}

export async function invalidateCache(userId?: number | null, year?: number): Promise<void> {
	const conditions = [];

	if (userId !== undefined) {
		if (userId === null) {
			conditions.push(isNull(cachedStats.userId));
		} else {
			conditions.push(eq(cachedStats.userId, userId));
		}
	}

	if (year !== undefined) {
		conditions.push(eq(cachedStats.year, year));
	}

	if (conditions.length === 0) {
		await db.delete(cachedStats);
	} else {
		await db.delete(cachedStats).where(and(...conditions));
	}
}

export async function calculateUserStats(
	userId: number,
	year: number,
	options: CalculateStatsOptions = {}
): Promise<UserStats> {
	const { forceRecalculate = false, cacheTtlSeconds = DEFAULT_CACHE_TTL_SECONDS } = options;

	if (!forceRecalculate) {
		const cached = await getCachedStats(userId, year, cacheTtlSeconds);
		if (cached && 'userId' in cached) {
			return cached;
		}
	}

	const yearFilter = createYearFilter(year);

	const records = await db
		.select()
		.from(playHistory)
		.where(
			and(
				eq(playHistory.accountId, userId),
				gte(playHistory.viewedAt, yearFilter.startTimestamp),
				lte(playHistory.viewedAt, yearFilter.endTimestamp)
			)
		)
		.orderBy(asc(playHistory.viewedAt));

	const watchTime = calculateWatchTime(records);
	const movies = records.filter((r) => r.type === 'movie');
	const episodes = records.filter((r) => r.type === 'episode');

	const topMovies = calculateTopMovies(movies);
	const topShows = calculateTopShows(episodes);
	const topGenres = calculateTopGenres(records);

	const watchTimeByMonth = calculateMonthlyDistribution(records);
	const watchTimeByHour = calculateHourlyDistribution(records);
	const watchTimeByWeekday = calculateWeekdayDistribution(records);

	const contentTypes = calculateContentTypeBreakdown(records);
	const decadeDistribution = calculateDecadeDistribution(records);
	const topRewatches = calculateTopRewatches(records);
	const marathonDay = calculateMarathonDay(records);
	const watchStreak = calculateWatchStreak(records);

	const previousYearFilter = createYearFilter(year - 1);
	const previousYearRecords = await db
		.select()
		.from(playHistory)
		.where(
			and(
				eq(playHistory.accountId, userId),
				gte(playHistory.viewedAt, previousYearFilter.startTimestamp),
				lte(playHistory.viewedAt, previousYearFilter.endTimestamp)
			)
		);
	const previousYearWatchTime = calculateWatchTime(previousYearRecords);
	const yearComparison = calculateYearComparison(
		watchTime.totalWatchTimeMinutes,
		previousYearWatchTime.totalWatchTimeMinutes
	);

	const allUsersWatchTime = await getAllUsersWatchTime(db, yearFilter);
	const allWatchTimes = Array.from(allUsersWatchTime.values());
	const percentileRank = calculatePercentileRank(watchTime.totalWatchTimeMinutes, allWatchTimes);

	const longestBinge = detectLongestBinge(records);
	const firstWatch = findFirstWatch(records);
	const lastWatch = findLastWatch(records);
	const seriesCompletion = await calculateSeriesCompletion(records);

	const stats: UserStats = {
		userId,
		year,
		totalWatchTimeMinutes: watchTime.totalWatchTimeMinutes,
		totalPlays: watchTime.totalPlays,
		topMovies,
		topShows,
		topGenres,
		watchTimeByMonth,
		watchTimeByHour,
		watchTimeByWeekday,
		contentTypes,
		decadeDistribution,
		seriesCompletion,
		topRewatches,
		marathonDay,
		watchStreak,
		yearComparison,
		percentileRank,
		longestBinge,
		firstWatch,
		lastWatch
	};

	const validated = UserStatsSchema.parse(stats);
	await cacheStats(validated, userId, year);

	return validated;
}

export async function calculateServerStats(
	year: number,
	options: CalculateStatsOptions = {}
): Promise<ServerStats> {
	const { forceRecalculate = false, cacheTtlSeconds = DEFAULT_CACHE_TTL_SECONDS } = options;

	if (!forceRecalculate) {
		const cached = await getCachedStats(null, year, cacheTtlSeconds);
		if (cached && 'totalUsers' in cached) {
			return cached;
		}
	}

	const yearFilter = createYearFilter(year);

	const records = await db
		.select()
		.from(playHistory)
		.where(
			and(
				gte(playHistory.viewedAt, yearFilter.startTimestamp),
				lte(playHistory.viewedAt, yearFilter.endTimestamp)
			)
		)
		.orderBy(asc(playHistory.viewedAt));

	const watchTime = calculateWatchTime(records);
	const movies = records.filter((r) => r.type === 'movie');
	const episodes = records.filter((r) => r.type === 'episode');

	const topMovies = calculateTopMovies(movies);
	const topShows = calculateTopShows(episodes);
	const topGenres = calculateTopGenres(records);

	const watchTimeByMonth = calculateMonthlyDistribution(records);
	const watchTimeByHour = calculateHourlyDistribution(records);
	const watchTimeByWeekday = calculateWeekdayDistribution(records);

	const contentTypes = calculateContentTypeBreakdown(records);
	const decadeDistribution = calculateDecadeDistribution(records);
	const topRewatches = calculateTopRewatches(records);
	const marathonDay = calculateMarathonDay(records);
	const watchStreak = calculateWatchStreak(records);

	const previousYearFilter = createYearFilter(year - 1);
	const previousYearRecords = await db
		.select()
		.from(playHistory)
		.where(
			and(
				gte(playHistory.viewedAt, previousYearFilter.startTimestamp),
				lte(playHistory.viewedAt, previousYearFilter.endTimestamp)
			)
		);
	const previousYearWatchTime = calculateWatchTime(previousYearRecords);
	const yearComparison = calculateYearComparison(
		watchTime.totalWatchTimeMinutes,
		previousYearWatchTime.totalWatchTimeMinutes
	);

	const allUsersWatchTime = await getAllUsersWatchTime(db, yearFilter);
	const totalUsers = allUsersWatchTime.size;
	const topViewers = await calculateTopViewers(allUsersWatchTime);
	const longestBinge = detectLongestBinge(records);
	const firstWatch = findFirstWatch(records);
	const lastWatch = findLastWatch(records);
	const seriesCompletion = await calculateSeriesCompletion(records);

	const stats: ServerStats = {
		year,
		totalUsers,
		totalWatchTimeMinutes: watchTime.totalWatchTimeMinutes,
		totalPlays: watchTime.totalPlays,
		topMovies,
		topShows,
		topGenres,
		watchTimeByMonth,
		watchTimeByHour,
		watchTimeByWeekday,
		contentTypes,
		decadeDistribution,
		seriesCompletion,
		topRewatches,
		marathonDay,
		watchStreak,
		yearComparison,
		topViewers,
		longestBinge,
		firstWatch,
		lastWatch
	};

	const validated = ServerStatsSchema.parse(stats);
	await cacheStats(validated, null, year);

	return validated;
}

async function calculateTopViewers(
	watchTimeMap: Map<number, number>
): Promise<ServerStats['topViewers']> {
	const limit = 10;
	const sortedUsers = Array.from(watchTimeMap.entries())
		.sort((a, b) => b[1] - a[1])
		.slice(0, limit);

	const accountIds = sortedUsers.map(([accountId]) => accountId);

	if (accountIds.length === 0) {
		return [];
	}

	const plexAccountResults = await db.select().from(plexAccounts);
	const userMap = new Map<number, string>();
	for (const account of plexAccountResults) {
		userMap.set(account.accountId, account.username);
	}

	const userResults = await db.select().from(users);
	for (const user of userResults) {
		if (user.accountId !== null && !userMap.has(user.accountId)) {
			userMap.set(user.accountId, user.username);
		}
		if (!userMap.has(user.plexId)) {
			userMap.set(user.plexId, user.username);
		}
	}

	const topViewers: ServerStats['topViewers'] = [];
	for (let i = 0; i < sortedUsers.length; i++) {
		const entry = sortedUsers[i];
		if (!entry) continue;

		const [accountId, totalMinutes] = entry;
		const username = userMap.get(accountId) ?? `User ${accountId}`;

		topViewers.push({
			rank: i + 1,
			userId: accountId,
			username,
			totalMinutes
		});
	}

	return topViewers;
}

export async function getServerStatsWithAnonymization(
	year: number,
	viewingUserId: number | null,
	options: CalculateStatsOptions = {}
): Promise<ServerStats> {
	const { applyAnonymization, getAnonymizationModeForStat } =
		await import('$lib/server/anonymization/service');

	const stats = await calculateServerStats(year, options);
	const topViewersMode = await getAnonymizationModeForStat('topViewers');
	const anonymizedTopViewers = applyAnonymization(stats.topViewers, topViewersMode, viewingUserId);

	return {
		...stats,
		topViewers: anonymizedTopViewers
	};
}
