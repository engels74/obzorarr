import { describe, expect, it } from 'bun:test';

import {
	BINGE_GAP_THRESHOLD_SECONDS,
	calculateHourlyDistribution,
	calculateMonthlyDistribution,
	calculatePercentileRank,
	calculateTopGenres,
	calculateTopMovies,
	calculateTopShows,
	calculateWatchTime,
	detectAllBingeSessions,
	detectLongestBinge,
	findFirstWatch,
	findLastWatch
} from '$lib/server/stats/calculators';

import {
	getHourFromTimestamp,
	getMonthFromTimestamp,
	getYearEndTimestamp,
	getYearStartTimestamp
} from '$lib/server/stats/utils';

import { createPlayHistoryRecord } from '../../helpers/factories';

const createRecord = createPlayHistoryRecord;

describe('Utils', () => {
	describe('getYearStartTimestamp', () => {
		it('returns Jan 1 00:00:00 UTC for 2024', () => {
			const timestamp = getYearStartTimestamp(2024);
			const date = new Date(timestamp * 1000);

			expect(date.getUTCFullYear()).toBe(2024);
			expect(date.getUTCMonth()).toBe(0);
			expect(date.getUTCDate()).toBe(1);
			expect(date.getUTCHours()).toBe(0);
			expect(date.getUTCMinutes()).toBe(0);
			expect(date.getUTCSeconds()).toBe(0);
		});
	});

	describe('getYearEndTimestamp', () => {
		it('returns Dec 31 23:59:59 UTC for 2024', () => {
			const timestamp = getYearEndTimestamp(2024);
			const date = new Date(timestamp * 1000);

			expect(date.getUTCFullYear()).toBe(2024);
			expect(date.getUTCMonth()).toBe(11);
			expect(date.getUTCDate()).toBe(31);
			expect(date.getUTCHours()).toBe(23);
			expect(date.getUTCMinutes()).toBe(59);
			expect(date.getUTCSeconds()).toBe(59);
		});
	});

	describe('getMonthFromTimestamp', () => {
		it('returns correct month (0-indexed)', () => {
			expect(getMonthFromTimestamp(1704067200)).toBe(0);
			expect(getMonthFromTimestamp(1719792000)).toBe(6);
			expect(getMonthFromTimestamp(1735603199)).toBe(11);
		});
	});

	describe('getHourFromTimestamp', () => {
		it('returns correct hour (0-23)', () => {
			expect(getHourFromTimestamp(1704067200)).toBe(0);
			expect(getHourFromTimestamp(1704110400)).toBe(12);
			expect(getHourFromTimestamp(1704150000)).toBe(23);
		});
	});
});

describe('Watch Time Calculator', () => {
	it('calculates total watch time correctly', () => {
		const records = [
			createRecord({ duration: 3600 }),
			createRecord({ id: 2, historyKey: 'key-2', duration: 1800 }),
			createRecord({ id: 3, historyKey: 'key-3', duration: 900 })
		];

		const result = calculateWatchTime(records);

		expect(result.totalWatchTimeMinutes).toBe(105);
		expect(result.totalPlays).toBe(3);
	});

	it('handles null durations', () => {
		const records = [
			createRecord({ duration: 3600 }),
			createRecord({ id: 2, historyKey: 'key-2', duration: null })
		];

		const result = calculateWatchTime(records);

		expect(result.totalWatchTimeMinutes).toBe(60);
		expect(result.totalPlays).toBe(2);
	});

	it('handles empty array', () => {
		const result = calculateWatchTime([]);

		expect(result.totalWatchTimeMinutes).toBe(0);
		expect(result.totalPlays).toBe(0);
	});
});

