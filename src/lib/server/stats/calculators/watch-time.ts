import type { PlayHistoryRecord } from '../utils';

export interface WatchTimeResult {
	totalWatchTimeMinutes: number;
	totalPlays: number;
}

export function calculateWatchTime(records: PlayHistoryRecord[]): WatchTimeResult {
	let totalSeconds = 0;

	for (const record of records) {
		const durationSeconds = record.duration ?? 0;
		totalSeconds += durationSeconds;
	}

	const totalWatchTimeMinutes = totalSeconds / 60;

	return {
		totalWatchTimeMinutes,
		totalPlays: records.length
	};
}
