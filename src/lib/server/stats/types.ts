import { z } from 'zod';

/**
 * Statistics types and Zod schemas for Obzorarr
 *
 * These types are used for:
 * 1. Type-safe statistics calculation
 * 2. JSON serialization/deserialization with validation
 * 3. Database storage in cached_stats table
 */

// =============================================================================
// Zod Schemas (source of truth for runtime validation)
// =============================================================================

/**
 * A ranked item in a top list (movies, shows, genres)
 */
export const RankedItemSchema = z.object({
	rank: z.number().int().positive(),
	title: z.string(),
	count: z.number().int().nonnegative(),
	thumb: z.string().nullable()
});

/**
 * A binge watching session - consecutive plays within 30 minutes
 */
export const BingeSessionSchema = z.object({
	startTime: z.number().int(), // Unix timestamp
	endTime: z.number().int(), // Unix timestamp
	plays: z.number().int().positive(),
	totalMinutes: z.number().nonnegative()
});

/**
 * A single watch record (first/last watch of year)
 */
export const WatchRecordSchema = z.object({
	title: z.string(),
	viewedAt: z.number().int(), // Unix timestamp
	thumb: z.string().nullable(),
	type: z.enum(['movie', 'episode', 'track'])
});

/**
 * Complete statistics for a single user
 */
export const UserStatsSchema = z.object({
	userId: z.number().int().positive(),
	year: z.number().int().min(2000).max(2100),
	totalWatchTimeMinutes: z.number().nonnegative(),
	totalPlays: z.number().int().nonnegative(),
	topMovies: z.array(RankedItemSchema),
	topShows: z.array(RankedItemSchema),
	topGenres: z.array(RankedItemSchema),
	watchTimeByMonth: z.array(z.number().nonnegative()).length(12),
	watchTimeByHour: z.array(z.number().nonnegative()).length(24),
	percentileRank: z.number().min(0).max(100),
	longestBinge: BingeSessionSchema.nullable(),
	firstWatch: WatchRecordSchema.nullable(),
	lastWatch: WatchRecordSchema.nullable()
});

/**
 * Complete server-wide statistics
 */
export const ServerStatsSchema = z.object({
	year: z.number().int().min(2000).max(2100),
	totalUsers: z.number().int().nonnegative(),
	totalWatchTimeMinutes: z.number().nonnegative(),
	totalPlays: z.number().int().nonnegative(),
	topMovies: z.array(RankedItemSchema),
	topShows: z.array(RankedItemSchema),
	topGenres: z.array(RankedItemSchema),
	watchTimeByMonth: z.array(z.number().nonnegative()).length(12),
	watchTimeByHour: z.array(z.number().nonnegative()).length(24),
	topViewers: z.array(
		z.object({
			rank: z.number().int().positive(),
			userId: z.number().int().positive(),
			username: z.string(),
			totalMinutes: z.number().nonnegative()
		})
	),
	longestBinge: BingeSessionSchema.nullable(),
	firstWatch: WatchRecordSchema.nullable(),
	lastWatch: WatchRecordSchema.nullable()
});

// =============================================================================
// TypeScript Types (inferred from Zod schemas)
// =============================================================================

export type RankedItem = z.infer<typeof RankedItemSchema>;
export type BingeSession = z.infer<typeof BingeSessionSchema>;
export type WatchRecord = z.infer<typeof WatchRecordSchema>;
export type UserStats = z.infer<typeof UserStatsSchema>;
export type ServerStats = z.infer<typeof ServerStatsSchema>;

/**
 * Union type for any stats object
 */
export type Stats = UserStats | ServerStats;

/**
 * Type guard to check if stats is UserStats
 */
export function isUserStats(stats: Stats): stats is UserStats {
	return 'userId' in stats && 'percentileRank' in stats;
}

/**
 * Type guard to check if stats is ServerStats
 */
export function isServerStats(stats: Stats): stats is ServerStats {
	return 'totalUsers' in stats && 'topViewers' in stats;
}
