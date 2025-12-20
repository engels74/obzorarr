/**
 * Ranking Calculator
 *
 * Task 7.2: Implement ranking calculator
 * Requirements: 4.3, 4.4, 4.5
 *
 * Property 10: Ranking Correctness
 * For any set of items with play counts, the top N ranking SHALL be ordered
 * by count descending, with ties broken consistently (alphabetically by title).
 */

import type { RankedItem } from '../types';
import type { PlayHistoryRecord } from '../utils';

/**
 * Options for ranking calculations
 */
export interface RankingOptions {
	/** Maximum number of items to return (default: 10) */
	limit?: number;
}

/** Default limit for top items */
const DEFAULT_LIMIT = 10;

/**
 * Internal structure for aggregating play counts
 */
interface ItemAggregate {
	title: string;
	count: number;
	thumb: string | null;
}

/**
 * Group records by a key and count plays
 *
 * @param records - Play history records
 * @param getKey - Function to extract grouping key from record
 * @param getThumb - Function to extract thumb URL from record
 * @returns Array of aggregated items sorted by count desc, then title asc
 */
function aggregateAndRank(
	records: PlayHistoryRecord[],
	getKey: (record: PlayHistoryRecord) => string | null,
	getThumb: (record: PlayHistoryRecord) => string | null
): ItemAggregate[] {
	const aggregates = new Map<string, ItemAggregate>();

	for (const record of records) {
		const key = getKey(record);
		if (!key) continue;

		const existing = aggregates.get(key);
		if (existing) {
			existing.count += 1;
			// Keep the first thumb we encounter (or update if we didn't have one)
			if (!existing.thumb && record.thumb) {
				existing.thumb = record.thumb;
			}
		} else {
			aggregates.set(key, {
				title: key,
				count: 1,
				thumb: getThumb(record)
			});
		}
	}

	// Sort by count descending, then title ascending for tie-breaking
	return Array.from(aggregates.values()).sort((a, b) => {
		if (b.count !== a.count) {
			return b.count - a.count;
		}
		return a.title.localeCompare(b.title);
	});
}

/**
 * Convert aggregates to ranked items with ranks assigned
 *
 * @param aggregates - Sorted array of aggregates
 * @param limit - Maximum number to return
 * @returns Array of RankedItems with rank assigned
 */
function toRankedItems(aggregates: ItemAggregate[], limit: number): RankedItem[] {
	return aggregates.slice(0, limit).map((item, index) => ({
		rank: index + 1,
		title: item.title,
		count: item.count,
		thumb: item.thumb
	}));
}

/**
 * Calculate top movies by play count
 *
 * Groups movies by title and counts unique plays.
 *
 * @param records - Play history records (should be pre-filtered to type='movie')
 * @param options - Ranking options
 * @returns Top movies ranked by play count
 *
 * @example
 * ```ts
 * const movies = records.filter(r => r.type === 'movie');
 * const topMovies = calculateTopMovies(movies);
 * // [{ rank: 1, title: 'Avatar', count: 5, thumb: '...' }, ...]
 * ```
 */
export function calculateTopMovies(
	records: PlayHistoryRecord[],
	options: RankingOptions = {}
): RankedItem[] {
	const { limit = DEFAULT_LIMIT } = options;

	// Filter to movies only (in case caller didn't pre-filter)
	const movies = records.filter((r) => r.type === 'movie');

	const aggregates = aggregateAndRank(
		movies,
		(record) => record.title,
		(record) => record.thumb
	);

	return toRankedItems(aggregates, limit);
}

/**
 * Calculate top shows by episode play count
 *
 * Groups episodes by show name (grandparentTitle) and counts total episode plays.
 *
 * @param records - Play history records (should be pre-filtered to type='episode')
 * @param options - Ranking options
 * @returns Top shows ranked by total episode plays
 *
 * @example
 * ```ts
 * const episodes = records.filter(r => r.type === 'episode');
 * const topShows = calculateTopShows(episodes);
 * // [{ rank: 1, title: 'Breaking Bad', count: 42, thumb: '...' }, ...]
 * ```
 */
export function calculateTopShows(
	records: PlayHistoryRecord[],
	options: RankingOptions = {}
): RankedItem[] {
	const { limit = DEFAULT_LIMIT } = options;

	// Filter to episodes only (in case caller didn't pre-filter)
	const episodes = records.filter((r) => r.type === 'episode');

	const aggregates = aggregateAndRank(
		episodes,
		// Use grandparentTitle (show name) for grouping
		// Fall back to title if grandparentTitle is not available
		(record) => record.grandparentTitle ?? record.title,
		(record) => record.thumb
	);

	return toRankedItems(aggregates, limit);
}

/**
 * Calculate top genres by play count
 *
 * NOTE: Genre data is not currently stored in play_history.
 * This function returns an empty array until genre metadata enrichment is implemented.
 *
 * Future implementation options:
 * 1. Add genre column to play_history during sync
 * 2. Create a separate genres lookup table
 * 3. Fetch genres from Plex metadata API on-demand
 *
 * @param _records - Play history records (unused for now)
 * @param _options - Ranking options (unused for now)
 * @returns Empty array (genres not yet implemented)
 */
export function calculateTopGenres(
	_records: PlayHistoryRecord[],
	_options: RankingOptions = {}
): RankedItem[] {
	// Genre data is not available in current schema
	// Return empty array for MVP - can be implemented when genre data is added
	return [];
}
