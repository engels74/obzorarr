import { describe, expect, it } from 'bun:test';
import { optionalTrimmed } from '$lib/server/admin/zod-helpers';

describe('optionalTrimmed', () => {
	const schema = optionalTrimmed(100);

	it('returns undefined for undefined input', () => {
		expect(schema.parse(undefined)).toBeUndefined();
	});

	it('returns undefined for empty string', () => {
		expect(schema.parse('')).toBeUndefined();
	});

	it('returns undefined for whitespace-only input', () => {
		expect(schema.parse('   ')).toBeUndefined();
	});

	it('returns undefined for tab/newline-only input', () => {
		expect(schema.parse('\t\n  ')).toBeUndefined();
	});

	it('trims surrounding whitespace', () => {
		expect(schema.parse('  sk-abc  ')).toBe('sk-abc');
	});

	it('preserves valid input', () => {
		expect(schema.parse('gpt-5-mini')).toBe('gpt-5-mini');
	});

	it('rejects strings exceeding max length (counted before trim)', () => {
		expect(() => schema.parse('x'.repeat(101))).toThrow();
	});
});