describe('Ranking Calculator', () => {
	describe('calculateTopMovies', () => {
		it('ranks movies by play count', () => {
			const records = [
				createRecord({ title: 'Movie A' }),
				createRecord({ id: 2, historyKey: 'key-2', title: 'Movie A' }),
				createRecord({ id: 3, historyKey: 'key-3', title: 'Movie B' })
			];

			const result = calculateTopMovies(records);

			expect(result.length).toBe(2);
			expect(result[0]?.title).toBe('Movie A');
			expect(result[0]?.count).toBe(2);
			expect(result[0]?.rank).toBe(1);
			expect(result[1]?.title).toBe('Movie B');
			expect(result[1]?.count).toBe(1);
			expect(result[1]?.rank).toBe(2);
		});

		it('respects limit option', () => {
			const records = [
				createRecord({ title: 'Movie A' }),
				createRecord({ id: 2, historyKey: 'key-2', title: 'Movie B' }),
				createRecord({ id: 3, historyKey: 'key-3', title: 'Movie C' })
			];

			const result = calculateTopMovies(records, { limit: 2 });

			expect(result.length).toBe(2);
		});

		it('breaks ties alphabetically', () => {
			const records = [
				createRecord({ title: 'Zebra' }),
				createRecord({ id: 2, historyKey: 'key-2', title: 'Apple' })
			];

			const result = calculateTopMovies(records);

			expect(result[0]?.title).toBe('Apple');
			expect(result[1]?.title).toBe('Zebra');
		});

		it('filters out non-movie records', () => {
			const records = [
				createRecord({ title: 'Movie', type: 'movie' }),
				createRecord({ id: 2, historyKey: 'key-2', title: 'Episode', type: 'episode' })
			];

			const result = calculateTopMovies(records);

			expect(result.length).toBe(1);
			expect(result[0]?.title).toBe('Movie');
		});
	});

	describe('calculateTopShows', () => {
		it('groups episodes by show name', () => {
			const records = [
				createRecord({ type: 'episode', title: 'S01E01', grandparentTitle: 'Show A' }),
				createRecord({
					id: 2,
					historyKey: 'key-2',
					type: 'episode',
					title: 'S01E02',
					grandparentTitle: 'Show A'
				}),
				createRecord({
					id: 3,
					historyKey: 'key-3',
					type: 'episode',
					title: 'S01E01',
					grandparentTitle: 'Show B'
				})
			];

			const result = calculateTopShows(records);

			expect(result.length).toBe(2);
			expect(result[0]?.title).toBe('Show A');
			expect(result[0]?.count).toBe(2);
			expect(result[1]?.title).toBe('Show B');
			expect(result[1]?.count).toBe(1);
		});

		it('falls back to title if grandparentTitle is null', () => {
			const records = [
				createRecord({ type: 'episode', title: 'Episode Title', grandparentTitle: null })
			];

			const result = calculateTopShows(records);

			expect(result[0]?.title).toBe('Episode Title');
		});
	});

	describe('calculateTopGenres', () => {
		it('returns empty array when records have no genres', () => {
			const records = [createRecord({ genres: null })];
			const result = calculateTopGenres(records);
			expect(result).toEqual([]);
		});

		it('parses and counts genres from JSON array', () => {
			const records = [
				createRecord({ genres: '["Action","Drama"]' }),
				createRecord({ id: 2, historyKey: 'key-2', genres: '["Action","Comedy"]' }),
				createRecord({ id: 3, historyKey: 'key-3', genres: '["Drama"]' })
			];

			const result = calculateTopGenres(records);

			expect(result.length).toBe(3);
			expect(result[0]?.title).toBe('Action');
			expect(result[0]?.count).toBe(2);
			expect(result[0]?.rank).toBe(1);
			expect(result[1]?.title).toBe('Drama');
			expect(result[1]?.count).toBe(2);
			expect(result[1]?.rank).toBe(2);
			expect(result[2]?.title).toBe('Comedy');
			expect(result[2]?.count).toBe(1);
			expect(result[2]?.rank).toBe(3);
		});

		it('skips records with invalid JSON genres', () => {
			const records = [
				createRecord({ genres: '["Action"]' }),
				createRecord({ id: 2, historyKey: 'key-2', genres: 'not-valid-json' }),
				createRecord({ id: 3, historyKey: 'key-3', genres: '["Drama"]' })
			];

			const result = calculateTopGenres(records);

			expect(result.length).toBe(2);
			expect(result[0]?.title).toBe('Action');
			expect(result[1]?.title).toBe('Drama');
		});

		it('skips records where genres JSON is not an array', () => {
			const records = [
				createRecord({ genres: '["Action"]' }),
				createRecord({ id: 2, historyKey: 'key-2', genres: '"just a string"' }),
				createRecord({ id: 3, historyKey: 'key-3', genres: '{"genre": "Drama"}' }),
				createRecord({ id: 4, historyKey: 'key-4', genres: '123' })
			];

			const result = calculateTopGenres(records);

			expect(result.length).toBe(1);
			expect(result[0]?.title).toBe('Action');
		});

		it('filters out non-string genres in array', () => {
			const records = [createRecord({ genres: '[1, "Action", null, true, "Drama"]' })];

			const result = calculateTopGenres(records);

			expect(result.length).toBe(2);
			expect(result[0]?.title).toBe('Action');
			expect(result[1]?.title).toBe('Drama');
		});

		it('filters out empty string genres', () => {
			const records = [createRecord({ genres: '["Action", "", "Drama", ""]' })];

			const result = calculateTopGenres(records);

			expect(result.length).toBe(2);
			expect(result[0]?.title).toBe('Action');
			expect(result[1]?.title).toBe('Drama');
		});

		it('breaks ties alphabetically', () => {
			const records = [
				createRecord({ genres: '["Zebra"]' }),
				createRecord({ id: 2, historyKey: 'key-2', genres: '["Apple"]' })
			];

			const result = calculateTopGenres(records);

			expect(result[0]?.title).toBe('Apple');
			expect(result[1]?.title).toBe('Zebra');
		});

		it('respects limit option', () => {
			const records = [createRecord({ genres: '["Action","Drama","Comedy","Horror","SciFi"]' })];

			const result = calculateTopGenres(records, { limit: 3 });

			expect(result.length).toBe(3);
		});

		it('handles empty genres array', () => {
			const records = [createRecord({ genres: '[]' })];
			const result = calculateTopGenres(records);
			expect(result).toEqual([]);
		});

		it('sets thumb to null for all genre results', () => {
			const records = [createRecord({ genres: '["Action"]', thumb: '/some/thumb.jpg' })];

			const result = calculateTopGenres(records);

			expect(result[0]?.thumb).toBeNull();
		});

		it('handles empty records array', () => {
			const result = calculateTopGenres([]);
			expect(result).toEqual([]);
		});

		// ISSUE-010 — Plex enrichment can persist the literal strings
		// "undefined"/"null" (or whitespace) into the nullable genres column.
		// Those must be skipped without throwing or logging a parse warning.
		it('skips literal "undefined"/"null"/whitespace genre values', () => {
			const records = [
				createRecord({ genres: 'undefined' }),
				createRecord({ id: 2, historyKey: 'key-2', genres: 'null' }),
				createRecord({ id: 3, historyKey: 'key-3', genres: '   ' }),
				createRecord({ id: 4, historyKey: 'key-4', genres: '["Action"]' })
			];

			const result = calculateTopGenres(records);

			expect(result.length).toBe(1);
			expect(result[0]?.title).toBe('Action');
		});
	});
});

