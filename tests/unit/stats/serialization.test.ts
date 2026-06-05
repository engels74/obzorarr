import { describe, expect, it } from 'bun:test';
import {
	parseServerStats,
	parseStats,
	parseUserStats,
	roundTripStats,
	StatsParseError,
	serializeStats
} from '$lib/server/stats/serialization';
import {
	hasWatchHistory,
	isServerStats,
	isUserStats,
	type ServerStats,
	type UserStats
} from '$lib/server/stats/types';

const ranked = [{ rank: 1, title: 'Example', count: 5, thumb: null }];
const distribution = (length: number, value: number) => ({
	minutes: Array(length).fill(value),
	plays: Array(length).fill(1)
});
const commonStats = {
	year: 2024,
	totalWatchTimeMinutes: 6000,
	totalPlays: 200,
	topMovies: ranked,
	topShows: ranked,
	topGenres: ranked,
	watchTimeByMonth: distribution(12, 500),
	watchTimeByHour: distribution(24, 250),
	watchTimeByWeekday: distribution(7, 857),
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
	longestBinge: null,
	firstWatch: null,
	lastWatch: null
} satisfies Omit<UserStats, 'userId' | 'percentileRank'>;

function userStats(overrides: Partial<UserStats> = {}): UserStats {
	return { ...commonStats, userId: 1, percentileRank: 85, ...overrides };
}

function serverStats(overrides: Partial<ServerStats> = {}): ServerStats {
	return {
		...commonStats,
		totalUsers: 10,
		topViewers: [{ rank: 1, userId: 1, username: 'TopUser', totalMinutes: 10000 }],
		...overrides
	};
}

function expectStatsParseError(action: () => unknown, message?: string) {
	try {
		action();
		expect.unreachable('Expected StatsParseError');
	} catch (error) {
		expect(error).toBeInstanceOf(StatsParseError);
		if (message) expect((error as StatsParseError).message).toContain(message);
	}
}

describe('stats type guards', () => {
	it.each([
		['user stats', isUserStats, userStats(), true],
		['server stats as user stats', isUserStats, serverStats(), false],
		['server stats', isServerStats, serverStats({ totalUsers: 25 }), true],
		['user stats as server stats', isServerStats, userStats(), false]
	] as const)('%s -> %s', (_name, guard, stats, expected) => {
		expect(guard(stats)).toBe(expected);
	});

	it.each([
		[userStats({ totalPlays: 1, totalWatchTimeMinutes: 0 }), true],
		[serverStats({ totalPlays: 0, totalWatchTimeMinutes: 30 }), true],
		[userStats({ totalPlays: 0, totalWatchTimeMinutes: 0 }), false]
	] as const)('hasWatchHistory(%p) -> %s', (stats, expected) => {
		expect(hasWatchHistory(stats)).toBe(expected);
	});
});

describe('stats serialization contracts', () => {
	it.each([
		['user', userStats(), parseUserStats, 'userId', 1],
		['server', serverStats(), parseServerStats, 'totalUsers', 10]
	] as const)('serializes, parses, auto-detects, and round-trips %s stats', (_name, stats, parser, key, value) => {
		const json = serializeStats(stats);
		const parsed = parser(json);
		const detected = parseStats(json);

		expect(json).toContain(`"${key}":${value}`);
		expect(parsed).toEqual(stats);
		expect(detected).toEqual(stats);
		expect(roundTripStats(stats)).toEqual(stats);
	});

	it('preserves nullable rich fields through round-trip', () => {
		const original = userStats({
			longestBinge: { startTime: 1704067200, endTime: 1704085200, plays: 6, totalMinutes: 300 },
			firstWatch: { title: 'First Movie', viewedAt: 1704067200, thumb: '/thumb.jpg', type: 'movie' }
		});

		expect(roundTripStats(original)).toEqual(original);
	});

	it.each([
		['parseUserStats invalid JSON', () => parseUserStats('not valid json'), 'Invalid JSON string'],
		[
			'parseUserStats invalid structure',
			() => parseUserStats(JSON.stringify({ ...userStats(), userId: undefined })),
			'Invalid UserStats'
		],
		['parseServerStats invalid JSON', () => parseServerStats('{invalid'), 'Invalid JSON string'],
		[
			'parseServerStats invalid structure',
			() => parseServerStats(JSON.stringify({ someField: 'value' })),
			'Invalid ServerStats'
		],
		['parseStats invalid JSON', () => parseStats('not json'), 'Invalid JSON string'],
		[
			'parseStats ambiguous object',
			() => parseStats(JSON.stringify({ year: 2024 })),
			'Unable to determine stats type'
		],
		[
			'parseStats array',
			() => parseStats(JSON.stringify([1, 2, 3])),
			'Unable to determine stats type'
		],
		['parseStats null', () => parseStats('null'), 'Unable to determine stats type'],
		['parseStats string', () => parseStats('"just a string"'), 'Unable to determine stats type'],
		['parseStats number', () => parseStats('42'), 'Unable to determine stats type'],
		[
			'parseStats invalid user branch',
			() => parseStats(JSON.stringify({ ...userStats(), userId: 'not a number' })),
			'Invalid UserStats'
		],
		[
			'parseStats invalid server branch',
			() => parseStats(JSON.stringify({ ...serverStats(), totalUsers: 'not a number' })),
			'Invalid ServerStats'
		]
	] as const)('%s throws StatsParseError', (_name, action, message) => {
		expectStatsParseError(action, message);
	});

	it.each([
		['with cause', new Error('Original error')],
		['without cause', undefined]
	] as const)('StatsParseError works %s', (_name, cause) => {
		const error = new StatsParseError('Parse failed', cause);
		expect(error).toMatchObject({ message: 'Parse failed', name: 'StatsParseError', cause });
	});
});
