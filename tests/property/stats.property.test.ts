/**
 * Property-based tests for Statistics Engine
 *
 * Feature: obzorarr, Properties 8-14
 * Validates: Requirements 4.1-4.9
 *
 * These tests verify the formal correctness properties defined in design.md
 * for the statistics calculation engine.
 */

import { describe, expect, it } from 'bun:test';
import * as fc from 'fast-check';

import {
	calculateWatchTime,
	calculateTopMovies,
	calculateTopShows,
	calculateMonthlyDistribution,
	calculateHourlyDistribution,
	calculatePercentileRank,
	detectLongestBinge,
	detectAllBingeSessions,
	BINGE_GAP_THRESHOLD_SECONDS
} from '$lib/server/stats/calculators';

import {
	getYearStartTimestamp,
	getYearEndTimestamp,
	createYearFilter
} from '$lib/server/stats/utils';

import type { PlayHistoryRecord } from '$lib/server/db/schema';

// =============================================================================
// Arbitraries
// =============================================================================

/**
 * Generate a valid play history record for testing
 */
const playHistoryRecordArbitrary: fc.Arbitrary<PlayHistoryRecord> = fc.record({
	id: fc.integer({ min: 1, max: 1000000 }),
	historyKey: fc.uuid(),
	ratingKey: fc.string({ minLength: 1, maxLength: 20 }),
	title: fc.string({ minLength: 1, maxLength: 200 }),
	type: fc.constantFrom('movie', 'episode'),
	viewedAt: fc.integer({ min: 1704067200, max: 1735689599 }), // 2024 year range
	accountId: fc.integer({ min: 1, max: 1000 }),
	librarySectionId: fc.integer({ min: 1, max: 100 }),
	thumb: fc.option(fc.webUrl(), { nil: null }),
	duration: fc.option(fc.integer({ min: 0, max: 14400 }), { nil: null }), // Up to 4 hours in seconds
	grandparentTitle: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: null }),
	parentTitle: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: null }),
	genres: fc.option(
		fc
			.array(fc.constantFrom('Action', 'Comedy', 'Drama', 'Sci-Fi', 'Horror'), {
				minLength: 1,
				maxLength: 3
			})
			.map((arr) => JSON.stringify(arr)),
		{ nil: null }
	),
	releaseYear: fc.option(fc.integer({ min: 1900, max: new Date().getFullYear() }), { nil: null })
});

/**
 * Generate a movie record specifically
 */
const movieRecordArbitrary: fc.Arbitrary<PlayHistoryRecord> = playHistoryRecordArbitrary.map(
	(record) => ({
		...record,
		type: 'movie' as const,
		grandparentTitle: null,
		parentTitle: null
	})
);

/**
 * Generate an episode record specifically
 */
const episodeRecordArbitrary: fc.Arbitrary<PlayHistoryRecord> = fc
	.record({
		id: fc.integer({ min: 1, max: 1000000 }),
		historyKey: fc.uuid(),
		ratingKey: fc.string({ minLength: 1, maxLength: 20 }),
		title: fc.string({ minLength: 1, maxLength: 100 }), // Episode title
		type: fc.constant('episode' as const),
		viewedAt: fc.integer({ min: 1704067200, max: 1735689599 }),
		accountId: fc.integer({ min: 1, max: 1000 }),
		librarySectionId: fc.integer({ min: 1, max: 100 }),
		thumb: fc.option(fc.webUrl(), { nil: null }),
		duration: fc.option(fc.integer({ min: 0, max: 14400 }), { nil: null }),
		grandparentTitle: fc.string({ minLength: 1, maxLength: 100 }), // Show name
		parentTitle: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: null }), // Season
		genres: fc.option(
			fc
				.array(fc.constantFrom('Action', 'Comedy', 'Drama', 'Sci-Fi', 'Horror'), {
					minLength: 1,
					maxLength: 3
				})
				.map((arr) => JSON.stringify(arr)),
			{ nil: null }
		),
		releaseYear: fc.option(fc.integer({ min: 1900, max: new Date().getFullYear() }), { nil: null })
	})
	.map((record) => record as PlayHistoryRecord);

// =============================================================================
// Property 8: Year Date Range Filtering
// =============================================================================

