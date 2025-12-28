import type { RankedItem } from '../types';
import type { PlayHistoryRecord } from '../utils';

export interface RankingOptions {
	limit?: number;
}

const DEFAULT_LIMIT = 10;

interface ItemAggregate {
	title: string;
	count: number;
	thumb: string | null;
}

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

function toRankedItems(aggregates: ItemAggregate[], limit: number): RankedItem[] {
	return aggregates.slice(0, limit).map((item, index) => ({
		rank: index + 1,
		title: item.title,
		count: item.count,
		thumb: item.thumb
	}));
}

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

/** Each play can contribute to multiple genres since genres are stored as JSON arrays. */
export function calculateTopGenres(
	records: PlayHistoryRecord[],
	options: RankingOptions = {}
): RankedItem[] {
	const { limit = DEFAULT_LIMIT } = options;

	// Aggregate genre counts
	const genreCounts = new Map<string, number>();

	for (const record of records) {
		if (!record.genres) continue;

		// Parse JSON array of genre names
		let genres: unknown;
		try {
			genres = JSON.parse(record.genres);
			if (!Array.isArray(genres)) continue;
		} catch {
			continue;
		}

		// Count each genre
		for (const genre of genres) {
			if (typeof genre === 'string' && genre.length > 0) {
				genreCounts.set(genre, (genreCounts.get(genre) ?? 0) + 1);
			}
		}
	}

	// Convert to array and sort by count desc, then title asc for tie-breaking
	const sorted = Array.from(genreCounts.entries())
		.map(([title, count]) => ({ title, count, thumb: null }))
		.sort((a, b) => {
			if (b.count !== a.count) {
				return b.count - a.count;
			}
			return a.title.localeCompare(b.title);
		});

	// Assign ranks and limit
	return sorted.slice(0, limit).map((item, index) => ({
		rank: index + 1,
		title: item.title,
		count: item.count,
		thumb: null // Genres don't have thumbnails
	}));
}
