import { describe, expect, it } from 'bun:test';
import {
	CRON_ALLOWED_CHARS_MESSAGE,
	CRON_RANGE_MESSAGE,
	validateCronExpression
} from '$lib/cron/validation';

describe('validateCronExpression', () => {
	it('accepts ordinary space-separated cron expressions', () => {
		expect(validateCronExpression('0 0 * * *')).toBe('');
	});

	it('rejects tab and newline separators', () => {
		for (const expression of ['0\t0 * * *', '0 0\n* * *', '0 0\r\n* * *']) {
			expect(validateCronExpression(expression)).toBe(CRON_ALLOWED_CHARS_MESSAGE);
		}
	});

	// ── Per-field range validation (E2) ──────────────────────────────────────

	describe('per-field range validation', () => {
		// Valid boundary values
		it('accepts minute 0 and 59', () => {
			expect(validateCronExpression('0 0 * * *')).toBe('');
			expect(validateCronExpression('59 0 * * *')).toBe('');
		});

		it('accepts hour 0 and 23', () => {
			expect(validateCronExpression('0 23 * * *')).toBe('');
		});

		it('accepts day-of-month 1 and 31', () => {
			expect(validateCronExpression('0 0 1 * *')).toBe('');
			expect(validateCronExpression('0 0 31 * *')).toBe('');
		});

		it('accepts month 1 and 12', () => {
			expect(validateCronExpression('0 0 * 1 *')).toBe('');
			expect(validateCronExpression('0 0 * 12 *')).toBe('');
		});

		it('accepts day-of-week 0 through 7 (0 and 7 are both Sunday)', () => {
			expect(validateCronExpression('0 0 * * 0')).toBe('');
			expect(validateCronExpression('0 0 * * 7')).toBe('');
		});

		it('accepts all-wildcard expression', () => {
			expect(validateCronExpression('* * * * *')).toBe('');
		});

		it('accepts a complete boundary expression: 0 0 31 12 7', () => {
			expect(validateCronExpression('0 0 31 12 7')).toBe('');
		});

		// Step syntax
		it('accepts step syntax: */5 * * * *', () => {
			expect(validateCronExpression('*/5 * * * *')).toBe('');
		});

		it('accepts step with base: 0/15 * * * *', () => {
			expect(validateCronExpression('0/15 * * * *')).toBe('');
		});

		it('accepts range syntax: 1-5 * * * *', () => {
			expect(validateCronExpression('1-5 * * * *')).toBe('');
		});

		it('accepts list syntax: 0,15,30,45 * * * *', () => {
			expect(validateCronExpression('0,15,30,45 * * * *')).toBe('');
		});

		it('accepts range-based step syntax: 1-5/2 * * * *', () => {
			expect(validateCronExpression('1-5/2 * * * *')).toBe('');
		});

		// Invalid cases — these must now be rejected client-side
		it('rejects minute 60 (99 99 * * *)', () => {
			expect(validateCronExpression('99 99 * * *')).toBe(CRON_RANGE_MESSAGE);
		});

		it('rejects minute 60', () => {
			expect(validateCronExpression('60 * * * *')).toBe(CRON_RANGE_MESSAGE);
		});

		it('rejects hour 24', () => {
			expect(validateCronExpression('0 24 * * *')).toBe(CRON_RANGE_MESSAGE);
		});

		it('rejects day-of-month 0', () => {
			expect(validateCronExpression('0 0 0 * *')).toBe(CRON_RANGE_MESSAGE);
		});

		it('rejects day-of-month 32', () => {
			expect(validateCronExpression('0 0 32 * *')).toBe(CRON_RANGE_MESSAGE);
		});

		it('rejects month 0', () => {
			expect(validateCronExpression('0 0 * 0 *')).toBe(CRON_RANGE_MESSAGE);
		});

		it('rejects month 13', () => {
			expect(validateCronExpression('0 0 * 13 *')).toBe(CRON_RANGE_MESSAGE);
		});

		it('rejects day-of-week 8', () => {
			expect(validateCronExpression('0 0 * * 8')).toBe(CRON_RANGE_MESSAGE);
		});

		it('rejects out-of-range value in a list: 0,60 * * * *', () => {
			expect(validateCronExpression('0,60 * * * *')).toBe(CRON_RANGE_MESSAGE);
		});

		it('rejects out-of-range upper bound in a range: 0-60 * * * *', () => {
			expect(validateCronExpression('0-60 * * * *')).toBe(CRON_RANGE_MESSAGE);
		});

		// Malformed step/range tokens — empty segments must not coerce to 0
		it('rejects step with empty base: /5 * * * *', () => {
			expect(validateCronExpression('/5 * * * *')).toBe(CRON_RANGE_MESSAGE);
		});

		it('rejects range with empty lower bound: -1 * * * *', () => {
			expect(validateCronExpression('-1 * * * *')).toBe(CRON_RANGE_MESSAGE);
		});

		it('rejects range with empty upper bound: 1- * * * *', () => {
			expect(validateCronExpression('1- * * * *')).toBe(CRON_RANGE_MESSAGE);
		});

		it('rejects range with extra segments: 1-5-2 * * * *', () => {
			expect(validateCronExpression('1-5-2 * * * *')).toBe(CRON_RANGE_MESSAGE);
		});
	});
});