describe('Distribution Calculators', () => {
	describe('calculateMonthlyDistribution', () => {
		it('distributes watch time to correct months', () => {
			const records = [
				createRecord({ viewedAt: 1704067200, duration: 3600 }),
				createRecord({ id: 2, historyKey: 'key-2', viewedAt: 1719792000, duration: 1800 })
			];

			const result = calculateMonthlyDistribution(records);

			expect(result.minutes[0]).toBe(60);
			expect(result.minutes[6]).toBe(30);
			expect(result.minutes.reduce((a, b) => a + b, 0)).toBe(90);
		});

		it('returns 12 buckets for empty array', () => {
			const result = calculateMonthlyDistribution([]);
			expect(result.minutes.length).toBe(12);
			expect(result.plays.length).toBe(12);
			expect(result.minutes.every((v) => v === 0)).toBe(true);
			expect(result.plays.every((v) => v === 0)).toBe(true);
		});

		it('counts plays per month', () => {
			const records = [
				createRecord({ viewedAt: 1704067200, duration: 3600 }),
				createRecord({ id: 2, historyKey: 'key-2', viewedAt: 1704153600, duration: 1800 }),
				createRecord({ id: 3, historyKey: 'key-3', viewedAt: 1719792000, duration: 1800 })
			];

			const result = calculateMonthlyDistribution(records);

			expect(result.plays[0]).toBe(2);
			expect(result.plays[6]).toBe(1);
			expect(result.plays.reduce((a, b) => a + b, 0)).toBe(3);
		});
	});

	describe('calculateHourlyDistribution', () => {
		it('distributes watch time to correct hours', () => {
			const records = [
				createRecord({ viewedAt: 1704067200, duration: 3600 }),
				createRecord({ id: 2, historyKey: 'key-2', viewedAt: 1704110400, duration: 1800 })
			];

			const result = calculateHourlyDistribution(records);

			expect(result.minutes[0]).toBe(60);
			expect(result.minutes[12]).toBe(30);
			expect(result.minutes.reduce((a, b) => a + b, 0)).toBe(90);
		});

		it('returns 24 buckets for empty array', () => {
			const result = calculateHourlyDistribution([]);
			expect(result.minutes.length).toBe(24);
			expect(result.plays.length).toBe(24);
			expect(result.minutes.every((v) => v === 0)).toBe(true);
			expect(result.plays.every((v) => v === 0)).toBe(true);
		});

		it('counts plays per hour', () => {
			const records = [
				createRecord({ viewedAt: 1704067200, duration: 3600 }),
				createRecord({ id: 2, historyKey: 'key-2', viewedAt: 1704067260, duration: 1800 }),
				createRecord({ id: 3, historyKey: 'key-3', viewedAt: 1704110400, duration: 1800 })
			];

			const result = calculateHourlyDistribution(records);

			expect(result.plays[0]).toBe(2);
			expect(result.plays[12]).toBe(1);
			expect(result.plays.reduce((a, b) => a + b, 0)).toBe(3);
		});
	});
});

