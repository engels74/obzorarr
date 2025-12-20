/**
 * Watch Time Calculator
 *
 * Task 7.1: Implement watch time calculator
 * Requirements: 4.2
 *
 * Property 9: Watch Time Aggregation
 * For any set of play history records with durations, the calculated total
 * watch time SHALL equal the sum of all individual durations.
 */

import type { PlayHistoryRecord } from '../utils';

/**
 * Result of watch time calculation
 */
export interface WatchTimeResult {
	/** Total watch time in minutes */
	totalWatchTimeMinutes: number;
	/** Total number of plays */
	totalPlays: number;
}

/**
 * Calculate total watch time and play count from play history records
 *
 * @param records - Play history records (already filtered by year/user)
 * @returns Total watch time in minutes and play count
 *
 * @example
 * ```ts
 * const records = [
 *   { duration: 3600, ... }, // 1 hour
 *   { duration: 1800, ... }, // 30 minutes
 *   { duration: null, ... }, // no duration (counts as play, 0 time)
 * ];
 * const result = calculateWatchTime(records);
 * // result.totalWatchTimeMinutes = 90
 * // result.totalPlays = 3
 * ```
 */
export function calculateWatchTime(records: PlayHistoryRecord[]): WatchTimeResult {
	let totalSeconds = 0;

	for (const record of records) {
		// Handle null durations as 0 (still counts as a play)
		const durationSeconds = record.duration ?? 0;
		totalSeconds += durationSeconds;
	}

	// Convert seconds to minutes
	const totalWatchTimeMinutes = totalSeconds / 60;

	return {
		totalWatchTimeMinutes,
		totalPlays: records.length
	};
}
