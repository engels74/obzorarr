import type { PlayHistoryRecord } from '$lib/server/stats/utils';

let idCounter = 1;

export function createPlayHistoryRecord(
	overrides: Partial<PlayHistoryRecord> = {}
): PlayHistoryRecord {
	return {
		id: idCounter++,
		historyKey: `history-${crypto.randomUUID()}`,
		ratingKey: `key-${Math.random().toString(36).slice(2)}`,
		title: 'Test Title',
		type: 'movie',
		viewedAt: Math.floor(Date.now() / 1000),
		duration: 7200,
		accountId: 1,
		librarySectionId: 1,
		releaseYear: 2024,
		thumb: null,
		grandparentTitle: null,
		grandparentRatingKey: null,
		grandparentThumb: null,
		parentTitle: null,
		genres: null,
		...overrides
	};
}

export function createMultipleRecords(
	count: number,
	baseOverrides: Partial<PlayHistoryRecord> = {}
): PlayHistoryRecord[] {
	return Array.from({ length: count }, (_, i) =>
		createPlayHistoryRecord({
			historyKey: `history-${i}`,
			ratingKey: `key-${i}`,
			title: `Title ${i}`,
			...baseOverrides
		})
	);
}

export function createTimestamp(year: number, month: number, day: number, hour = 12): number {
	return Math.floor(Date.UTC(year, month - 1, day, hour, 0, 0) / 1000);
}

export function createConsecutiveDayRecords(
	startYear: number,
	startMonth: number,
	startDay: number,
	count: number
): PlayHistoryRecord[] {
	return Array.from({ length: count }, (_, i) => {
		const date = new Date(Date.UTC(startYear, startMonth - 1, startDay + i, 12, 0, 0));
		return createPlayHistoryRecord({
			historyKey: `history-streak-${i}`,
			ratingKey: `key-streak-${i}`,
			viewedAt: Math.floor(date.getTime() / 1000)
		});
	});
}

export function createEpisodeRecord(overrides: Partial<PlayHistoryRecord> = {}): PlayHistoryRecord {
	return createPlayHistoryRecord({
		type: 'episode',
		grandparentTitle: 'Test Show',
		grandparentRatingKey: 'show-key-1',
		grandparentThumb: '/thumb/show.jpg',
		parentTitle: 'Season 1',
		...overrides
	});
}
