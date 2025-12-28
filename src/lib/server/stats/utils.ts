export type { PlayHistoryRecord } from '$lib/server/db/schema';

export interface YearFilter {
	year: number;
	startTimestamp: number; // Jan 1 00:00:00 UTC (Unix seconds)
	endTimestamp: number;
}

export function getYearStartTimestamp(year: number): number {
	return Math.floor(new Date(Date.UTC(year, 0, 1, 0, 0, 0)).getTime() / 1000);
}

export function getYearEndTimestamp(year: number): number {
	return Math.floor(new Date(Date.UTC(year, 11, 31, 23, 59, 59)).getTime() / 1000);
}

export function createYearFilter(year: number): YearFilter {
	return {
		year,
		startTimestamp: getYearStartTimestamp(year),
		endTimestamp: getYearEndTimestamp(year)
	};
}

export function getMonthFromTimestamp(viewedAt: number): number {
	return new Date(viewedAt * 1000).getUTCMonth();
}

export function getHourFromTimestamp(viewedAt: number): number {
	return new Date(viewedAt * 1000).getUTCHours();
}
