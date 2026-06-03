import { describe, expect, it } from 'bun:test';
import { formatWatchHours } from '$lib/stats/format';

/**
 * ISSUE-011 — the admin dashboard ("Hours Watched") and the Wrapped
 * "Total Time" slide must report identical hours for the same
 * `totalWatchTimeMinutes`. They previously drifted (Math.round vs
 * Math.floor); formatWatchHours is now the single rounding authority.
 */
describe('formatWatchHours', () => {
	it('rounds minutes to the nearest hour', () => {
		expect(formatWatchHours(120)).toBe(2);
		// 6029 min = 100.48h -> 100h (the dashboard/slide drift case)
		expect(formatWatchHours(6029)).toBe(100);
		// 6030 min = 100.5h -> 101h (rounds up at the half)
		expect(formatWatchHours(6030)).toBe(101);
		// 90 min = 1.5h -> 2h
		expect(formatWatchHours(90)).toBe(2);
		// 89 min = 1.48h -> 1h
		expect(formatWatchHours(89)).toBe(1);
	});

	it('returns 0 for zero, negative, or non-finite input', () => {
		expect(formatWatchHours(0)).toBe(0);
		expect(formatWatchHours(-50)).toBe(0);
		expect(formatWatchHours(Number.NaN)).toBe(0);
		expect(formatWatchHours(Number.POSITIVE_INFINITY)).toBe(0);
	});
});
