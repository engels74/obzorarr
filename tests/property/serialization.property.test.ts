import { describe, expect, it } from 'bun:test';
import * as fc from 'fast-check';
import type {
	UserStats,
	ServerStats,
	RankedItem,
	BingeSession,
	WatchRecord
} from '$lib/server/stats/types';
import {
	serializeStats,
	parseUserStats,
	parseServerStats,
	roundTripStats
} from '$lib/server/stats/serialization';

/**
 * Property-based tests for statistics serialization round-trip
 *
 * Feature: obzorarr, Property 21: Statistics Serialization Round-Trip
 * Validates: Requirements 17.4
 *
 * Property: For any valid UserStats or ServerStats object, serializing to JSON
 * then deserializing SHALL produce an object equivalent to the original.
 */

// =============================================================================
// Arbitraries (generators for random test data)
// =============================================================================

/**
 * Generate a valid RankedItem
 */
const rankedItemArbitrary: fc.Arbitrary<RankedItem> = fc.record({
	rank: fc.integer({ min: 1, max: 1000 }),
	title: fc.string({ minLength: 1, maxLength: 200 }),
	count: fc.integer({ min: 0, max: 100000 }),
	thumb: fc.option(fc.webUrl(), { nil: null })
});

/**
 * Generate a valid BingeSession
 */
const bingeSessionArbitrary: fc.Arbitrary<BingeSession> = fc
	.record({
		startTime: fc.integer({ min: 1577836800, max: 1893456000 }), // 2020-2030
		endTime: fc.integer({ min: 1577836800, max: 1893456000 }),
		plays: fc.integer({ min: 1, max: 100 }),
		totalMinutes: fc.float({ min: 0, max: 10000, noNaN: true })
	})
	.map((session) => ({
		...session,
		// Ensure endTime >= startTime
		endTime: Math.max(session.startTime, session.endTime)
	}));

/**
 * Generate a valid WatchRecord
 */
const watchRecordArbitrary: fc.Arbitrary<WatchRecord> = fc.record({
	title: fc.string({ minLength: 1, maxLength: 200 }),
	viewedAt: fc.integer({ min: 1577836800, max: 1893456000 }), // 2020-2030
	thumb: fc.option(fc.webUrl(), { nil: null }),
	type: fc.constantFrom('movie', 'episode', 'track') as fc.Arbitrary<'movie' | 'episode' | 'track'>
});

/**
 * Generate an array of exactly 12 non-negative numbers (monthly distribution)
 */
const monthlyDistributionArbitrary: fc.Arbitrary<number[]> = fc
	.tuple(
		fc.float({ min: 0, max: 100000, noNaN: true }),
		fc.float({ min: 0, max: 100000, noNaN: true }),
		fc.float({ min: 0, max: 100000, noNaN: true }),
		fc.float({ min: 0, max: 100000, noNaN: true }),
		fc.float({ min: 0, max: 100000, noNaN: true }),
		fc.float({ min: 0, max: 100000, noNaN: true }),
		fc.float({ min: 0, max: 100000, noNaN: true }),
		fc.float({ min: 0, max: 100000, noNaN: true }),
		fc.float({ min: 0, max: 100000, noNaN: true }),
		fc.float({ min: 0, max: 100000, noNaN: true }),
		fc.float({ min: 0, max: 100000, noNaN: true }),
		fc.float({ min: 0, max: 100000, noNaN: true })
	)
	.map((tuple) => [...tuple]);

/**
 * Generate an array of exactly 24 non-negative numbers (hourly distribution)
 */
