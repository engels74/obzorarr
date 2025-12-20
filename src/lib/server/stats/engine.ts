/**
 * Statistics Engine Facade
 *
 * Task 7.7: Create stats engine facade
 * Requirements: 4.1, 4.11
 *
 * Orchestrates all calculator modules and handles caching.
 *
 * Property 8: Year Date Range Filtering
 * For any year Y, only includes records where viewedAt falls between
 * Jan 1 00:00:00 and Dec 31 23:59:59 of year Y.
 */

import { and, asc, eq, gte, isNull, lte, sql } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { cachedStats, playHistory, users } from '$lib/server/db/schema';
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
	findLastWatch
} from './calculators';

/**
 * Options for stats calculation
 */
export interface CalculateStatsOptions {
	/** Force recalculation even if cached (default: false) */
	forceRecalculate?: boolean;
	/** Cache TTL in seconds (default: 3600 = 1 hour) */
	cacheTtlSeconds?: number;
}

/** Default cache TTL: 1 hour */
const DEFAULT_CACHE_TTL_SECONDS = 3600;

/**
 * Get cached stats if available and not expired
 *
 * @param userId - User ID (null for server stats)
 * @param year - Year
 * @param cacheTtlSeconds - Maximum age of cache in seconds
 * @returns Cached stats or null if not available/expired
 */
export async function getCachedStats(
	userId: number | null,
	year: number,
	cacheTtlSeconds: number
): Promise<Stats | null> {
	const statsType = userId === null ? 'server' : 'user';

	// Build the where clause based on whether we're looking for user or server stats
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

	// Check if expired
	const calculatedAt = cached.calculatedAt;
	if (!calculatedAt) {
		return null;
	}

	const ageSeconds = (Date.now() - calculatedAt.getTime()) / 1000;
	if (ageSeconds > cacheTtlSeconds) {
		return null;
	}

	// Parse and return
	try {
		return parseStats(cached.statsJson);
	} catch {
		// If parsing fails, treat as cache miss
		return null;
	}
}

/**
 * Save stats to cache
 *
 * @param stats - The stats object to cache
 * @param userId - User ID (null for server stats)
 * @param year - Year
 */
export async function cacheStats(
	stats: Stats,
	userId: number | null,
	year: number
): Promise<void> {
	const statsType = userId === null ? 'server' : 'user';
	const statsJson = serializeStats(stats);

	// Delete existing cache entry
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

	// Insert new cache entry
	await db.insert(cachedStats).values({
		userId,
		year,
		statsType,
		statsJson
	});
}

/**
 * Invalidate cached stats
 *
 * @param userId - User ID (null for server stats, undefined for all)
 * @param year - Year (undefined for all years)
 */
export async function invalidateCache(userId?: number | null, year?: number): Promise<void> {
	// Build conditions
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
		// Delete all cache
		await db.delete(cachedStats);
	} else {
		await db.delete(cachedStats).where(and(...conditions));
	}
}

/**
 * Calculate statistics for a specific user and year
 *
 * @param userId - The user's accountId from play_history
 * @param year - The year to calculate stats for
 * @param options - Calculation options
 * @returns Complete user statistics
 */
