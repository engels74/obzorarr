/**
 * First/Last Watch Finder
 *
 * Find the first and last content watched in a given year.
 */

import type { WatchRecord } from '../types';
import type { PlayHistoryRecord } from '../utils';

/**
 * Map a play history record to a WatchRecord
 */
function mapToWatchRecord(record: PlayHistoryRecord): WatchRecord {
	// Determine the display title based on content type
	// For episodes, use the show title (grandparentTitle) if available
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

/**
 * Find the first content watched in the given records
 *
 * @param records - Play history records for a year
 * @returns First watch record or null if no plays
 *
 * @example
 * ```ts
 * const records = [
 *   { viewedAt: 1704100000, title: 'Movie A', ... },
 *   { viewedAt: 1704067200, title: 'Movie B', ... }, // earliest
 *   { viewedAt: 1704200000, title: 'Movie C', ... },
 * ];
 * const first = findFirstWatch(records);
 * // first.title = 'Movie B'
 * ```
 */
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

/**
 * Find the last content watched in the given records
 *
 * @param records - Play history records for a year
 * @returns Last watch record or null if no plays
 *
 * @example
 * ```ts
 * const records = [
 *   { viewedAt: 1704100000, title: 'Movie A', ... },
 *   { viewedAt: 1704067200, title: 'Movie B', ... },
 *   { viewedAt: 1704200000, title: 'Movie C', ... }, // latest
 * ];
 * const last = findLastWatch(records);
 * // last.title = 'Movie C'
 * ```
 */
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
