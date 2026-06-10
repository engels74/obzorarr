import { describe, expect, it } from 'bun:test';
import { parseSlideHash } from '../../../src/lib/utils/slide-hash';

describe('parseSlideHash (ISSUE-001 deep-link parser)', () => {
	it('parses a valid #slide=N hash to its index', () => {
		expect(parseSlideHash('#slide=3', 10)).toBe(3);
		expect(parseSlideHash('#slide=0', 10)).toBe(0);
	});

	it('returns 0 for a non-matching or empty hash', () => {
		expect(parseSlideHash('', 10)).toBe(0);
		expect(parseSlideHash('#', 10)).toBe(0);
		expect(parseSlideHash('#slide=', 10)).toBe(0);
		expect(parseSlideHash('#slide=abc', 10)).toBe(0);
		expect(parseSlideHash('#other=2', 10)).toBe(0);
		expect(parseSlideHash('#slide=2x', 10)).toBe(0);
	});

	it('clamps an out-of-range index to the last slide', () => {
		expect(parseSlideHash('#slide=99', 8)).toBe(7);
		expect(parseSlideHash('#slide=8', 8)).toBe(7);
	});

	it('clamps to 0 when there are no slides', () => {
		expect(parseSlideHash('#slide=3', 0)).toBe(0);
	});

	it('rejects negative and signed values (regex only matches digits)', () => {
		expect(parseSlideHash('#slide=-1', 10)).toBe(0);
		expect(parseSlideHash('#slide=+2', 10)).toBe(0);
	});
});