describe('Percentile Calculator', () => {
	it('calculates percentile correctly', () => {
		// 2 users have less than 100, so percentile = 2/4 * 100 = 50
		const percentile = calculatePercentileRank(100, [50, 75, 100, 150]);
		expect(percentile).toBe(50);
	});

	it('returns 0 for lowest watcher', () => {
		const percentile = calculatePercentileRank(10, [10, 50, 100]);
		expect(percentile).toBe(0);
	});

	it('returns high percentile for top watcher', () => {
		const percentile = calculatePercentileRank(100, [10, 50, 100]);
		// 2 out of 3 have less, so 66.67%
		expect(Math.round(percentile * 100) / 100).toBeCloseTo(66.67, 1);
	});

	it('returns 0 for empty array', () => {
		const percentile = calculatePercentileRank(100, []);
		expect(percentile).toBe(0);
	});

	it('handles ties correctly', () => {
		const percentile = calculatePercentileRank(50, [50, 50, 100]);
		// 0 users have less than 50, so 0%
		expect(percentile).toBe(0);
	});
});

describe('Binge Detector', () => {
	it('detects binge session with small gaps', () => {
		const records = [
			createRecord({ viewedAt: 1704067200, duration: 3600 }),
			createRecord({ id: 2, historyKey: 'key-2', viewedAt: 1704068000, duration: 3600 }),
			createRecord({ id: 3, historyKey: 'key-3', viewedAt: 1704069000, duration: 3600 })
		];

		const result = detectLongestBinge(records);

		expect(result).not.toBeNull();
		expect(result?.plays).toBe(3);
		expect(result?.totalMinutes).toBe(180);
	});

	it('splits into separate sessions for large gaps', () => {
		const records = [
			createRecord({ viewedAt: 1704067200, duration: 3600 }),
			createRecord({ id: 2, historyKey: 'key-2', viewedAt: 1704074400, duration: 3600 })
		];

		const sessions = detectAllBingeSessions(records);

		expect(sessions.length).toBe(2);
		expect(sessions[0]?.plays).toBe(1);
		expect(sessions[1]?.plays).toBe(1);
	});

	it('returns the session with max duration', () => {
		const records = [
			createRecord({ viewedAt: 1704067200, duration: 1800 }),
			createRecord({ id: 2, historyKey: 'key-2', viewedAt: 1704068000, duration: 1800 }),
			createRecord({ id: 3, historyKey: 'key-3', viewedAt: 1704074400, duration: 7200 })
		];

		const longest = detectLongestBinge(records);

		expect(longest?.totalMinutes).toBe(120);
		expect(longest?.plays).toBe(1);
	});

	it('handles single record', () => {
		const records = [createRecord({ duration: 3600 })];

		const result = detectLongestBinge(records);

		expect(result?.plays).toBe(1);
		expect(result?.totalMinutes).toBe(60);
	});

	it('handles records with null duration', () => {
		const records = [
			createRecord({ viewedAt: 1704067200, duration: null }),
			createRecord({ id: 2, historyKey: 'key-2', viewedAt: 1704068000, duration: 3600 })
		];

		const result = detectLongestBinge(records);

		expect(result?.totalMinutes).toBe(60);
	});

	it('gap threshold is 30 minutes', () => {
		expect(BINGE_GAP_THRESHOLD_SECONDS).toBe(30 * 60);
	});
});

