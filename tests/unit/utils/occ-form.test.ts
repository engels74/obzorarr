import { describe, expect, it, mock } from 'bun:test';

// occ-form.ts statically imports handleFormToast -> $lib/services/toast ->
// svelte-sonner. Mock the toast service BEFORE importing occ-form so the test
// resolves without pulling the Svelte/sonner runtime (mirrors
// tests/unit/lib/utils/form-toast-parity.test.ts).
mock.module('$lib/services/toast', () => ({
	toast: {
		success: () => {},
		error: () => {},
		warning: () => {},
		info: () => {}
	}
}));

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
