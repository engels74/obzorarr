/**
 * Distribution Calculators
 *
 * Property 11: Monthly Distribution Completeness
 * For any set of play history records within a year, the sum of watch time
 * across all 12 monthly buckets SHALL equal the total watch time.
 *
 * Property 12: Hourly Distribution Completeness
 * For any set of play history records, the sum of watch time across all
 * 24 hourly buckets SHALL equal the total watch time.
 *
 * Property 11b: Monthly Play Count Completeness
 * For any set of play history records within a year, the sum of play counts
 * across all 12 monthly buckets SHALL equal the total play count.
 *
 * Property 12b: Hourly Play Count Completeness
 * For any set of play history records, the sum of play counts across all
 * 24 hourly buckets SHALL equal the total play count.
 */

import { getMonthFromTimestamp, getHourFromTimestamp } from '../utils';
import type { PlayHistoryRecord } from '../utils';
import type { MonthlyDistribution, HourlyDistribution } from '../types';

/**
 * Calculate watch time and play count distribution by month
 *
 * Returns an object with minutes and plays arrays, each with 12 elements.
 * Index 0 = January, Index 11 = December.
 *
 * @param records - Play history records for a year
 * @returns Object with minutes and plays arrays (12 elements each)
 *
 * @example
 * ```ts
 * const records = [
 *   { viewedAt: 1704067200, duration: 3600, ... }, // Jan 1, 2024
 *   { viewedAt: 1706745600, duration: 1800, ... }, // Feb 1, 2024
 * ];
 * const monthly = calculateMonthlyDistribution(records);
 * // monthly.minutes[0] = 60 (January watch time)
 * // monthly.minutes[1] = 30 (February watch time)
 * // monthly.plays[0] = 1 (January play count)
 * // monthly.plays[1] = 1 (February play count)
 * ```
 */
export function calculateMonthlyDistribution(records: PlayHistoryRecord[]): MonthlyDistribution {
	// Initialize 12 buckets with zeros for both minutes and plays
	const minutes: number[] = Array.from({ length: 12 }, () => 0);
	const plays: number[] = Array.from({ length: 12 }, () => 0);

	for (const record of records) {
		const month = getMonthFromTimestamp(record.viewedAt);
		const durationMinutes = (record.duration ?? 0) / 60;
		// Month is guaranteed to be 0-11 from getUTCMonth()
		minutes[month] = (minutes[month] ?? 0) + durationMinutes;
		plays[month] = (plays[month] ?? 0) + 1;
	}

	return { minutes, plays };
}

/**
 * Calculate watch time and play count distribution by hour of day
 *
 * Returns an object with minutes and plays arrays, each with 24 elements.
 * Index 0 = midnight (00:00-00:59), Index 23 = 11 PM (23:00-23:59).
 * Uses UTC time for consistency.
 *
 * @param records - Play history records
 * @returns Object with minutes and plays arrays (24 elements each)
 *
 * @example
 * ```ts
 * const records = [
 *   { viewedAt: 1704067200, duration: 3600, ... }, // 00:00 UTC
 *   { viewedAt: 1704110400, duration: 1800, ... }, // 12:00 UTC
 * ];
 * const hourly = calculateHourlyDistribution(records);
 * // hourly.minutes[0] = 60 (midnight watch time)
 * // hourly.minutes[12] = 30 (noon watch time)
 * // hourly.plays[0] = 1 (midnight play count)
 * // hourly.plays[12] = 1 (noon play count)
 * ```
 */
export function calculateHourlyDistribution(records: PlayHistoryRecord[]): HourlyDistribution {
	// Initialize 24 buckets with zeros for both minutes and plays
	const minutes: number[] = Array.from({ length: 24 }, () => 0);
	const plays: number[] = Array.from({ length: 24 }, () => 0);

	for (const record of records) {
		const hour = getHourFromTimestamp(record.viewedAt);
		const durationMinutes = (record.duration ?? 0) / 60;
		// Hour is guaranteed to be 0-23 from getUTCHours()
		minutes[hour] = (minutes[hour] ?? 0) + durationMinutes;
		plays[hour] = (plays[hour] ?? 0) + 1;
	}

	return { minutes, plays };
}
