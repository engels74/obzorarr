import { describe, expect, it } from 'bun:test';
import {
	parseServerStats,
	parseStats,
	parseUserStats,
	roundTripStats,
	StatsParseError,
	serializeStats
} from '$lib/server/stats/serialization';
import type { ServerStats, UserStats } from '$lib/server/stats/types';

/**
 * Unit tests for Stats Serialization
 *
 * Tests JSON serialization, parsing, type detection, and round-trip validation.
 */

// =============================================================================
// Test Helpers
// =============================================================================

function createValidUserStats(): UserStats {
	return {
		userId: 1,
		year: 2024,
		totalWatchTimeMinutes: 6000,
		totalPlays: 200,
		topMovies: [{ rank: 1, title: 'The Matrix', count: 5, thumb: null }],
		topShows: [{ rank: 1, title: 'Breaking Bad', count: 50, thumb: null }],
		topGenres: [{ rank: 1, title: 'Action', count: 100, thumb: null }],
		watchTimeByMonth: {
			minutes: [500, 400, 600, 500, 400, 300, 800, 600, 500, 400, 500, 500],
			plays: [10, 8, 12, 10, 8, 6, 16, 12, 10, 8, 10, 10]
		},
		watchTimeByHour: { minutes: Array(24).fill(250), plays: Array(24).fill(5) },
		watchTimeByWeekday: { minutes: Array(7).fill(857), plays: Array(7).fill(29) },
		contentTypes: {
			movies: { count: 50, minutes: 3000 },
			episodes: { count: 150, minutes: 3000 },
			tracks: { count: 0, minutes: 0 }
		},
		decadeDistribution: [],
		seriesCompletion: [],
		topRewatches: [],
		marathonDay: null,
		watchStreak: null,
		yearComparison: null,
		percentileRank: 85,
		longestBinge: null,
		firstWatch: null,
		lastWatch: null
	};
}

function createValidServerStats(): ServerStats {
	return {
		year: 2024,
		totalUsers: 10,
		totalWatchTimeMinutes: 60000,
		totalPlays: 2000,
		topMovies: [{ rank: 1, title: 'Popular Movie', count: 50, thumb: null }],
		topShows: [{ rank: 1, title: 'Popular Show', count: 500, thumb: null }],
		topGenres: [{ rank: 1, title: 'Drama', count: 500, thumb: null }],
		watchTimeByMonth: { minutes: Array(12).fill(5000), plays: Array(12).fill(100) },
		watchTimeByHour: { minutes: Array(24).fill(2500), plays: Array(24).fill(50) },
		watchTimeByWeekday: { minutes: Array(7).fill(8571), plays: Array(7).fill(286) },
		contentTypes: {
			movies: { count: 500, minutes: 30000 },
			episodes: { count: 1500, minutes: 30000 },
			tracks: { count: 0, minutes: 0 }
		},
		decadeDistribution: [],
		seriesCompletion: [],
		topRewatches: [],
		marathonDay: null,
		watchStreak: null,
		yearComparison: null,
		topViewers: [{ rank: 1, userId: 1, username: 'TopUser', totalMinutes: 10000 }],
		longestBinge: null,
		firstWatch: null,
		lastWatch: null
	};
}