describe('Property 8: Year Date Range Filtering', () => {
	it('year boundaries are correctly calculated', () => {
		fc.assert(
			fc.property(fc.integer({ min: 2000, max: 2100 }), (year) => {
				const startTimestamp = getYearStartTimestamp(year);
				const endTimestamp = getYearEndTimestamp(year);

				const startDate = new Date(startTimestamp * 1000);
				const endDate = new Date(endTimestamp * 1000);

				// Start should be Jan 1 00:00:00
				const isCorrectStart =
					startDate.getUTCFullYear() === year &&
					startDate.getUTCMonth() === 0 &&
					startDate.getUTCDate() === 1 &&
					startDate.getUTCHours() === 0 &&
					startDate.getUTCMinutes() === 0 &&
					startDate.getUTCSeconds() === 0;

				// End should be Dec 31 23:59:59
				const isCorrectEnd =
					endDate.getUTCFullYear() === year &&
					endDate.getUTCMonth() === 11 &&
					endDate.getUTCDate() === 31 &&
					endDate.getUTCHours() === 23 &&
					endDate.getUTCMinutes() === 59 &&
					endDate.getUTCSeconds() === 59;

				return isCorrectStart && isCorrectEnd;
			}),
			{ numRuns: 100 }
		);
	});

	it('createYearFilter returns correct structure', () => {
		fc.assert(
			fc.property(fc.integer({ min: 2000, max: 2100 }), (year) => {
				const filter = createYearFilter(year);

				return (
					filter.year === year &&
					filter.startTimestamp === getYearStartTimestamp(year) &&
					filter.endTimestamp === getYearEndTimestamp(year) &&
					filter.startTimestamp < filter.endTimestamp
				);
			}),
			{ numRuns: 100 }
		);
	});
});

// =============================================================================
// Property 9: Watch Time Aggregation
// =============================================================================

describe('Property 9: Watch Time Aggregation', () => {
	it('total watch time equals sum of durations', () => {
		fc.assert(
			fc.property(
				fc.array(playHistoryRecordArbitrary, { minLength: 0, maxLength: 100 }),
				(records) => {
					const expectedSeconds = records.reduce((sum, r) => sum + (r.duration ?? 0), 0);
					const expectedMinutes = expectedSeconds / 60;

					const result = calculateWatchTime(records);

					// Allow for small floating point differences
					return Math.abs(result.totalWatchTimeMinutes - expectedMinutes) < 0.001;
				}
			),
			{ numRuns: 100 }
		);
	});

	it('total plays equals number of records', () => {
		fc.assert(
			fc.property(
				fc.array(playHistoryRecordArbitrary, { minLength: 0, maxLength: 100 }),
				(records) => {
					const result = calculateWatchTime(records);
					return result.totalPlays === records.length;
				}
			),
			{ numRuns: 100 }
		);
	});

	it('handles null durations as zero', () => {
		fc.assert(
			fc.property(
				fc.array(playHistoryRecordArbitrary, { minLength: 1, maxLength: 50 }),
				(records) => {
					// Force all durations to null
					const nullDurationRecords = records.map((r) => ({ ...r, duration: null }));
					const result = calculateWatchTime(nullDurationRecords);

					// Total time should be 0, but plays should equal record count
					return result.totalWatchTimeMinutes === 0 && result.totalPlays === records.length;
				}
			),
			{ numRuns: 100 }
		);
	});
});

// =============================================================================
// Property 10: Ranking Correctness
// =============================================================================

describe('Property 10: Ranking Correctness', () => {
	it('movie rankings are ordered by count descending', () => {
		fc.assert(
			fc.property(fc.array(movieRecordArbitrary, { minLength: 1, maxLength: 50 }), (records) => {
				const rankings = calculateTopMovies(records);

				for (let i = 1; i < rankings.length; i++) {
					const prev = rankings[i - 1];
					const curr = rankings[i];
					if (!prev || !curr) continue;
					if (prev.count < curr.count) return false;
				}
				return true;
			}),
			{ numRuns: 100 }
		);
	});

	it('show rankings are ordered by count descending', () => {
		fc.assert(
			fc.property(fc.array(episodeRecordArbitrary, { minLength: 1, maxLength: 50 }), (records) => {
				const rankings = calculateTopShows(records);

				for (let i = 1; i < rankings.length; i++) {
					const prev = rankings[i - 1];
					const curr = rankings[i];
					if (!prev || !curr) continue;
					if (prev.count < curr.count) return false;
				}
				return true;
			}),
			{ numRuns: 100 }
		);
	});

	it('ties are broken alphabetically by title', () => {
		fc.assert(
			fc.property(fc.array(movieRecordArbitrary, { minLength: 2, maxLength: 50 }), (records) => {
				const rankings = calculateTopMovies(records);

				for (let i = 1; i < rankings.length; i++) {
					const prev = rankings[i - 1];
					const curr = rankings[i];
					if (!prev || !curr) continue;
					// If counts are equal, titles should be in alphabetical order
					if (prev.count === curr.count) {
						if (prev.title.localeCompare(curr.title) > 0) return false;
					}
				}
				return true;
			}),
			{ numRuns: 100 }
		);
	});

	it('ranks are assigned correctly (1 to N)', () => {
		fc.assert(
			fc.property(fc.array(movieRecordArbitrary, { minLength: 1, maxLength: 50 }), (records) => {
				const rankings = calculateTopMovies(records);

				for (let i = 0; i < rankings.length; i++) {
					const item = rankings[i];
					if (!item) continue;
					if (item.rank !== i + 1) return false;
				}
				return true;
			}),
			{ numRuns: 100 }
		);
	});
});

