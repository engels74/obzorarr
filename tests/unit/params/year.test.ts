import { describe, expect, it } from 'bun:test';
import { match } from '../../../src/params/year';

describe('year param matcher', () => {
	it.each(['2026', '2000', '9999', '0000'] as const)('accepts exactly four digits: %s', (year) => {
		expect(match(year)).toBe(true);
	});

	it.each([
		'2026.5',
		'2026abc',
		'2026e1',
		'20266',
		'202',
		'26',
		'abc',
		''
	] as const)('rejects non-four-digit segment %p', (segment) => {
		expect(match(segment)).toBe(false);
	});
});
