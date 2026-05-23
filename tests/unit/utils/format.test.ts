import { describe, expect, it } from 'bun:test';
import { formatDuration, maskEmail } from '$lib/utils/format';

describe('formatDuration', () => {
	it('uses <1s for sub-second values', () => {
		expect(formatDuration(0)).toBe('<1s');
		expect(formatDuration(500)).toBe('<1s');
	});
	it('renders seconds, minutes, hours by magnitude', () => {
		expect(formatDuration(1_500)).toBe('1s');
		expect(formatDuration(120_000)).toBe('2m');
		expect(formatDuration(2 * 3_600_000)).toBe('2h');
	});
});

describe('maskEmail', () => {
	it('masks a typical email', () => {
		expect(maskEmail('jane@example.com')).toBe('j***@e***.com');
	});

	it('handles single-character local parts without revealing the rest', () => {
		expect(maskEmail('a@example.com')).toBe('a@e***.com');
	});

	it('preserves multi-dot TLDs', () => {
		expect(maskEmail('alice@mail.example.co.uk')).toBe('a***@m***.example.co.uk');
	});

	it('falls back gracefully on malformed input', () => {
		expect(maskEmail('no-at-sign')).toBe('***');
		expect(maskEmail('')).toBe('');
	});

	it('handles domains without a dot', () => {
		expect(maskEmail('user@localhost')).toBe('u***@***');
	});
});
