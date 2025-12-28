import { getMonthFromTimestamp, getHourFromTimestamp } from '../utils';
import type { PlayHistoryRecord } from '../utils';
import type { MonthlyDistribution, HourlyDistribution } from '../types';

/** Returns minutes and plays arrays with 12 elements (index 0 = January). */
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

/** Returns minutes and plays arrays with 24 elements (index 0 = midnight UTC). */
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
