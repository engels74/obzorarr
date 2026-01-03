import { describe, expect, it } from 'bun:test';
import {
	calculateWeekdayDistribution,
	calculateContentTypeBreakdown,
	calculateDecadeDistribution,
	calculateTopRewatches,
	calculateMarathonDay,
	calculateWatchStreak,
	calculateYearComparison,
	calculateSeriesProgress,
	seriesProgressToCompletion
} from '$lib/server/stats/calculators/new-slides';
import {
	createPlayHistoryRecord,
	createMultipleRecords,
	createTimestamp,
	createConsecutiveDayRecords,
	createEpisodeRecord
} from '../../helpers/factories';

describe('new-slides calculators', () => {
	describe('calculateWeekdayDistribution', () => {
		it('returns zero-filled arrays for empty input', () => {
			const result = calculateWeekdayDistribution([]);

			expect(result.minutes).toHaveLength(7);
			expect(result.plays).toHaveLength(7);
			expect(result.minutes.every((m) => m === 0)).toBe(true);
			expect(result.plays.every((p) => p === 0)).toBe(true);
		});

		it('accumulates minutes and plays by day of week', () => {
			const sunday = createTimestamp(2024, 1, 7, 12);
			const monday = createTimestamp(2024, 1, 8, 12);
			const records = [
				createPlayHistoryRecord({ viewedAt: sunday, duration: 3600 }),
				createPlayHistoryRecord({ viewedAt: sunday, duration: 1800 }),
				createPlayHistoryRecord({ viewedAt: monday, duration: 7200 })
			];

			const result = calculateWeekdayDistribution(records);

			expect(result.plays[0]).toBe(2);
			expect(result.plays[1]).toBe(1);
			expect(result.minutes[0]).toBe(90);
			expect(result.minutes[1]).toBe(120);
		});

		it('handles null duration by defaulting to 0', () => {
			const timestamp = createTimestamp(2024, 1, 7, 12);
			const records = [createPlayHistoryRecord({ viewedAt: timestamp, duration: null })];

			const result = calculateWeekdayDistribution(records);

			expect(result.plays[0]).toBe(1);
			expect(result.minutes[0]).toBe(0);
		});

		it('correctly maps all 7 days of the week', () => {
			const records = Array.from({ length: 7 }, (_, i) =>
				createPlayHistoryRecord({
					historyKey: `day-${i}`,
					viewedAt: createTimestamp(2024, 1, 7 + i, 12),
					duration: 60 * (i + 1)
				})
			);

			const result = calculateWeekdayDistribution(records);

			for (let i = 0; i < 7; i++) {
				expect(result.plays[i]).toBe(1);
				expect(result.minutes[i]).toBe(i + 1);
			}
		});
	});

	describe('calculateContentTypeBreakdown', () => {
		it('returns zero counts for empty input', () => {
			const result = calculateContentTypeBreakdown([]);

			expect(result.movies.count).toBe(0);
			expect(result.movies.minutes).toBe(0);
			expect(result.episodes.count).toBe(0);
			expect(result.episodes.minutes).toBe(0);
			expect(result.tracks.count).toBe(0);
			expect(result.tracks.minutes).toBe(0);
		});

		it('counts movies correctly', () => {
			const records = [
				createPlayHistoryRecord({ type: 'movie', duration: 7200 }),
				createPlayHistoryRecord({ type: 'movie', duration: 5400 })
			];

			const result = calculateContentTypeBreakdown(records);

			expect(result.movies.count).toBe(2);
			expect(result.movies.minutes).toBe(210);
		});

		it('counts episodes correctly', () => {
			const records = [
				createPlayHistoryRecord({ type: 'episode', duration: 2700 }),
				createPlayHistoryRecord({ type: 'episode', duration: 2700 }),
				createPlayHistoryRecord({ type: 'episode', duration: 2700 })
			];

			const result = calculateContentTypeBreakdown(records);

			expect(result.episodes.count).toBe(3);
			expect(result.episodes.minutes).toBe(135);
		});

		it('counts tracks correctly', () => {
			const records = [createPlayHistoryRecord({ type: 'track', duration: 180 })];

			const result = calculateContentTypeBreakdown(records);

			expect(result.tracks.count).toBe(1);
			expect(result.tracks.minutes).toBe(3);
		});

		it('handles mixed content types', () => {
			const records = [
				createPlayHistoryRecord({ type: 'movie', duration: 7200 }),
				createPlayHistoryRecord({ type: 'episode', duration: 2700 }),
				createPlayHistoryRecord({ type: 'track', duration: 180 })
			];

			const result = calculateContentTypeBreakdown(records);

			expect(result.movies.count).toBe(1);
			expect(result.episodes.count).toBe(1);
			expect(result.tracks.count).toBe(1);
		});

		it('handles null duration by defaulting to 0', () => {
			const records = [createPlayHistoryRecord({ type: 'movie', duration: null })];

			const result = calculateContentTypeBreakdown(records);

			expect(result.movies.count).toBe(1);
			expect(result.movies.minutes).toBe(0);
		});

		it('ignores unknown content types', () => {
			const records = [
				createPlayHistoryRecord({ type: 'movie', duration: 7200 }),
				createPlayHistoryRecord({ type: 'unknown' as 'movie', duration: 3600 })
			];

			const result = calculateContentTypeBreakdown(records);

			expect(result.movies.count).toBe(1);
			expect(result.movies.minutes).toBe(120);
			expect(result.episodes.count).toBe(0);
			expect(result.tracks.count).toBe(0);
		});
	});

	describe('calculateDecadeDistribution', () => {
		it('returns empty array for empty input', () => {
			const result = calculateDecadeDistribution([]);
			expect(result).toEqual([]);
		});

		it('groups content by decade', () => {
			const records = [
				createPlayHistoryRecord({ releaseYear: 1985, duration: 7200 }),
				createPlayHistoryRecord({ releaseYear: 1987, duration: 5400 }),
				createPlayHistoryRecord({ releaseYear: 1999, duration: 7200 })
			];

			const result = calculateDecadeDistribution(records);

			expect(result).toHaveLength(2);
			expect(result[0]).toEqual({ decade: '1980s', count: 2, minutes: 210 });
			expect(result[1]).toEqual({ decade: '1990s', count: 1, minutes: 120 });
		});

		it('skips records with null releaseYear', () => {
			const records = [
				createPlayHistoryRecord({ releaseYear: 2020, duration: 7200 }),
				createPlayHistoryRecord({ releaseYear: null, duration: 3600 })
			];

			const result = calculateDecadeDistribution(records);

			expect(result).toHaveLength(1);
			expect(result[0]?.count).toBe(1);
		});

		it('handles decade boundary correctly (2000 is 2000s)', () => {
			const records = [
				createPlayHistoryRecord({ releaseYear: 1999, duration: 3600 }),
				createPlayHistoryRecord({ releaseYear: 2000, duration: 3600 })
			];

			const result = calculateDecadeDistribution(records);

			expect(result).toHaveLength(2);
			expect(result.find((d) => d.decade === '1990s')?.count).toBe(1);
			expect(result.find((d) => d.decade === '2000s')?.count).toBe(1);
		});

		it('sorts decades chronologically', () => {
			const records = [
				createPlayHistoryRecord({ releaseYear: 2010, duration: 3600 }),
				createPlayHistoryRecord({ releaseYear: 1970, duration: 3600 }),
				createPlayHistoryRecord({ releaseYear: 1990, duration: 3600 })
			];

			const result = calculateDecadeDistribution(records);

			expect(result[0]?.decade).toBe('1970s');
			expect(result[1]?.decade).toBe('1990s');
			expect(result[2]?.decade).toBe('2010s');
		});
	});

	describe('calculateTopRewatches', () => {
		it('returns empty array for empty input', () => {
			const result = calculateTopRewatches([]);
			expect(result).toEqual([]);
		});

		it('returns empty array when no item is watched twice', () => {
			const records = [
				createPlayHistoryRecord({ ratingKey: 'key1' }),
				createPlayHistoryRecord({ ratingKey: 'key2' }),
				createPlayHistoryRecord({ ratingKey: 'key3' })
			];

			const result = calculateTopRewatches(records);
			expect(result).toEqual([]);
		});

		it('includes items watched 2+ times', () => {
			const records = [
				createPlayHistoryRecord({ ratingKey: 'key1', title: 'Movie A' }),
				createPlayHistoryRecord({ ratingKey: 'key1', title: 'Movie A' }),
				createPlayHistoryRecord({ ratingKey: 'key2', title: 'Movie B' })
			];

			const result = calculateTopRewatches(records);

			expect(result).toHaveLength(1);
			expect(result[0]?.title).toBe('Movie A');
			expect(result[0]?.rewatchCount).toBe(2);
		});

		it('sorts by rewatch count descending', () => {
			const records = [
				...Array(3)
					.fill(null)
					.map(() => createPlayHistoryRecord({ ratingKey: 'key1', title: 'Movie A' })),
				...Array(5)
					.fill(null)
					.map(() => createPlayHistoryRecord({ ratingKey: 'key2', title: 'Movie B' })),
				...Array(2)
					.fill(null)
					.map(() => createPlayHistoryRecord({ ratingKey: 'key3', title: 'Movie C' }))
			];

			const result = calculateTopRewatches(records);

			expect(result[0]?.title).toBe('Movie B');
			expect(result[0]?.rewatchCount).toBe(5);
			expect(result[1]?.title).toBe('Movie A');
			expect(result[1]?.rewatchCount).toBe(3);
			expect(result[2]?.title).toBe('Movie C');
			expect(result[2]?.rewatchCount).toBe(2);
		});

		it('respects custom limit', () => {
			const records = [
				...Array(2)
					.fill(null)
					.map(() => createPlayHistoryRecord({ ratingKey: 'key1', title: 'Movie A' })),
				...Array(2)
					.fill(null)
					.map(() => createPlayHistoryRecord({ ratingKey: 'key2', title: 'Movie B' })),
				...Array(2)
					.fill(null)
					.map(() => createPlayHistoryRecord({ ratingKey: 'key3', title: 'Movie C' }))
			];

			const result = calculateTopRewatches(records, 2);
			expect(result).toHaveLength(2);
		});

		it('preserves null thumb values', () => {
			const records = [
				createPlayHistoryRecord({ ratingKey: 'key1', title: 'Movie A', thumb: null }),
				createPlayHistoryRecord({ ratingKey: 'key1', title: 'Movie A', thumb: null })
			];

			const result = calculateTopRewatches(records);
			expect(result[0]?.thumb).toBeNull();
		});
	});

	describe('calculateMarathonDay', () => {
		it('returns null for empty input', () => {
			const result = calculateMarathonDay([]);
			expect(result).toBeNull();
		});

		it('identifies the day with most watch time', () => {
			const day1 = createTimestamp(2024, 3, 15, 10);
			const day2 = createTimestamp(2024, 3, 16, 10);
			const records = [
				createPlayHistoryRecord({ viewedAt: day1, duration: 3600, title: 'Movie 1' }),
				createPlayHistoryRecord({ viewedAt: day2, duration: 7200, title: 'Movie 2' }),
				createPlayHistoryRecord({ viewedAt: day2, duration: 3600, title: 'Movie 3' })
			];

			const result = calculateMarathonDay(records);

			expect(result?.date).toBe('2024-03-16');
			expect(result?.minutes).toBe(180);
			expect(result?.plays).toBe(2);
		});

		it('returns correct item list limited to 10', () => {
			const timestamp = createTimestamp(2024, 3, 15, 10);
			const records = Array.from({ length: 15 }, (_, i) =>
				createPlayHistoryRecord({
					historyKey: `marathon-${i}`,
					viewedAt: timestamp + i * 60,
					duration: 600,
					title: `Item ${i}`
				})
			);

			const result = calculateMarathonDay(records);

			expect(result?.items).toHaveLength(10);
			expect(result?.plays).toBe(15);
		});

		it('handles null duration by defaulting to 0', () => {
			const timestamp = createTimestamp(2024, 3, 15, 10);
			const records = [
				createPlayHistoryRecord({ viewedAt: timestamp, duration: null, title: 'No Duration' })
			];

			const result = calculateMarathonDay(records);

			expect(result?.minutes).toBe(0);
			expect(result?.plays).toBe(1);
		});

		it('uses first day when multiple days have same watch time', () => {
			const day1 = createTimestamp(2024, 3, 15, 10);
			const day2 = createTimestamp(2024, 3, 16, 10);
			const records = [
				createPlayHistoryRecord({ viewedAt: day1, duration: 3600, title: 'Day 1 Movie' }),
				createPlayHistoryRecord({ viewedAt: day2, duration: 3600, title: 'Day 2 Movie' })
			];

			const result = calculateMarathonDay(records);

			expect(result?.date).toBe('2024-03-15');
		});
	});

	describe('calculateWatchStreak', () => {
		it('returns null for empty input', () => {
			const result = calculateWatchStreak([]);
			expect(result).toBeNull();
		});

		it('returns streak of 1 for single day', () => {
			const timestamp = createTimestamp(2024, 3, 15, 12);
			const records = [createPlayHistoryRecord({ viewedAt: timestamp })];

			const result = calculateWatchStreak(records);

			expect(result?.longestStreak).toBe(1);
			expect(result?.startDate).toBe('2024-03-15');
			expect(result?.endDate).toBe('2024-03-15');
		});

		it('calculates consecutive day streak correctly', () => {
			const records = createConsecutiveDayRecords(2024, 3, 15, 5);

			const result = calculateWatchStreak(records);

			expect(result?.longestStreak).toBe(5);
			expect(result?.startDate).toBe('2024-03-15');
			expect(result?.endDate).toBe('2024-03-19');
		});

		it('finds longest streak when multiple streaks exist', () => {
			const streak1 = createConsecutiveDayRecords(2024, 1, 1, 3);
			const streak2 = createConsecutiveDayRecords(2024, 2, 10, 7);
			const streak3 = createConsecutiveDayRecords(2024, 3, 1, 2);
			const records = [...streak1, ...streak2, ...streak3];

			const result = calculateWatchStreak(records);

			expect(result?.longestStreak).toBe(7);
			expect(result?.startDate).toBe('2024-02-10');
			expect(result?.endDate).toBe('2024-02-16');
		});

		it('handles multiple watches on same day as single day', () => {
			const timestamp = createTimestamp(2024, 3, 15, 10);
			const records = [
				createPlayHistoryRecord({ historyKey: 'a', viewedAt: timestamp }),
				createPlayHistoryRecord({ historyKey: 'b', viewedAt: timestamp + 3600 }),
				createPlayHistoryRecord({ historyKey: 'c', viewedAt: timestamp + 7200 })
			];

			const result = calculateWatchStreak(records);

			expect(result?.longestStreak).toBe(1);
		});

		it('breaks streak on gap day', () => {
			const day1 = createTimestamp(2024, 3, 15, 12);
			const day2 = createTimestamp(2024, 3, 16, 12);
			const day4 = createTimestamp(2024, 3, 18, 12);
			const records = [
				createPlayHistoryRecord({ historyKey: 'a', viewedAt: day1 }),
				createPlayHistoryRecord({ historyKey: 'b', viewedAt: day2 }),
				createPlayHistoryRecord({ historyKey: 'c', viewedAt: day4 })
			];

			const result = calculateWatchStreak(records);

			expect(result?.longestStreak).toBe(2);
			expect(result?.startDate).toBe('2024-03-15');
			expect(result?.endDate).toBe('2024-03-16');
		});
	});

	describe('calculateYearComparison', () => {
		it('returns null when both years have zero minutes', () => {
			const result = calculateYearComparison(0, 0);
			expect(result).toBeNull();
		});

		it('returns 100% change when previous year is zero', () => {
			const result = calculateYearComparison(1000, 0);

			expect(result?.thisYear).toBe(1000);
			expect(result?.lastYear).toBe(0);
			expect(result?.percentChange).toBe(100);
		});

		it('calculates positive percent change correctly', () => {
			const result = calculateYearComparison(1500, 1000);

			expect(result?.percentChange).toBe(50);
		});

		it('calculates negative percent change correctly', () => {
			const result = calculateYearComparison(500, 1000);

			expect(result?.percentChange).toBe(-50);
		});

		it('rounds to one decimal place', () => {
			const result = calculateYearComparison(1333, 1000);

			expect(result?.percentChange).toBe(33.3);
		});

		it('handles equal years as 0% change', () => {
			const result = calculateYearComparison(1000, 1000);

			expect(result?.percentChange).toBe(0);
		});
	});

	describe('calculateSeriesProgress', () => {
		it('returns empty map for empty input', () => {
			const result = calculateSeriesProgress([]);
			expect(result.size).toBe(0);
		});

		it('ignores non-episode records', () => {
			const records = [
				createPlayHistoryRecord({ type: 'movie' }),
				createPlayHistoryRecord({ type: 'track' })
			];

			const result = calculateSeriesProgress(records);
			expect(result.size).toBe(0);
		});

		it('groups episodes by grandparentRatingKey', () => {
			const records = [
				createEpisodeRecord({
					historyKey: 'ep1',
					ratingKey: 'ep-1',
					grandparentRatingKey: 'show-1',
					grandparentTitle: 'Show A'
				}),
				createEpisodeRecord({
					historyKey: 'ep2',
					ratingKey: 'ep-2',
					grandparentRatingKey: 'show-1',
					grandparentTitle: 'Show A'
				}),
				createEpisodeRecord({
					historyKey: 'ep3',
					ratingKey: 'ep-3',
					grandparentRatingKey: 'show-2',
					grandparentTitle: 'Show B'
				})
			];

			const result = calculateSeriesProgress(records);

			expect(result.size).toBe(2);
			expect(result.get('show-1')?.watchedEpisodes).toBe(2);
			expect(result.get('show-2')?.watchedEpisodes).toBe(1);
		});

		it('counts unique episodes only (no rewatch counting)', () => {
			const records = [
				createEpisodeRecord({
					historyKey: 'watch1',
					ratingKey: 'ep-1',
					grandparentRatingKey: 'show-1'
				}),
				createEpisodeRecord({
					historyKey: 'watch2',
					ratingKey: 'ep-1',
					grandparentRatingKey: 'show-1'
				}),
				createEpisodeRecord({
					historyKey: 'watch3',
					ratingKey: 'ep-2',
					grandparentRatingKey: 'show-1'
				})
			];

			const result = calculateSeriesProgress(records);

			expect(result.get('show-1')?.watchedEpisodes).toBe(2);
			expect(result.get('show-1')?.uniqueEpisodeKeys.size).toBe(2);
		});

		it('skips episodes without grandparent key', () => {
			const records = [
				createEpisodeRecord({
					historyKey: 'ep1',
					ratingKey: 'ep-1',
					grandparentRatingKey: null,
					grandparentTitle: null
				})
			];

			const result = calculateSeriesProgress(records);
			expect(result.size).toBe(0);
		});

		it('uses grandparentTitle as fallback key', () => {
			const records = [
				createPlayHistoryRecord({
					type: 'episode',
					ratingKey: 'ep-1',
					grandparentRatingKey: null,
					grandparentTitle: 'Show From Title'
				})
			];

			const result = calculateSeriesProgress(records);

			expect(result.size).toBe(1);
			expect(result.get('Show From Title')?.show).toBe('Show From Title');
		});
	});

	describe('seriesProgressToCompletion', () => {
		it('returns empty array for empty map', () => {
			const result = seriesProgressToCompletion(new Map(), new Map());
			expect(result).toEqual([]);
		});

		it('calculates completion percentage from totalEpisodesMap', () => {
			const seriesMap = new Map([
				[
					'show-1',
					{
						show: 'Show A',
						thumb: null,
						grandparentRatingKey: 'show-1',
						watchedEpisodes: 5,
						uniqueEpisodeKeys: new Set(['ep1', 'ep2', 'ep3', 'ep4', 'ep5'])
					}
				]
			]);
			const totalEpisodesMap = new Map([['show-1', 10]]);

			const result = seriesProgressToCompletion(seriesMap, totalEpisodesMap);

			expect(result[0]?.percentComplete).toBe(50);
			expect(result[0]?.totalEpisodes).toBe(10);
		});

		it('uses watched count as fallback when no total available', () => {
			const seriesMap = new Map([
				[
					'show-1',
					{
						show: 'Show A',
						thumb: null,
						grandparentRatingKey: 'show-1',
						watchedEpisodes: 8,
						uniqueEpisodeKeys: new Set(['e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7', 'e8'])
					}
				]
			]);

			const result = seriesProgressToCompletion(seriesMap, new Map());

			expect(result[0]?.totalEpisodes).toBe(8);
			expect(result[0]?.percentComplete).toBe(100);
		});

		it('clamps percentage to 100 max', () => {
			const seriesMap = new Map([
				[
					'show-1',
					{
						show: 'Show A',
						thumb: null,
						grandparentRatingKey: 'show-1',
						watchedEpisodes: 15,
						uniqueEpisodeKeys: new Set(Array.from({ length: 15 }, (_, i) => `ep${i}`))
					}
				]
			]);
			const totalEpisodesMap = new Map([['show-1', 10]]);

			const result = seriesProgressToCompletion(seriesMap, totalEpisodesMap);

			expect(result[0]?.percentComplete).toBe(100);
		});

		it('sorts by watched episodes descending', () => {
			const seriesMap = new Map([
				[
					'show-1',
					{
						show: 'Show A',
						thumb: null,
						grandparentRatingKey: 'show-1',
						watchedEpisodes: 5,
						uniqueEpisodeKeys: new Set(['e1', 'e2', 'e3', 'e4', 'e5'])
					}
				],
				[
					'show-2',
					{
						show: 'Show B',
						thumb: null,
						grandparentRatingKey: 'show-2',
						watchedEpisodes: 10,
						uniqueEpisodeKeys: new Set(Array.from({ length: 10 }, (_, i) => `ep${i}`))
					}
				]
			]);

			const result = seriesProgressToCompletion(seriesMap, new Map());

			expect(result[0]?.show).toBe('Show B');
			expect(result[1]?.show).toBe('Show A');
		});

		it('respects custom limit', () => {
			const seriesMap = new Map(
				Array.from({ length: 15 }, (_, i) => [
					`show-${i}`,
					{
						show: `Show ${i}`,
						thumb: null,
						grandparentRatingKey: `show-${i}`,
						watchedEpisodes: i + 1,
						uniqueEpisodeKeys: new Set([`ep${i}`])
					}
				])
			);

			const result = seriesProgressToCompletion(seriesMap, new Map(), 5);

			expect(result).toHaveLength(5);
		});

		it('handles zero total episodes', () => {
			const seriesMap = new Map([
				[
					'show-1',
					{
						show: 'Show A',
						thumb: null,
						grandparentRatingKey: 'show-1',
						watchedEpisodes: 0,
						uniqueEpisodeKeys: new Set<string>()
					}
				]
			]);
			const totalEpisodesMap = new Map([['show-1', 0]]);

			const result = seriesProgressToCompletion(seriesMap, totalEpisodesMap);

			expect(result[0]?.percentComplete).toBe(0);
		});
	});
});
