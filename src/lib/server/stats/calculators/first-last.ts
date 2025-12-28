import type { WatchRecord } from '../types';
import type { PlayHistoryRecord } from '../utils';

function mapToWatchRecord(record: PlayHistoryRecord): WatchRecord {
	const displayTitle =
		record.type === 'episode' && record.grandparentTitle
			? `${record.grandparentTitle}: ${record.title}`
			: record.title;

	return {
		title: displayTitle,
		viewedAt: record.viewedAt,
		thumb: record.thumb,
		type: record.type as 'movie' | 'episode' | 'track'
	};
}

export function findFirstWatch(records: PlayHistoryRecord[]): WatchRecord | null {
	if (records.length === 0) {
		return null;
	}

	let earliest = records[0];
	if (!earliest) return null;

	for (const record of records) {
		if (record.viewedAt < earliest.viewedAt) {
			earliest = record;
		}
	}

	return mapToWatchRecord(earliest);
}

export function findLastWatch(records: PlayHistoryRecord[]): WatchRecord | null {
	if (records.length === 0) {
		return null;
	}

	let latest = records[0];
	if (!latest) return null;

	for (const record of records) {
		if (record.viewedAt > latest.viewedAt) {
			latest = record;
		}
	}

	return mapToWatchRecord(latest);
}