// =============================================================================
// Property 11: Monthly Distribution Completeness
// =============================================================================

describe('Property 11: Monthly Distribution Completeness', () => {
	it('monthly distribution sum equals total watch time', () => {
		fc.assert(
			fc.property(
				fc.array(playHistoryRecordArbitrary, { minLength: 0, maxLength: 100 }),
				(records) => {
					const distribution = calculateMonthlyDistribution(records);
					const distributionSum = distribution.minutes.reduce((a, b) => a + b, 0);

					const totalSeconds = records.reduce((sum, r) => sum + (r.duration ?? 0), 0);
					const totalMinutes = totalSeconds / 60;

					return Math.abs(distributionSum - totalMinutes) < 0.001;
				}
			),
			{ numRuns: 100 }
		);
	});

	it('monthly distribution has exactly 12 buckets', () => {
		fc.assert(
			fc.property(
				fc.array(playHistoryRecordArbitrary, { minLength: 0, maxLength: 50 }),
				(records) => {
					const distribution = calculateMonthlyDistribution(records);
					return distribution.minutes.length === 12 && distribution.plays.length === 12;
				}
			),
			{ numRuns: 100 }
		);
	});

	it('all monthly values are non-negative', () => {
		fc.assert(
			fc.property(
				fc.array(playHistoryRecordArbitrary, { minLength: 0, maxLength: 50 }),
				(records) => {
					const distribution = calculateMonthlyDistribution(records);
					return (
						distribution.minutes.every((v) => v >= 0) && distribution.plays.every((v) => v >= 0)
					);
				}
			),
			{ numRuns: 100 }
		);
	});

	it('monthly plays sum equals total record count', () => {
		fc.assert(
			fc.property(
				fc.array(playHistoryRecordArbitrary, { minLength: 0, maxLength: 100 }),
				(records) => {
					const distribution = calculateMonthlyDistribution(records);
					const playsSum = distribution.plays.reduce((a, b) => a + b, 0);
					return playsSum === records.length;
				}
			),
			{ numRuns: 100 }
		);
	});
});

// =============================================================================
// Property 12: Hourly Distribution Completeness
// =============================================================================

describe('Property 12: Hourly Distribution Completeness', () => {
	it('hourly distribution sum equals total watch time', () => {
		fc.assert(
			fc.property(
				fc.array(playHistoryRecordArbitrary, { minLength: 0, maxLength: 100 }),
				(records) => {
					const distribution = calculateHourlyDistribution(records);
					const distributionSum = distribution.minutes.reduce((a, b) => a + b, 0);

					const totalSeconds = records.reduce((sum, r) => sum + (r.duration ?? 0), 0);
					const totalMinutes = totalSeconds / 60;

					return Math.abs(distributionSum - totalMinutes) < 0.001;
				}
			),
			{ numRuns: 100 }
		);
	});

	it('hourly distribution has exactly 24 buckets', () => {
		fc.assert(
			fc.property(
				fc.array(playHistoryRecordArbitrary, { minLength: 0, maxLength: 50 }),
				(records) => {
					const distribution = calculateHourlyDistribution(records);
					return distribution.minutes.length === 24 && distribution.plays.length === 24;
				}
			),
			{ numRuns: 100 }
		);
	});

	it('all hourly values are non-negative', () => {
		fc.assert(
			fc.property(
				fc.array(playHistoryRecordArbitrary, { minLength: 0, maxLength: 50 }),
				(records) => {
					const distribution = calculateHourlyDistribution(records);
					return (
						distribution.minutes.every((v) => v >= 0) && distribution.plays.every((v) => v >= 0)
					);
				}
			),
			{ numRuns: 100 }
		);
	});

	it('hourly plays sum equals total record count', () => {
		fc.assert(
			fc.property(
				fc.array(playHistoryRecordArbitrary, { minLength: 0, maxLength: 100 }),
				(records) => {
					const distribution = calculateHourlyDistribution(records);
					const playsSum = distribution.plays.reduce((a, b) => a + b, 0);
					return playsSum === records.length;
				}
			),
			{ numRuns: 100 }
		);
	});
});