describe('Stats Serialization', () => {
	// =========================================================================
	// serializeStats
	// =========================================================================

	describe('serializeStats', () => {
		it('serializes UserStats to JSON string', () => {
			const stats = createValidUserStats();
			const json = serializeStats(stats);

			expect(typeof json).toBe('string');
			expect(json).toContain('"userId":1');
			expect(json).toContain('"year":2024');
		});

		it('serializes ServerStats to JSON string', () => {
			const stats = createValidServerStats();
			const json = serializeStats(stats);

			expect(typeof json).toBe('string');
			expect(json).toContain('"totalUsers":10');
			expect(json).toContain('"year":2024');
		});
	});

	// =========================================================================
	// parseUserStats
	// =========================================================================

	describe('parseUserStats', () => {
		it('parses valid UserStats JSON', () => {
			const stats = createValidUserStats();
			const json = JSON.stringify(stats);

			const parsed = parseUserStats(json);

			expect(parsed.userId).toBe(1);
			expect(parsed.year).toBe(2024);
			expect(parsed.totalWatchTimeMinutes).toBe(6000);
		});

		it('throws StatsParseError for invalid JSON', () => {
			try {
				parseUserStats('not valid json');
				expect.unreachable('Should have thrown');
			} catch (error) {
				expect(error).toBeInstanceOf(StatsParseError);
				expect((error as StatsParseError).message).toContain('Invalid JSON string');
			}
		});

		it('throws StatsParseError for invalid UserStats structure', () => {
			const invalidStats = { notAUserStats: true };

			try {
				parseUserStats(JSON.stringify(invalidStats));
				expect.unreachable('Should have thrown');
			} catch (error) {
				expect(error).toBeInstanceOf(StatsParseError);
				expect((error as StatsParseError).message).toContain('Invalid UserStats');
			}
		});

		it('throws StatsParseError for missing required field', () => {
			const stats = createValidUserStats();
			const { userId, ...statsWithoutUserId } = stats;

			try {
				parseUserStats(JSON.stringify(statsWithoutUserId));
				expect.unreachable('Should have thrown');
			} catch (error) {
				expect(error).toBeInstanceOf(StatsParseError);
			}
		});
	});

	// =========================================================================
	// parseServerStats
	// =========================================================================

	describe('parseServerStats', () => {
		it('parses valid ServerStats JSON', () => {
			const stats = createValidServerStats();
			const json = JSON.stringify(stats);

			const parsed = parseServerStats(json);

			expect(parsed.totalUsers).toBe(10);
			expect(parsed.year).toBe(2024);
		});

		it('throws StatsParseError for invalid JSON', () => {
			try {
				parseServerStats('{invalid');
				expect.unreachable('Should have thrown');
			} catch (error) {
				expect(error).toBeInstanceOf(StatsParseError);
				expect((error as StatsParseError).message).toContain('Invalid JSON string');
			}
		});

		it('throws StatsParseError for invalid ServerStats structure', () => {
			const invalidStats = { someField: 'value' };

			try {
				parseServerStats(JSON.stringify(invalidStats));
				expect.unreachable('Should have thrown');
			} catch (error) {
				expect(error).toBeInstanceOf(StatsParseError);
				expect((error as StatsParseError).message).toContain('Invalid ServerStats');
			}
		});
	});

	// =========================================================================
	// parseStats (auto-detection)
	// =========================================================================

	describe('parseStats', () => {
		it('detects and parses UserStats based on userId field', () => {
			const stats = createValidUserStats();
			const json = JSON.stringify(stats);

			const parsed = parseStats(json);

			expect('userId' in parsed).toBe(true);
			expect((parsed as UserStats).userId).toBe(1);
		});

		it('detects and parses ServerStats based on totalUsers field', () => {
			const stats = createValidServerStats();
			const json = JSON.stringify(stats);

			const parsed = parseStats(json);

			expect('totalUsers' in parsed).toBe(true);
			expect((parsed as ServerStats).totalUsers).toBe(10);
		});

		it('throws StatsParseError for invalid JSON', () => {
			try {
				parseStats('not json');
				expect.unreachable('Should have thrown');
			} catch (error) {
				expect(error).toBeInstanceOf(StatsParseError);
				expect((error as StatsParseError).message).toContain('Invalid JSON string');
			}
		});

		it('throws StatsParseError when neither userId nor totalUsers present', () => {
			const ambiguousData = {
				year: 2024,
				totalWatchTimeMinutes: 1000,
				totalPlays: 50,
				topMovies: [],
				topShows: [],
				topGenres: [],
				watchTimeByMonth: { minutes: Array(12).fill(0), plays: Array(12).fill(0) },
				watchTimeByHour: { minutes: Array(24).fill(0), plays: Array(24).fill(0) },
				longestBinge: null,
				firstWatch: null,
				lastWatch: null
			};

			try {
				parseStats(JSON.stringify(ambiguousData));
				expect.unreachable('Should have thrown');
			} catch (error) {
				expect(error).toBeInstanceOf(StatsParseError);
				expect((error as StatsParseError).message).toContain('Unable to determine stats type');
			}
		});

		it('throws StatsParseError for non-object JSON (array)', () => {
			try {
				parseStats(JSON.stringify([1, 2, 3]));
				expect.unreachable('Should have thrown');
			} catch (error) {
				expect(error).toBeInstanceOf(StatsParseError);
				expect((error as StatsParseError).message).toContain('Unable to determine stats type');
			}
		});

		it('throws StatsParseError for null JSON', () => {
			try {
				parseStats('null');
				expect.unreachable('Should have thrown');
			} catch (error) {
				expect(error).toBeInstanceOf(StatsParseError);
				expect((error as StatsParseError).message).toContain('Unable to determine stats type');
			}
		});

		it('throws StatsParseError for primitive JSON (string)', () => {
			try {
				parseStats('"just a string"');
				expect.unreachable('Should have thrown');
			} catch (error) {
				expect(error).toBeInstanceOf(StatsParseError);
				expect((error as StatsParseError).message).toContain('Unable to determine stats type');
			}
		});

		it('throws StatsParseError for primitive JSON (number)', () => {
			try {
				parseStats('42');
				expect.unreachable('Should have thrown');
			} catch (error) {
				expect(error).toBeInstanceOf(StatsParseError);
				expect((error as StatsParseError).message).toContain('Unable to determine stats type');
			}
		});

		it('throws StatsParseError when userId present but validation fails', () => {
			const invalidUserStats = {
				userId: 'not a number', // Should be number
				year: 2024
			};

			try {
				parseStats(JSON.stringify(invalidUserStats));
				expect.unreachable('Should have thrown');
			} catch (error) {
				expect(error).toBeInstanceOf(StatsParseError);
				expect((error as StatsParseError).message).toContain('Invalid UserStats');
			}
		});

		it('throws StatsParseError when totalUsers present but validation fails', () => {
			const invalidServerStats = {
				totalUsers: 'not a number', // Should be number
				year: 2024
			};

			try {
				parseStats(JSON.stringify(invalidServerStats));
				expect.unreachable('Should have thrown');
			} catch (error) {
				expect(error).toBeInstanceOf(StatsParseError);
				expect((error as StatsParseError).message).toContain('Invalid ServerStats');
			}
		});
	});

	// =========================================================================
	// roundTripStats
	// =========================================================================

	describe('roundTripStats', () => {
		it('round-trips UserStats correctly', () => {
			const original = createValidUserStats();
			const roundTripped = roundTripStats(original);

			expect(roundTripped).toEqual(original);
		});

		it('round-trips ServerStats correctly', () => {
			const original = createValidServerStats();
			const roundTripped = roundTripStats(original);

			expect(roundTripped).toEqual(original);
		});

		it('preserves all fields through round-trip', () => {
			const original = createValidUserStats();
			original.longestBinge = {
				startTime: 1704067200,
				endTime: 1704085200,
				plays: 6,
				totalMinutes: 300
			};
			original.firstWatch = {
				title: 'First Movie',
				viewedAt: 1704067200,
				thumb: '/thumb.jpg',
				type: 'movie'
			};

			const roundTripped = roundTripStats(original) as UserStats;

			expect(roundTripped.longestBinge).toEqual(original.longestBinge);
			expect(roundTripped.firstWatch).toEqual(original.firstWatch);
		});
	});

	// =========================================================================
	// StatsParseError
	// =========================================================================

	describe('StatsParseError', () => {
		it('includes cause when provided', () => {
			const cause = new Error('Original error');
			const error = new StatsParseError('Parse failed', cause);

			expect(error.message).toBe('Parse failed');
			expect(error.cause).toBe(cause);
			expect(error.name).toBe('StatsParseError');
		});

		it('works without cause', () => {
			const error = new StatsParseError('Parse failed');

			expect(error.message).toBe('Parse failed');
			expect(error.cause).toBeUndefined();
		});
	});
});
