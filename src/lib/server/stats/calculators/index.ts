export { calculateWatchTime, type WatchTimeResult } from './watch-time';

export {
	calculateTopMovies,
	calculateTopShows,
	calculateTopGenres,
	type RankingOptions
} from './ranking';

export { calculateMonthlyDistribution, calculateHourlyDistribution } from './distributions';

export { calculatePercentileRank, getAllUsersWatchTime } from './percentile';

export {
	detectLongestBinge,
	detectAllBingeSessions,
	BINGE_GAP_THRESHOLD_SECONDS
} from './binge-detector';

export { findFirstWatch, findLastWatch } from './first-last';

export {
	calculateWeekdayDistribution,
	calculateContentTypeBreakdown,
	calculateDecadeDistribution,
	calculateTopRewatches,
	calculateMarathonDay,
	calculateWatchStreak,
	calculateYearComparison,
	calculateSeriesProgress,
	seriesProgressToCompletion,
	type SeriesProgress
} from './new-slides';
