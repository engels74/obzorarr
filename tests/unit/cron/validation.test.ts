import { describe, expect, it } from 'bun:test';
import {
	CRON_ALLOWED_CHARS_MESSAGE,
	CRON_FIELD_COUNT_MESSAGE,
	CRON_RANGE_MESSAGE,
	CRON_REQUIRED_MESSAGE,
	validateCronExpression
} from '$lib/cron/validation';

describe('validateCronExpression', () => {
	it.each([
		'0 0 * * *',
		'59 23 31 12 7',
		'* * * * *',
		'*/5 * * * *',
		'0/15 * * * *',
		'1-5 * * * *',
		'0,15,30,45 * * * *',
		'1-5/2 * * * *'
	] as const)('accepts %s', (expression) => {
		expect(validateCronExpression(expression)).toBe('');
	});

	it.each([
		['blank expression', '   ', CRON_REQUIRED_MESSAGE],
		['too few fields', '0 0 * *', CRON_FIELD_COUNT_MESSAGE],
		['too many fields', '0 0 * * * *', CRON_FIELD_COUNT_MESSAGE],
		['tab separator', '0\t0 * * *', CRON_ALLOWED_CHARS_MESSAGE],
		['newline separator', '0 0\n* * *', CRON_ALLOWED_CHARS_MESSAGE],
		['carriage-return newline separator', '0 0\r\n* * *', CRON_ALLOWED_CHARS_MESSAGE],
		['alpha chars', 'nope', CRON_ALLOWED_CHARS_MESSAGE],
		['minute/hour overflow', '99 99 * * *', CRON_RANGE_MESSAGE],
		['minute 60', '60 * * * *', CRON_RANGE_MESSAGE],
		['hour 24', '0 24 * * *', CRON_RANGE_MESSAGE],
		['day-of-month 0', '0 0 0 * *', CRON_RANGE_MESSAGE],
		['day-of-month 32', '0 0 32 * *', CRON_RANGE_MESSAGE],
		['month 0', '0 0 * 0 *', CRON_RANGE_MESSAGE],
		['month 13', '0 0 * 13 *', CRON_RANGE_MESSAGE],
		['day-of-week 8', '0 0 * * 8', CRON_RANGE_MESSAGE],
		['out-of-range list value', '0,60 * * * *', CRON_RANGE_MESSAGE],
		['out-of-range range upper bound', '0-60 * * * *', CRON_RANGE_MESSAGE],
		['empty step base', '/5 * * * *', CRON_RANGE_MESSAGE],
		['empty range lower bound', '-1 * * * *', CRON_RANGE_MESSAGE],
		['empty range upper bound', '1- * * * *', CRON_RANGE_MESSAGE],
		['extra range segment', '1-5-2 * * * *', CRON_RANGE_MESSAGE],
		['trailing empty list segment', '1, * * * *', CRON_RANGE_MESSAGE],
		['leading empty list segment', ',5 * * * *', CRON_RANGE_MESSAGE],
		['interior empty list segment', '1,,2 * * * *', CRON_RANGE_MESSAGE]
	] as const)('rejects %s', (_name, expression, expectedMessage) => {
		expect(validateCronExpression(expression)).toBe(expectedMessage);
	});
});
