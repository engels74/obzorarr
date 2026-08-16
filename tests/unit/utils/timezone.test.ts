import { describe, expect, it } from 'bun:test';
import {
	DEFAULT_TIMEZONE,
	isSupportedTimezone,
	listSupportedTimezones,
	normalizeTimezone,
	TIMEZONE_REQUIRED_MESSAGE,
	TIMEZONE_UNKNOWN_MESSAGE,
	validateTimezone
} from '$lib/cron/timezone';

describe('normalizeTimezone', () => {
	it.each([
		['Europe/Copenhagen', 'Europe/Copenhagen'],
		['europe/copenhagen', 'Europe/Copenhagen'],
		['  Europe/Copenhagen  ', 'Europe/Copenhagen'],
		['utc', 'UTC'],
		['America/New_York', 'America/New_York']
	])('canonicalizes %p to %p', (input, expected) => {
		expect(normalizeTimezone(input)).toBe(expected);
	});

	it.each([
		['', 'empty'],
		['   ', 'blank'],
		['Not/AZone', 'unknown identifier'],
		['Etc/UTC+2', 'malformed identifier']
	])('rejects %p (%s)', (input) => {
		expect(normalizeTimezone(input)).toBeNull();
	});

	// A fixed offset has no DST rules, so "midnight local time" would be wrong for
	// half the year. Intl.DateTimeFormat accepts these, which is why the zone
	// table is the predicate instead.
	it.each(['+02:00', '-05:00', 'GMT+2'])('rejects the fixed offset %p', (offset) => {
		expect(normalizeTimezone(offset)).toBeNull();
		expect(isSupportedTimezone(offset)).toBe(false);
	});
});

describe('validateTimezone', () => {
	it('accepts a known zone', () => {
		expect(validateTimezone('Europe/Copenhagen')).toBe('');
	});

	it('reports a blank value as required', () => {
		expect(validateTimezone('  ')).toBe(TIMEZONE_REQUIRED_MESSAGE);
	});

	it('reports an unknown zone', () => {
		expect(validateTimezone('Mars/Olympus_Mons')).toBe(TIMEZONE_UNKNOWN_MESSAGE);
	});
});

describe('listSupportedTimezones', () => {
	it('is sorted, deduplicated and contains the default zone', () => {
		const zones = listSupportedTimezones();

		expect(zones).toContain(DEFAULT_TIMEZONE);
		expect(zones).toContain('Europe/Copenhagen');
		expect(new Set(zones).size).toBe(zones.length);
		expect(zones).toEqual([...zones].sort((a, b) => a.localeCompare(b)));
	});

	it('only lists identifiers the normalizer accepts', () => {
		for (const zone of listSupportedTimezones()) {
			expect(normalizeTimezone(zone)).toBe(zone);
		}
	});
});