const hourlyDistributionArbitrary: fc.Arbitrary<number[]> = fc
	.tuple(
		fc.float({ min: 0, max: 100000, noNaN: true }),
		fc.float({ min: 0, max: 100000, noNaN: true }),
		fc.float({ min: 0, max: 100000, noNaN: true }),
		fc.float({ min: 0, max: 100000, noNaN: true }),
		fc.float({ min: 0, max: 100000, noNaN: true }),
		fc.float({ min: 0, max: 100000, noNaN: true }),
		fc.float({ min: 0, max: 100000, noNaN: true }),
		fc.float({ min: 0, max: 100000, noNaN: true }),
		fc.float({ min: 0, max: 100000, noNaN: true }),
		fc.float({ min: 0, max: 100000, noNaN: true }),
		fc.float({ min: 0, max: 100000, noNaN: true }),
		fc.float({ min: 0, max: 100000, noNaN: true }),
		fc.float({ min: 0, max: 100000, noNaN: true }),
		fc.float({ min: 0, max: 100000, noNaN: true }),
		fc.float({ min: 0, max: 100000, noNaN: true }),
		fc.float({ min: 0, max: 100000, noNaN: true }),
		fc.float({ min: 0, max: 100000, noNaN: true }),
		fc.float({ min: 0, max: 100000, noNaN: true }),
		fc.float({ min: 0, max: 100000, noNaN: true }),
		fc.float({ min: 0, max: 100000, noNaN: true }),
		fc.float({ min: 0, max: 100000, noNaN: true }),
		fc.float({ min: 0, max: 100000, noNaN: true }),
		fc.float({ min: 0, max: 100000, noNaN: true }),
		fc.float({ min: 0, max: 100000, noNaN: true })
	)
	.map((tuple) => [...tuple]);

/**
 * Generate a valid UserStats object
 */
const userStatsArbitrary: fc.Arbitrary<UserStats> = fc.record({
	userId: fc.integer({ min: 1, max: 1000000 }),
	year: fc.integer({ min: 2000, max: 2100 }),
	totalWatchTimeMinutes: fc.float({ min: 0, max: 1000000, noNaN: true }),
	totalPlays: fc.integer({ min: 0, max: 100000 }),
	topMovies: fc.array(rankedItemArbitrary, { minLength: 0, maxLength: 10 }),
	topShows: fc.array(rankedItemArbitrary, { minLength: 0, maxLength: 10 }),
	topGenres: fc.array(rankedItemArbitrary, { minLength: 0, maxLength: 10 }),
	watchTimeByMonth: monthlyDistributionArbitrary,
	watchTimeByHour: hourlyDistributionArbitrary,
	percentileRank: fc.float({ min: 0, max: 100, noNaN: true }),
	longestBinge: fc.option(bingeSessionArbitrary, { nil: null }),
	firstWatch: fc.option(watchRecordArbitrary, { nil: null }),
	lastWatch: fc.option(watchRecordArbitrary, { nil: null })
});

/**
 * Generate a valid ServerStats object
 */
const serverStatsArbitrary: fc.Arbitrary<ServerStats> = fc.record({
	year: fc.integer({ min: 2000, max: 2100 }),
	totalUsers: fc.integer({ min: 0, max: 10000 }),
	totalWatchTimeMinutes: fc.float({ min: 0, max: 10000000, noNaN: true }),
	totalPlays: fc.integer({ min: 0, max: 1000000 }),
	topMovies: fc.array(rankedItemArbitrary, { minLength: 0, maxLength: 10 }),
	topShows: fc.array(rankedItemArbitrary, { minLength: 0, maxLength: 10 }),
	topGenres: fc.array(rankedItemArbitrary, { minLength: 0, maxLength: 10 }),
	watchTimeByMonth: monthlyDistributionArbitrary,
	watchTimeByHour: hourlyDistributionArbitrary,
	topViewers: fc.array(
		fc.record({
			rank: fc.integer({ min: 1, max: 1000 }),
			userId: fc.integer({ min: 1, max: 1000000 }),
			username: fc.string({ minLength: 1, maxLength: 100 }),
			totalMinutes: fc.float({ min: 0, max: 1000000, noNaN: true })
		}),
		{ minLength: 0, maxLength: 10 }
	),
	longestBinge: fc.option(bingeSessionArbitrary, { nil: null }),
	firstWatch: fc.option(watchRecordArbitrary, { nil: null }),
	lastWatch: fc.option(watchRecordArbitrary, { nil: null })
});

