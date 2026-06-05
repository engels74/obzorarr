import { describe, expect, it } from 'bun:test';

const { isOccConflict } = await import('$lib/utils/occ-form');

describe('isOccConflict — dual-shape OCC conflict predicate', () => {
	it('returns true for the inline-OCC shape ({ conflict: true })', () => {
		expect(isOccConflict({ conflict: true })).toBe(true);
		expect(isOccConflict({ conflict: true, error: 'Settings changed in another tab.' })).toBe(true);
	});

	it('returns true for the external-OCC shape ({ code: "__OCC_CONFLICT__" })', () => {
		// appearance's z.enum actions return this shape with NO `conflict` field.
		expect(isOccConflict({ code: '__OCC_CONFLICT__' })).toBe(true);
		expect(isOccConflict({ error: 'reload', code: '__OCC_CONFLICT__' })).toBe(true);
	});

	it('returns false for non-conflict failures and empty/missing payloads', () => {
		expect(isOccConflict({ conflict: false })).toBe(false);
		expect(isOccConflict({ error: 'Invalid input' })).toBe(false);
		expect(isOccConflict({ code: 'SOME_OTHER_CODE' })).toBe(false);
		expect(isOccConflict({})).toBe(false);
		expect(isOccConflict(undefined)).toBe(false);
		expect(isOccConflict(null)).toBe(false);
	});
});
