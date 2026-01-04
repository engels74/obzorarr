import type { HourlyDistribution, MonthlyDistribution } from '../types';
import type { PlayHistoryRecord } from '../utils';
import { getHourFromTimestamp, getMonthFromTimestamp } from '../utils';

export function calculateMonthlyDistribution(records: PlayHistoryRecord[]): MonthlyDistribution {
	const minutes: number[] = Array.from({ length: 12 }, () => 0);
	const plays: number[] = Array.from({ length: 12 }, () => 0);

	for (const record of records) {
		const month = getMonthFromTimestamp(record.viewedAt);
		const durationMinutes = (record.duration ?? 0) / 60;
		minutes[month] = (minutes[month] ?? 0) + durationMinutes;
		plays[month] = (plays[month] ?? 0) + 1;
	}

	return { minutes, plays };
}

export function calculateHourlyDistribution(records: PlayHistoryRecord[]): HourlyDistribution {
	const minutes: number[] = Array.from({ length: 24 }, () => 0);
	const plays: number[] = Array.from({ length: 24 }, () => 0);

	for (const record of records) {
		const hour = getHourFromTimestamp(record.viewedAt);
		const durationMinutes = (record.duration ?? 0) / 60;
		minutes[hour] = (minutes[hour] ?? 0) + durationMinutes;
		plays[hour] = (plays[hour] ?? 0) + 1;
	}

	return { minutes, plays };
}