describe('First/Last Watch Finder', () => {
	describe('findFirstWatch', () => {
		it('finds the earliest watched content', () => {
			const records = [
				createRecord({ id: 1, viewedAt: 1704100000, title: 'Middle' }),
				createRecord({ id: 2, historyKey: 'key-2', viewedAt: 1704067200, title: 'First' }),
				createRecord({ id: 3, historyKey: 'key-3', viewedAt: 1704200000, title: 'Last' })
			];

			const result = findFirstWatch(records);

			expect(result?.title).toBe('First');
			expect(result?.viewedAt).toBe(1704067200);
		});

		it('returns null for empty array', () => {
			const result = findFirstWatch([]);
			expect(result).toBeNull();
		});

		it('includes show name for episodes', () => {
			const records = [
				createRecord({
					type: 'episode',
					title: 'Pilot',
					grandparentTitle: 'Breaking Bad'
				})
			];

			const result = findFirstWatch(records);

			expect(result?.title).toBe('Breaking Bad: Pilot');
			expect(result?.type).toBe('episode');
		});
	});

	describe('findLastWatch', () => {
		it('finds the most recently watched content', () => {
			const records = [
				createRecord({ id: 1, viewedAt: 1704100000, title: 'Middle' }),
				createRecord({ id: 2, historyKey: 'key-2', viewedAt: 1704067200, title: 'First' }),
				createRecord({ id: 3, historyKey: 'key-3', viewedAt: 1704200000, title: 'Last' })
			];

			const result = findLastWatch(records);

			expect(result?.title).toBe('Last');
			expect(result?.viewedAt).toBe(1704200000);
		});

		it('returns null for empty array', () => {
			const result = findLastWatch([]);
			expect(result).toBeNull();
		});
	});
});