// =============================================================================
// Property 13: Percentile Calculation
// =============================================================================

describe('Property 13: Percentile Calculation', () => {
	it('percentile equals (users with less watch time) / N * 100', () => {
		fc.assert(
			fc.property(
				fc.float({ min: 0, max: 100000, noNaN: true }),
				fc.array(fc.float({ min: 0, max: 100000, noNaN: true }), { minLength: 1, maxLength: 100 }),
				(userWatchTime, otherWatchTimes) => {
					const allWatchTimes = [userWatchTime, ...otherWatchTimes];
					const percentile = calculatePercentileRank(userWatchTime, allWatchTimes);

					const usersWithLess = allWatchTimes.filter((t) => t < userWatchTime).length;
					const expectedPercentile = (usersWithLess / allWatchTimes.length) * 100;

					return Math.abs(percentile - expectedPercentile) < 0.001;
				}
			),
			{ numRuns: 100 }
		);
	});

	it('percentile is between 0 and 100', () => {
		fc.assert(
			fc.property(
				fc.float({ min: 0, max: 100000, noNaN: true }),
				fc.array(fc.float({ min: 0, max: 100000, noNaN: true }), { minLength: 1, maxLength: 100 }),
				(userWatchTime, otherWatchTimes) => {
					const allWatchTimes = [userWatchTime, ...otherWatchTimes];
					const percentile = calculatePercentileRank(userWatchTime, allWatchTimes);

					return percentile >= 0 && percentile <= 100;
				}
			),
			{ numRuns: 100 }
		);
	});

	it('empty array returns 0 percentile', () => {
		const percentile = calculatePercentileRank(100, []);
		expect(percentile).toBe(0);
	});

	it('highest watcher has highest percentile', () => {
		fc.assert(
			fc.property(
				fc.array(fc.float({ min: 0, max: 100000, noNaN: true }), { minLength: 2, maxLength: 50 }),
				(watchTimes) => {
					const maxWatchTime = Math.max(...watchTimes);
					const percentile = calculatePercentileRank(maxWatchTime, watchTimes);

					// The max watcher should have percentile = (N-1)/N * 100
					// (everyone except themselves has less)
					const expected = ((watchTimes.length - 1) / watchTimes.length) * 100;

					// Allow for ties affecting the result
					return (
						percentile >= expected - 0.001 ||
						watchTimes.filter((t) => t === maxWatchTime).length > 1
					);
				}
			),
			{ numRuns: 100 }
		);
	});
});

// =============================================================================
// Property 14: Binge Session Detection
// =============================================================================