// =============================================================================
// Helper functions
// =============================================================================

/**
 * Deep equality check for stats objects
 * Handles floating point comparison with tolerance
 */
function statsAreEqual(a: UserStats | ServerStats, b: UserStats | ServerStats): boolean {
	const aJson = JSON.stringify(a);
	const bJson = JSON.stringify(b);
	return aJson === bJson;
}

// =============================================================================
// Property Tests
// =============================================================================

// Feature: obzorarr, Property 21: Statistics Serialization Round-Trip
describe('Property 21: Statistics Serialization Round-Trip', () => {
	describe('UserStats round-trip', () => {
		it('serialize then deserialize produces equivalent UserStats', () => {
			fc.assert(
				fc.property(userStatsArbitrary, (originalStats) => {
					// Serialize to JSON
					const json = serializeStats(originalStats);

					// Deserialize back to object
					const parsedStats = parseUserStats(json);

					// Verify equality
					return statsAreEqual(originalStats, parsedStats);
				}),
				{ numRuns: 100 }
			);
		});

		it('roundTripStats returns equivalent UserStats', () => {
			fc.assert(
				fc.property(userStatsArbitrary, (originalStats) => {
					const roundTripped = roundTripStats(originalStats);
					return statsAreEqual(originalStats, roundTripped);
				}),
				{ numRuns: 100 }
			);
		});

		it('double round-trip produces equivalent UserStats', () => {
			fc.assert(
				fc.property(userStatsArbitrary, (originalStats) => {
					// First round-trip
					const json1 = serializeStats(originalStats);
					const parsed1 = parseUserStats(json1);

					// Second round-trip
					const json2 = serializeStats(parsed1);
					const parsed2 = parseUserStats(json2);

					// Both should be equivalent to original
					return statsAreEqual(originalStats, parsed1) && statsAreEqual(parsed1, parsed2);
				}),
				{ numRuns: 100 }
			);
		});
	});

	describe('ServerStats round-trip', () => {
		it('serialize then deserialize produces equivalent ServerStats', () => {
			fc.assert(
				fc.property(serverStatsArbitrary, (originalStats) => {
					// Serialize to JSON
					const json = serializeStats(originalStats);

					// Deserialize back to object
					const parsedStats = parseServerStats(json);

					// Verify equality
					return statsAreEqual(originalStats, parsedStats);
				}),
				{ numRuns: 100 }
			);
		});

		it('roundTripStats returns equivalent ServerStats', () => {
			fc.assert(
				fc.property(serverStatsArbitrary, (originalStats) => {
					const roundTripped = roundTripStats(originalStats);
					return statsAreEqual(originalStats, roundTripped);
				}),
				{ numRuns: 100 }
			);
		});

		it('double round-trip produces equivalent ServerStats', () => {
			fc.assert(
				fc.property(serverStatsArbitrary, (originalStats) => {
					// First round-trip
					const json1 = serializeStats(originalStats);
					const parsed1 = parseServerStats(json1);

					// Second round-trip
					const json2 = serializeStats(parsed1);
					const parsed2 = parseServerStats(json2);

					// Both should be equivalent to original
					return statsAreEqual(originalStats, parsed1) && statsAreEqual(parsed1, parsed2);
				}),
				{ numRuns: 100 }
			);
		});
	});

	describe('Serialization format', () => {
		it('serialized UserStats is valid JSON', () => {
			fc.assert(
				fc.property(userStatsArbitrary, (stats) => {
					const json = serializeStats(stats);
					// Should not throw
					const parsed = JSON.parse(json);
					return typeof parsed === 'object' && parsed !== null;
				}),
				{ numRuns: 100 }
			);
		});

		it('serialized ServerStats is valid JSON', () => {
			fc.assert(
				fc.property(serverStatsArbitrary, (stats) => {
					const json = serializeStats(stats);
					// Should not throw
					const parsed = JSON.parse(json);
					return typeof parsed === 'object' && parsed !== null;
				}),
				{ numRuns: 100 }
			);
		});
	});
});

