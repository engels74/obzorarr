/**
 * Statistics Calculators
 *
 * Re-exports all calculator functions for convenient import.
 *
 * @example
 * ```ts
 * import {
 *   calculateWatchTime,
 *   calculateTopMovies,
 *   calculateTopShows,
 *   detectLongestBinge
 * } from '$lib/server/stats/calculators';
 * ```
 */

// Watch Time Calculator (Task 7.1)
export { calculateWatchTime, type WatchTimeResult } from './watch-time';

// Ranking Calculator (Task 7.2)
export {
	calculateTopMovies,
	calculateTopShows,
	calculateTopGenres,
	type RankingOptions
} from './ranking';

// Distribution Calculators (Task 7.3)
export { calculateMonthlyDistribution, calculateHourlyDistribution } from './distributions';

// Percentile Calculator (Task 7.4)
export { calculatePercentileRank, getAllUsersWatchTime } from './percentile';

// Binge Detector (Task 7.5)
export {
	detectLongestBinge,
	detectAllBingeSessions,
	BINGE_GAP_THRESHOLD_SECONDS
} from './binge-detector';

// First/Last Watch Finder (Task 7.6)
export { findFirstWatch, findLastWatch } from './first-last';