export async function calculateUserStats(
	userId: number,
	year: number,
	options: CalculateStatsOptions = {}
): Promise<UserStats> {
	const { forceRecalculate = false, cacheTtlSeconds = DEFAULT_CACHE_TTL_SECONDS } = options;

	// Check cache first (unless forced)
	if (!forceRecalculate) {
		const cached = await getCachedStats(userId, year, cacheTtlSeconds);
		if (cached && 'userId' in cached) {
			return cached;
		}
	}

	// Create year filter
	const yearFilter = createYearFilter(year);

	// Fetch all user records for the year
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

	// Calculate each statistic
	const watchTime = calculateWatchTime(records);

	// Filter records by type for rankings
	const movies = records.filter((r) => r.type === 'movie');
	const episodes = records.filter((r) => r.type === 'episode');

	const topMovies = calculateTopMovies(movies);
	const topShows = calculateTopShows(episodes);
	const topGenres = calculateTopGenres(records); // Returns empty for now

	const watchTimeByMonth = calculateMonthlyDistribution(records);
	const watchTimeByHour = calculateHourlyDistribution(records);

	// Calculate percentile (requires all users' data)
	const allUsersWatchTime = await getAllUsersWatchTime(db, yearFilter);
	const allWatchTimes = Array.from(allUsersWatchTime.values());
	const percentileRank = calculatePercentileRank(watchTime.totalWatchTimeMinutes, allWatchTimes);

	// Detect binge and first/last
	const longestBinge = detectLongestBinge(records);
	const firstWatch = findFirstWatch(records);
	const lastWatch = findLastWatch(records);

	// Assemble result
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
		percentileRank,
		longestBinge,
		firstWatch,
		lastWatch
	};

	// Validate with Zod schema
	const validated = UserStatsSchema.parse(stats);

	// Cache the result
	await cacheStats(validated, userId, year);

	return validated;
}

/**
 * Calculate server-wide statistics for a year
 *
 * @param year - The year to calculate stats for
 * @param options - Calculation options
 * @returns Complete server statistics
 */
export async function calculateServerStats(
	year: number,
	options: CalculateStatsOptions = {}
): Promise<ServerStats> {
	const { forceRecalculate = false, cacheTtlSeconds = DEFAULT_CACHE_TTL_SECONDS } = options;

	// Check cache first (unless forced)
	if (!forceRecalculate) {
		const cached = await getCachedStats(null, year, cacheTtlSeconds);
		if (cached && 'totalUsers' in cached) {
			return cached;
		}
	}

	// Create year filter
	const yearFilter = createYearFilter(year);

	// Fetch all records for the year
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

	// Calculate aggregate stats
	const watchTime = calculateWatchTime(records);

	// Filter records by type for rankings
	const movies = records.filter((r) => r.type === 'movie');
	const episodes = records.filter((r) => r.type === 'episode');

	const topMovies = calculateTopMovies(movies);
	const topShows = calculateTopShows(episodes);
	const topGenres = calculateTopGenres(records);

	const watchTimeByMonth = calculateMonthlyDistribution(records);
	const watchTimeByHour = calculateHourlyDistribution(records);

	// Get all users' watch times
	const allUsersWatchTime = await getAllUsersWatchTime(db, yearFilter);
	const totalUsers = allUsersWatchTime.size;

	// Calculate top viewers
	const topViewers = await calculateTopViewers(allUsersWatchTime);

	// Detect binge and first/last for server
	const longestBinge = detectLongestBinge(records);
	const firstWatch = findFirstWatch(records);
	const lastWatch = findLastWatch(records);

	// Assemble result
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
		topViewers,
		longestBinge,
		firstWatch,
		lastWatch
	};

	// Validate with Zod schema
	const validated = ServerStatsSchema.parse(stats);

	// Cache the result
	await cacheStats(validated, null, year);

	return validated;
}

/**
 * Calculate top viewers for server stats
 *
 * @param watchTimeMap - Map of accountId to total watch time in minutes
 * @returns Top viewers array with usernames
 */
async function calculateTopViewers(
	watchTimeMap: Map<number, number>
): Promise<ServerStats['topViewers']> {
	const limit = 10;

	// Sort users by watch time descending
	const sortedUsers = Array.from(watchTimeMap.entries())
		.sort((a, b) => b[1] - a[1])
		.slice(0, limit);

	// Get usernames from the users table
	const accountIds = sortedUsers.map(([accountId]) => accountId);

	if (accountIds.length === 0) {
		return [];
	}

	// Fetch user info
	// Note: accountId in playHistory may correspond to plexId in users table
	const userResults = await db.select().from(users);

	// Create a map of plexId to username
	const userMap = new Map<number, string>();
	for (const user of userResults) {
		userMap.set(user.plexId, user.username);
	}

	// Build top viewers list
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
