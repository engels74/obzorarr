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

export const WeekdayDistributionSchema = z.object({
	minutes: z.array(z.number().nonnegative()).length(7),
	plays: z.array(z.number().int().nonnegative()).length(7)
});

export const ContentTypeBreakdownSchema = z.object({
	movies: z.object({ count: z.number().int().nonnegative(), minutes: z.number().nonnegative() }),
	episodes: z.object({ count: z.number().int().nonnegative(), minutes: z.number().nonnegative() }),
	tracks: z.object({ count: z.number().int().nonnegative(), minutes: z.number().nonnegative() })
});

export const DecadeDistributionItemSchema = z.object({
	decade: z.string(),
	count: z.number().int().nonnegative(),
	minutes: z.number().nonnegative()
});

export const SeriesCompletionItemSchema = z.object({
	show: z.string(),
	thumb: z.string().nullable(),
	grandparentRatingKey: z.string(),
	watchedEpisodes: z.number().int().nonnegative(),
	totalEpisodes: z.number().int().nonnegative(),
	percentComplete: z.number().min(0).max(100)
});

export const RewatchItemSchema = z.object({
	title: z.string(),
	thumb: z.string().nullable(),
	type: z.enum(['movie', 'episode', 'track']),
	rewatchCount: z.number().int().min(2)
});

export const MarathonDaySchema = z.object({
	date: z.string(),
	minutes: z.number().nonnegative(),
	plays: z.number().int().nonnegative(),
	items: z.array(
		z.object({
			title: z.string(),
			thumb: z.string().nullable()
		})
	)
});

export const WatchStreakSchema = z.object({
	longestStreak: z.number().int().nonnegative(),
	startDate: z.string(),
	endDate: z.string(),
	currentStreak: z.number().int().nonnegative().optional()
});

export const YearComparisonSchema = z.object({
	thisYear: z.number().nonnegative(),
	lastYear: z.number().nonnegative(),
	percentChange: z.number()
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
	watchTimeByWeekday: WeekdayDistributionSchema,
	contentTypes: ContentTypeBreakdownSchema,
	decadeDistribution: z.array(DecadeDistributionItemSchema),
	seriesCompletion: z.array(SeriesCompletionItemSchema),
	topRewatches: z.array(RewatchItemSchema),
	marathonDay: MarathonDaySchema.nullable(),
	watchStreak: WatchStreakSchema.nullable(),
	yearComparison: YearComparisonSchema.nullable(),
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
	watchTimeByWeekday: WeekdayDistributionSchema,
	contentTypes: ContentTypeBreakdownSchema,
	decadeDistribution: z.array(DecadeDistributionItemSchema),
	seriesCompletion: z.array(SeriesCompletionItemSchema),
	topRewatches: z.array(RewatchItemSchema),
	marathonDay: MarathonDaySchema.nullable(),
	watchStreak: WatchStreakSchema.nullable(),
	yearComparison: YearComparisonSchema.nullable(),
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
export type WeekdayDistribution = z.infer<typeof WeekdayDistributionSchema>;
export type ContentTypeBreakdown = z.infer<typeof ContentTypeBreakdownSchema>;
export type DecadeDistributionItem = z.infer<typeof DecadeDistributionItemSchema>;
export type SeriesCompletionItem = z.infer<typeof SeriesCompletionItemSchema>;
export type RewatchItem = z.infer<typeof RewatchItemSchema>;
export type MarathonDay = z.infer<typeof MarathonDaySchema>;
export type WatchStreak = z.infer<typeof WatchStreakSchema>;
export type YearComparison = z.infer<typeof YearComparisonSchema>;
export type UserStats = z.infer<typeof UserStatsSchema>;
export type ServerStats = z.infer<typeof ServerStatsSchema>;

export type Stats = UserStats | ServerStats;

export function isUserStats(stats: Stats): stats is UserStats {
	return 'userId' in stats && 'percentileRank' in stats;
}

export function isServerStats(stats: Stats): stats is ServerStats {
	return 'totalUsers' in stats && 'topViewers' in stats;
}
