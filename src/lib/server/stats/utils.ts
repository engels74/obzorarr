/**
 * Statistics utility functions for Obzorarr
 *
 * Provides year boundary calculations and shared types for calculator modules.
 */

// Re-export PlayHistoryRecord from schema for calculator use
export type { PlayHistoryRecord } from '$lib/server/db/schema';

/**
 * Year filter for database queries
 */
export interface YearFilter {
	year: number;
	startTimestamp: number; // Jan 1 00:00:00 UTC (Unix seconds)
	endTimestamp: number; // Dec 31 23:59:59 UTC (Unix seconds)
}

/**
 * Get Unix timestamp for the start of a year (Jan 1 00:00:00 UTC)
 *
 * @param year - The year (e.g., 2024)
 * @returns Unix timestamp in seconds
 */
export function getYearStartTimestamp(year: number): number {
	return Math.floor(new Date(Date.UTC(year, 0, 1, 0, 0, 0)).getTime() / 1000);
}

/**
 * Get Unix timestamp for the end of a year (Dec 31 23:59:59 UTC)
 *
 * @param year - The year (e.g., 2024)
 * @returns Unix timestamp in seconds
 */
export function getYearEndTimestamp(year: number): number {
	return Math.floor(new Date(Date.UTC(year, 11, 31, 23, 59, 59)).getTime() / 1000);
}

/**
 * Create a year filter for database queries
 *
 * Property 8: Year Date Range Filtering
 * Only includes records where viewedAt falls between Jan 1 00:00:00 and Dec 31 23:59:59 of year Y.
 *
 * @param year - The year to filter for
 * @returns YearFilter with start and end timestamps
 */
export function createYearFilter(year: number): YearFilter {
	return {
		year,
		startTimestamp: getYearStartTimestamp(year),
		endTimestamp: getYearEndTimestamp(year)
	};
}

/**
 * Extract UTC month from a Unix timestamp
 *
 * @param viewedAt - Unix timestamp in seconds
 * @returns Month index (0-11, where 0 = January)
 */
export function getMonthFromTimestamp(viewedAt: number): number {
	return new Date(viewedAt * 1000).getUTCMonth();
}

/**
 * Extract UTC hour from a Unix timestamp
 *
 * @param viewedAt - Unix timestamp in seconds
 * @returns Hour (0-23)
 */
export function getHourFromTimestamp(viewedAt: number): number {
	return new Date(viewedAt * 1000).getUTCHours();
}
