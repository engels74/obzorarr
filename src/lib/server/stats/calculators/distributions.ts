/**
 * Distribution Calculators
 *
 * Task 7.3: Implement distribution calculators
 * Requirements: 4.6, 4.7
 *
 * Property 11: Monthly Distribution Completeness
 * For any set of play history records within a year, the sum of watch time
 * across all 12 monthly buckets SHALL equal the total watch time.
 *
 * Property 12: Hourly Distribution Completeness
 * For any set of play history records, the sum of watch time across all
 * 24 hourly buckets SHALL equal the total watch time.
 */

import { getMonthFromTimestamp, getHourFromTimestamp } from '../utils';
import type { PlayHistoryRecord } from '../utils';

/**
 * Calculate watch time distribution by month
 *
 * Returns an array of 12 numbers representing minutes watched per month.
 * Index 0 = January, Index 11 = December.
 *
 * @param records - Play history records for a year
 * @returns Array of 12 numbers (minutes per month)
 *
 * @example
 * ```ts
 * const records = [
 *   { viewedAt: 1704067200, duration: 3600, ... }, // Jan 1, 2024
 *   { viewedAt: 1706745600, duration: 1800, ... }, // Feb 1, 2024
 * ];
 * const monthly = calculateMonthlyDistribution(records);
 * // monthly[0] = 60 (January)
 * // monthly[1] = 30 (February)
 * // monthly[2..11] = 0
 * ```
 */
export function calculateMonthlyDistribution(records: PlayHistoryRecord[]): number[] {
	// Initialize 12 buckets with zeros
	const distribution: number[] = Array.from({ length: 12 }, () => 0);

	for (const record of records) {
		const month = getMonthFromTimestamp(record.viewedAt);
		const durationMinutes = (record.duration ?? 0) / 60;
		// Month is guaranteed to be 0-11 from getUTCMonth()
		const currentValue = distribution[month] ?? 0;
		distribution[month] = currentValue + durationMinutes;
	}

	return distribution;
}

/**
 * Calculate watch time distribution by hour of day
 *
 * Returns an array of 24 numbers representing minutes watched per hour.
 * Index 0 = midnight (00:00-00:59), Index 23 = 11 PM (23:00-23:59).
 * Uses UTC time for consistency.
 *
 * @param records - Play history records
 * @returns Array of 24 numbers (minutes per hour)
 *
 * @example
 * ```ts
 * const records = [
 *   { viewedAt: 1704067200, duration: 3600, ... }, // 00:00 UTC
 *   { viewedAt: 1704110400, duration: 1800, ... }, // 12:00 UTC
 * ];
 * const hourly = calculateHourlyDistribution(records);
 * // hourly[0] = 60 (midnight)
 * // hourly[12] = 30 (noon)
 * // other hours = 0
 * ```
 */
export function calculateHourlyDistribution(records: PlayHistoryRecord[]): number[] {
	// Initialize 24 buckets with zeros
	const distribution: number[] = Array.from({ length: 24 }, () => 0);

	for (const record of records) {
		const hour = getHourFromTimestamp(record.viewedAt);
		const durationMinutes = (record.duration ?? 0) / 60;
		// Hour is guaranteed to be 0-23 from getUTCHours()
		const currentValue = distribution[hour] ?? 0;
		distribution[hour] = currentValue + durationMinutes;
	}

	return distribution;
}
