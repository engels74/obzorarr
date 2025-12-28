import { z } from 'zod';

export const RankedItemSchema = z.object({
	rank: z.number().int().positive(),
	title: z.string(),
	count: z.number().int().nonnegative(),
	thumb: z.string().nullable()
});

// Binge session: consecutive plays within 30 minutes
export const BingeSessionSchema = z.object({
	startTime: z.number().int(), // Unix timestamp
	endTime: z.number().int(), // Unix timestamp
	plays: z.number().int().positive(),
	totalMinutes: z.number().nonnegative()
});

export const WatchRecordSchema = z.object({
	title: z.string(),
	viewedAt: z.number().int(), // Unix timestamp
	thumb: z.string().nullable(),
	type: z.enum(['movie', 'episode', 'track'])
});

export const MonthlyDistributionSchema = z.object({
	minutes: z.array(z.number().nonnegative()).length(12),
	plays: z.array(z.number().int().nonnegative()).length(12)
});

export const HourlyDistributionSchema = z.object({
	minutes: z.array(z.number().nonnegative()).length(24),
	plays: z.array(z.number().int().nonnegative()).length(24)
});

export const UserStatsSchema = z.object({
	userId: z.number().int().positive(),
	year: z.number().int().min(2000).max(2100),
	totalWatchTimeMinutes: z.number().nonnegative(),
	totalPlays: z.number().int().nonnegative(),
	topMovies: z.array(RankedItemSchema),
	topShows: z.array(RankedItemSchema),
	topGenres: z.array(RankedItemSchema),
	watchTimeByMonth: MonthlyDistributionSchema,
	watchTimeByHour: HourlyDistributionSchema,
	percentileRank: z.number().min(0).max(100),
	longestBinge: BingeSessionSchema.nullable(),
	firstWatch: WatchRecordSchema.nullable(),
	lastWatch: WatchRecordSchema.nullable()
});

export const ServerStatsSchema = z.object({
	year: z.number().int().min(2000).max(2100),
	totalUsers: z.number().int().nonnegative(),
	totalWatchTimeMinutes: z.number().nonnegative(),
	totalPlays: z.number().int().nonnegative(),
	topMovies: z.array(RankedItemSchema),
	topShows: z.array(RankedItemSchema),
	topGenres: z.array(RankedItemSchema),
	watchTimeByMonth: MonthlyDistributionSchema,
	watchTimeByHour: HourlyDistributionSchema,
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

export type RankedItem = z.infer<typeof RankedItemSchema>;
export type BingeSession = z.infer<typeof BingeSessionSchema>;
export type WatchRecord = z.infer<typeof WatchRecordSchema>;
export type MonthlyDistribution = z.infer<typeof MonthlyDistributionSchema>;
export type HourlyDistribution = z.infer<typeof HourlyDistributionSchema>;
export type UserStats = z.infer<typeof UserStatsSchema>;
export type ServerStats = z.infer<typeof ServerStatsSchema>;

export type Stats = UserStats | ServerStats;

export function isUserStats(stats: Stats): stats is UserStats {
	return 'userId' in stats && 'percentileRank' in stats;
}

export function isServerStats(stats: Stats): stats is ServerStats {
	return 'totalUsers' in stats && 'topViewers' in stats;
}
