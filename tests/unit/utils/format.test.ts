import { describe, expect, it } from 'bun:test';
import { formatWatchHours } from '$lib/stats/format';
import { formatDuration, maskEmail } from '$lib/utils/format';

const { isOccConflict } = await import('$lib/utils/occ-form');

describe('format helpers', () => {
	it.each([
		[0, '<1s'],
		[500, '<1s'],
		[1_500, '1s'],
		[120_000, '2m'],
		[2 * 3_600_000, '2h']
	] as const)('formatDuration(%s) -> %s', (duration, expected) => {
		expect(formatDuration(duration)).toBe(expected);
	});

	it.each([
		['jane@example.com', 'j***@e***.com'],
		['a@example.com', 'a@e***.com'],
		['alice@mail.example.co.uk', 'a***@m***.example.co.uk'],
		['no-at-sign', '***'],
		['', ''],
		['user@localhost', 'u***@***']
	] as const)('maskEmail(%p) -> %p', (email, expected) => {
		expect(maskEmail(email)).toBe(expected);
	});

	it.each([
		[120, 2],
		[6029, 100],
		[6030, 101],
		[90, 2],
		[89, 1],
		[0, 0],
		[-50, 0],
		[Number.NaN, 0],
		[Number.POSITIVE_INFINITY, 0]
	] as const)('formatWatchHours(%s) -> %s', (minutes, expected) => {
		expect(formatWatchHours(minutes)).toBe(expected);
	});
});

describe('isOccConflict', () => {
	it.each([
		[{ conflict: true }, true],
		[{ conflict: true, error: 'Settings changed in another tab.' }, true],
		[{ code: '__OCC_CONFLICT__' }, true],
		[{ error: 'reload', code: '__OCC_CONFLICT__' }, true],
		[{ conflict: false }, false],
		[{ error: 'Invalid input' }, false],
		[{ code: 'SOME_OTHER_CODE' }, false],
		[{}, false],
		[undefined, false],
		[null, false]
	] as const)('classifies %p as conflict=%s', (payload, expected) => {
		expect(isOccConflict(payload)).toBe(expected);
	});
});