// Additional unit tests for edge cases
describe('Serialization edge cases', () => {
	it('handles UserStats with empty arrays', () => {
		const stats: UserStats = {
			userId: 1,
			year: 2024,
			totalWatchTimeMinutes: 0,
			totalPlays: 0,
			topMovies: [],
			topShows: [],
			topGenres: [],
			watchTimeByMonth: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			watchTimeByHour: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			percentileRank: 0,
			longestBinge: null,
			firstWatch: null,
			lastWatch: null
		};

		const json = serializeStats(stats);
		const parsed = parseUserStats(json);

		expect(statsAreEqual(stats, parsed)).toBe(true);
	});

	it('handles UserStats with all nullable fields as null', () => {
		const stats: UserStats = {
			userId: 42,
			year: 2024,
			totalWatchTimeMinutes: 1234.5,
			totalPlays: 100,
			topMovies: [{ rank: 1, title: 'Test Movie', count: 5, thumb: null }],
			topShows: [],
			topGenres: [],
			watchTimeByMonth: [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200],
			watchTimeByHour: [
				1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24
			],
			percentileRank: 75.5,
			longestBinge: null,
			firstWatch: null,
			lastWatch: null
		};

		const json = serializeStats(stats);
		const parsed = parseUserStats(json);

		expect(statsAreEqual(stats, parsed)).toBe(true);
	});

	it('handles ServerStats with all fields populated', () => {
		const stats: ServerStats = {
			year: 2024,
			totalUsers: 50,
			totalWatchTimeMinutes: 500000,
			totalPlays: 10000,
			topMovies: [
				{ rank: 1, title: 'Movie 1', count: 100, thumb: 'https://example.com/thumb1.jpg' }
			],
			topShows: [{ rank: 1, title: 'Show 1', count: 200, thumb: 'https://example.com/thumb2.jpg' }],
			topGenres: [{ rank: 1, title: 'Action', count: 300, thumb: null }],
			watchTimeByMonth: [1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000, 11000, 12000],
			watchTimeByHour: [
				100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700,
				1800, 1900, 2000, 2100, 2200, 2300, 2400
			],
			topViewers: [{ rank: 1, userId: 1, username: 'TopViewer', totalMinutes: 10000 }],
			longestBinge: {
				startTime: 1704067200,
				endTime: 1704096000,
				plays: 10,
				totalMinutes: 480
			},
			firstWatch: {
				title: 'First Movie',
				viewedAt: 1704067200,
				thumb: 'https://example.com/first.jpg',
				type: 'movie'
			},
			lastWatch: {
				title: 'Last Episode',
				viewedAt: 1735689600,
				thumb: null,
				type: 'episode'
			}
		};

		const json = serializeStats(stats);
		const parsed = parseServerStats(json);

		expect(statsAreEqual(stats, parsed)).toBe(true);
	});

	it('rejects invalid JSON', () => {
		expect(() => parseUserStats('not valid json')).toThrow();
		expect(() => parseServerStats('{ invalid }')).toThrow();
	});

	it('rejects object missing required fields', () => {
		const invalidStats = JSON.stringify({ userId: 1 });
		expect(() => parseUserStats(invalidStats)).toThrow();
	});

	it('rejects object with wrong array lengths', () => {
		const invalidStats = JSON.stringify({
			userId: 1,
			year: 2024,
			totalWatchTimeMinutes: 0,
			totalPlays: 0,
			topMovies: [],
			topShows: [],
			topGenres: [],
			watchTimeByMonth: [1, 2, 3], // Wrong length - should be 12
			watchTimeByHour: [
				1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24
			],
			percentileRank: 50,
			longestBinge: null,
			firstWatch: null,
			lastWatch: null
		});
		expect(() => parseUserStats(invalidStats)).toThrow();
	});
});
