/**
 * Unit tests for Statistics Types Module
 *
 * Tests the type guards and Zod schemas for UserStats and ServerStats.
 */

import { describe, expect, it } from 'bun:test';

import { isUserStats, isServerStats } from '$lib/server/stats/types';
import type { UserStats, ServerStats } from '$lib/server/stats/types';

// =============================================================================
// Test Helpers
// =============================================================================

function createMockUserStats(overrides: Partial<UserStats> = {}): UserStats {
	return {
		userId: 1,
		year: 2024,
		totalWatchTimeMinutes: 6000,
		totalPlays: 200,
		topMovies: [{ rank: 1, title: 'Test Movie', count: 5, thumb: null }],
		topShows: [{ rank: 1, title: 'Test Show', count: 50, thumb: null }],
		topGenres: [],
		watchTimeByMonth: { minutes: Array(12).fill(500), plays: Array(12).fill(10) },
		watchTimeByHour: { minutes: Array(24).fill(250), plays: Array(24).fill(5) },
		percentileRank: 85,
		longestBinge: null,
		firstWatch: null,
		lastWatch: null,
		...overrides
	};
}

function createMockServerStats(overrides: Partial<ServerStats> = {}): ServerStats {
	return {
		year: 2024,
		totalUsers: 10,
		totalWatchTimeMinutes: 60000,
		totalPlays: 2000,
		topMovies: [{ rank: 1, title: 'Popular Movie', count: 50, thumb: null }],
		topShows: [{ rank: 1, title: 'Popular Show', count: 500, thumb: null }],
		topGenres: [],
		watchTimeByMonth: { minutes: Array(12).fill(5000), plays: Array(12).fill(100) },
		watchTimeByHour: { minutes: Array(24).fill(2500), plays: Array(24).fill(50) },
		topViewers: [{ rank: 1, userId: 1, username: 'TopUser', totalMinutes: 10000 }],
		longestBinge: null,
		firstWatch: null,
		lastWatch: null,
		...overrides
	};
}

// =============================================================================
// Type Guard Tests
// =============================================================================

describe('isUserStats', () => {
	it('returns true for UserStats objects', () => {
		const userStats = createMockUserStats();
		expect(isUserStats(userStats)).toBe(true);
	});

	it('returns true when userId and percentileRank are present', () => {
		const userStats = createMockUserStats({
			userId: 42,
			percentileRank: 95
		});
		expect(isUserStats(userStats)).toBe(true);
	});

	it('returns false for ServerStats objects', () => {
		const serverStats = createMockServerStats();
		expect(isUserStats(serverStats)).toBe(false);
	});

	it('returns false when percentileRank is missing', () => {
		const serverStats = createMockServerStats();
		// ServerStats has totalUsers and topViewers, not userId and percentileRank
		expect(isUserStats(serverStats)).toBe(false);
	});
});

describe('isServerStats', () => {
	it('returns true for ServerStats objects', () => {
		const serverStats = createMockServerStats();
		expect(isServerStats(serverStats)).toBe(true);
	});

	it('returns true when totalUsers and topViewers are present', () => {
		const serverStats = createMockServerStats({
			totalUsers: 25,
			topViewers: [
				{ rank: 1, userId: 1, username: 'User1', totalMinutes: 5000 },
				{ rank: 2, userId: 2, username: 'User2', totalMinutes: 4000 }
			]
		});
		expect(isServerStats(serverStats)).toBe(true);
	});

	it('returns false for UserStats objects', () => {
		const userStats = createMockUserStats();
		expect(isServerStats(userStats)).toBe(false);
	});

	it('returns false when topViewers is missing', () => {
		const userStats = createMockUserStats();
		// UserStats has userId and percentileRank, not totalUsers and topViewers
		expect(isServerStats(userStats)).toBe(false);
	});
});
