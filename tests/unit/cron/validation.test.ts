import { describe, expect, it } from 'bun:test';
import { CRON_ALLOWED_CHARS_MESSAGE, validateCronExpression } from '$lib/cron/validation';

describe('validateCronExpression', () => {
	it('accepts ordinary space-separated cron expressions', () => {
		expect(validateCronExpression('0 0 * * *')).toBe('');
	});

	it('rejects tab and newline separators', () => {
		for (const expression of ['0\t0 * * *', '0 0\n* * *', '0 0\r\n* * *']) {
			expect(validateCronExpression(expression)).toBe(CRON_ALLOWED_CHARS_MESSAGE);
		}
	});
});
