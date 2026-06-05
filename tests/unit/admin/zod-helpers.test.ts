import { describe, expect, it } from 'bun:test';
import { optionalTrimmed } from '$lib/server/admin/zod-helpers';

describe('optionalTrimmed', () => {
	const schema = optionalTrimmed(100);

	it.each([
		[undefined, undefined],
		['', undefined],
		['   ', undefined],
		['\t\n  ', undefined],
		['  sk-abc  ', 'sk-abc'],
		['gpt-5-mini', 'gpt-5-mini']
	] as const)('parses %p as %p', (input, expected) => {
		expect(schema.parse(input)).toBe(expected);
	});

	it('rejects strings exceeding max length (counted before trim)', () => {
		expect(() => schema.parse('x'.repeat(101))).toThrow();
	});
});