describe('Property 14: Binge Session Detection', () => {
	it('longest binge has maximum totalMinutes among all sessions', () => {
		fc.assert(
			fc.property(
				fc
					.array(playHistoryRecordArbitrary, { minLength: 2, maxLength: 50 })
					.map((records) => records.sort((a, b) => a.viewedAt - b.viewedAt)),
				(sortedRecords) => {
					const longestBinge = detectLongestBinge(sortedRecords);
					const allBinges = detectAllBingeSessions(sortedRecords);

					if (allBinges.length === 0) {
						return longestBinge === null;
					}

					// Longest binge should have maximum totalMinutes
					const maxMinutes = Math.max(...allBinges.map((b) => b.totalMinutes));
					return longestBinge !== null && Math.abs(longestBinge.totalMinutes - maxMinutes) < 0.001;
				}
			),
			{ numRuns: 100 }
		);
	});

	it('binge sessions have non-negative values', () => {
		fc.assert(
			fc.property(
				fc.array(playHistoryRecordArbitrary, { minLength: 1, maxLength: 50 }),
				(records) => {
					const sessions = detectAllBingeSessions(records);

					return sessions.every(
						(session) =>
							session.plays >= 1 &&
							session.totalMinutes >= 0 &&
							session.startTime <= session.endTime
					);
				}
			),
			{ numRuns: 100 }
		);
	});

	it('empty records returns null for longest binge', () => {
		const result = detectLongestBinge([]);
		expect(result).toBeNull();
	});

	it('single record returns session with 1 play', () => {
		fc.assert(
			fc.property(playHistoryRecordArbitrary, (record) => {
				const result = detectLongestBinge([record]);

				if (!result) return false;

				return (
					result.plays === 1 &&
					result.startTime === record.viewedAt &&
					result.endTime === record.viewedAt
				);
			}),
			{ numRuns: 100 }
		);
	});

	it('consecutive plays within threshold form a single session', () => {
		// Create records with small gaps (all within threshold)
		fc.assert(
			fc.property(
				fc.integer({ min: 2, max: 10 }),
				fc.integer({ min: 1704067200, max: 1735000000 }),
				fc.integer({ min: 60, max: 1800 }), // Duration 1-30 min
				(numRecords, startTime, duration) => {
					// Create records with 15 minute gaps (within 30 min threshold)
					const records: PlayHistoryRecord[] = [];
					for (let i = 0; i < numRecords; i++) {
						records.push({
							id: i + 1,
							historyKey: `key-${i}`,
							ratingKey: `rating-${i}`,
							title: `Title ${i}`,
							type: 'movie',
							viewedAt: startTime + i * 15 * 60, // 15 min gaps
							accountId: 1,
							librarySectionId: 1,
							thumb: null,
							duration,
							grandparentTitle: null,
							parentTitle: null,
							genres: null,
							releaseYear: null
						});
					}

					const sessions = detectAllBingeSessions(records);

					// Should be exactly one session containing all records
					return sessions.length === 1 && sessions[0]?.plays === numRecords;
				}
			),
			{ numRuns: 100 }
		);
	});

	it('large gaps create separate sessions', () => {
		// Create two groups of records with a large gap between them
		const records: PlayHistoryRecord[] = [
			{
				id: 1,
				historyKey: 'key-1',
				ratingKey: 'rating-1',
				title: 'Title 1',
				type: 'movie',
				viewedAt: 1704067200,
				accountId: 1,
				librarySectionId: 1,
				thumb: null,
				duration: 3600,
				grandparentTitle: null,
				parentTitle: null,
				genres: null,
				releaseYear: null
			},
			{
				id: 2,
				historyKey: 'key-2',
				ratingKey: 'rating-2',
				title: 'Title 2',
				type: 'movie',
				viewedAt: 1704067200 + 3600, // 1 hour gap (exceeds 30 min threshold)
				accountId: 1,
				librarySectionId: 1,
				thumb: null,
				duration: 3600,
				grandparentTitle: null,
				parentTitle: null,
				genres: null,
				releaseYear: null
			}
		];

		const sessions = detectAllBingeSessions(records);

		// Should be two separate sessions
		expect(sessions.length).toBe(2);
	});
});

// =============================================================================
// Edge Cases
// =============================================================================

describe('Edge Cases', () => {
	it('handles empty arrays for all calculators', () => {
		const emptyRecords: PlayHistoryRecord[] = [];

		const watchTime = calculateWatchTime(emptyRecords);
		expect(watchTime.totalWatchTimeMinutes).toBe(0);
		expect(watchTime.totalPlays).toBe(0);

		const topMovies = calculateTopMovies(emptyRecords);
		expect(topMovies).toEqual([]);

		const topShows = calculateTopShows(emptyRecords);
		expect(topShows).toEqual([]);

		const monthly = calculateMonthlyDistribution(emptyRecords);
		expect(monthly.minutes.length).toBe(12);
		expect(monthly.plays.length).toBe(12);
		expect(monthly.minutes.every((v) => v === 0)).toBe(true);
		expect(monthly.plays.every((v) => v === 0)).toBe(true);

		const hourly = calculateHourlyDistribution(emptyRecords);
		expect(hourly.minutes.length).toBe(24);
		expect(hourly.plays.length).toBe(24);
		expect(hourly.minutes.every((v) => v === 0)).toBe(true);
		expect(hourly.plays.every((v) => v === 0)).toBe(true);

		const binge = detectLongestBinge(emptyRecords);
		expect(binge).toBeNull();
	});
});
