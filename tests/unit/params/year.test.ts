import { describe, expect, it } from 'bun:test';
import { match } from '../../../src/params/year';

describe('year param matcher', () => {
	it('accepts exactly four digits', () => {
		expect(match('2026')).toBe(true);
		expect(match('2000')).toBe(true);
		expect(match('9999')).toBe(true);
		expect(match('0000')).toBe(true);
	});

	it('rejects a float-like segment (DF-008: parseInt false positive)', () => {
		expect(match('2026.5')).toBe(false);
	});

	it('rejects alpha-suffixed segment (DF-008: parseInt false positive)', () => {
		expect(match('2026abc')).toBe(false);
	});

	it('rejects scientific-notation-like segment (DF-008: parseInt false positive)', () => {
		expect(match('2026e1')).toBe(false);
	});

	it('rejects more than four digits', () => {
		expect(match('20266')).toBe(false);
	});

	it('rejects fewer than four digits', () => {
		expect(match('202')).toBe(false);
		expect(match('26')).toBe(false);
	});

	it('rejects non-numeric strings', () => {
		expect(match('abc')).toBe(false);
		expect(match('')).toBe(false);
	});
});
