import { afterEach, describe, expect, it } from 'bun:test';
import { getTableConfig } from 'drizzle-orm/sqlite-core';
import { env } from '$env/dynamic/private';
import { shouldUseRedirectAuth } from '$lib/client/auth-mode';
import {
	CRON_ALLOWED_CHARS_MESSAGE,
	CRON_FIELD_COUNT_MESSAGE,
	CRON_RANGE_MESSAGE,
	CRON_REQUIRED_MESSAGE,
	validateCronExpression
} from '$lib/cron/validation';
import { optionalTrimmed } from '$lib/server/admin/zod-helpers';
import { sqlite } from '$lib/server/db/client';
import { cachedStats, shareSettings } from '$lib/server/db/schema';
import { getAppVersion } from '$lib/server/version';
import { formatWatchHours } from '$lib/stats/format';
import { formatDuration, maskEmail } from '$lib/utils/format';
import pkg from '../../package.json';
import { match as matchYear } from '../../src/params/year';
import { sharedTestDbTables } from '../helpers/db';

const { isOccConflict } = await import('$lib/utils/occ-form');
const envAny = env as Record<string, string | undefined>;

const REAL_CHROME_UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const HEADLESS_CHROME_UA =
	'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0.0.0 Safari/537.36';

interface SqliteTableInfo {
	name: string;
}

interface TestNavigator {
	webdriver?: boolean;
	userAgent?: string;
}

function createNavigator(overrides: TestNavigator = {}): TestNavigator {
	return {
		webdriver: overrides.webdriver ?? false,
		userAgent: overrides.userAgent ?? REAL_CHROME_UA
	};
}

function quoteIdentifier(identifier: string): string {
	return `"${identifier.replaceAll('"', '""')}"`;
}

function getActualColumnNames(tableName: string): string[] {
	return sqlite
		.query<SqliteTableInfo, []>(`PRAGMA table_info(${quoteIdentifier(tableName)})`)
		.all()
		.map((column) => column.name)
		.sort();
}

afterEach(() => {
	delete envAny.COMMIT_TAG;
});

describe('core client/server utility contracts', () => {
	describe('shouldUseRedirectAuth', () => {
		it.each([
			['auth=redirect', createNavigator(), true],
			['auth=popup', createNavigator({ webdriver: true, userAgent: HEADLESS_CHROME_UA }), false],
			['', createNavigator({ webdriver: true }), true],
			['', createNavigator({ userAgent: HEADLESS_CHROME_UA }), true],
			['', createNavigator(), false],
			['', null, false]
		] as const)('returns %s for params=%p navigator=%p', (params, navigator, expected) => {
			expect(shouldUseRedirectAuth(new URLSearchParams(params), navigator)).toBe(expected);
		});

		it.each([
			'Playwright/1.44',
			'Puppeteer/22.0',
			'Selenium/4.0'
		] as const)('redirects for automation user agent %s', (tool) => {
			expect(
				shouldUseRedirectAuth(
					new URLSearchParams(),
					createNavigator({ userAgent: `Mozilla/5.0 ${tool}` })
				)
			).toBe(true);
		});
	});

	describe('route params and versioning', () => {
		it.each([
			['2026', true],
			['2000', true],
			['9999', true],
			['0000', true],
			['2026.5', false],
			['2026abc', false],
			['2026e1', false],
			['20266', false],
			['202', false],
			['26', false],
			['abc', false],
			['', false]
		] as const)('year matcher returns %s for %p', (segment, expected) => {
			expect(matchYear(segment)).toBe(expected);
		});

		it.each([
			[undefined, { kind: 'dev', display: `v${pkg.version}` }],
			['0.1.10', { kind: 'release', display: 'v0.1.10' }],
			['v1.2.3', { kind: 'release', display: 'v1.2.3' }],
			[
				'c465277744366334c082ae4105e5c53d4a12b9b7',
				{ kind: 'nightly', display: 'nightly · c465277' }
			],
			['abcdef0', { kind: 'nightly', display: 'nightly · abcdef0' }],
			['weird-tag-name', { kind: 'dev', display: 'weird-tag-name' }],
			['  0.1.10  ', { kind: 'release', display: 'v0.1.10' }],
			['0.1.10-beta', { kind: 'dev', display: '0.1.10-beta' }],
			['v1.2.3foo', { kind: 'dev', display: 'v1.2.3foo' }]
		] as const)('classifies COMMIT_TAG=%p', (tag, expected) => {
			if (tag === undefined) delete envAny.COMMIT_TAG;
			else envAny.COMMIT_TAG = tag;
			expect(getAppVersion()).toEqual(expected);
		});
	});

	describe('validation and formatting helpers', () => {
		it.each([
			'0 0 * * *',
			'59 23 31 12 7',
			'* * * * *',
			'*/5 * * * *',
			'0/15 * * * *',
			'1-5 * * * *',
			'0,15,30,45 * * * *',
			'1-5/2 * * * *'
		] as const)('accepts cron %s', (expression) => {
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
		] as const)('rejects cron %s', (_name, expression, expectedMessage) => {
			expect(validateCronExpression(expression)).toBe(expectedMessage);
		});

		it.each([
			[undefined, undefined],
			['', undefined],
			['   ', undefined],
			['\t\n  ', undefined],
			['  sk-abc  ', 'sk-abc'],
			['gpt-5-mini', 'gpt-5-mini']
		] as const)('optionalTrimmed parses %p as %p', (input, expected) => {
			expect(optionalTrimmed(100).parse(input)).toBe(expected);
		});

		it('optionalTrimmed rejects strings exceeding max length', () => {
			expect(() => optionalTrimmed(100).parse('x'.repeat(101))).toThrow();
		});
	});

	describe('display formatting', () => {
		it.each([
			['duration', formatDuration, 0, '<1s'],
			['duration', formatDuration, 500, '<1s'],
			['duration', formatDuration, 1_500, '1s'],
			['duration', formatDuration, 120_000, '2m'],
			['duration', formatDuration, 2 * 3_600_000, '2h'],
			['watch hours', formatWatchHours, 120, 2],
			['watch hours', formatWatchHours, 6029, 100],
			['watch hours', formatWatchHours, 6030, 101],
			['watch hours', formatWatchHours, 90, 2],
			['watch hours', formatWatchHours, 89, 1],
			['watch hours', formatWatchHours, 0, 0],
			['watch hours', formatWatchHours, -50, 0],
			['watch hours', formatWatchHours, Number.NaN, 0],
			['watch hours', formatWatchHours, Number.POSITIVE_INFINITY, 0]
		] as const)('%s formatter maps %s -> %s', (_name, formatter, input, expected) => {
			expect(formatter(input)).toBe(expected);
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
		] as const)('isOccConflict(%p) -> %s', (payload, expected) => {
			expect(isOccConflict(payload)).toBe(expected);
		});
	});

	describe('database schema', () => {
		it('keeps only intentional foreign-key differences', () => {
			expect(getTableConfig(cachedStats).foreignKeys).toHaveLength(0);

			const shareConfig = getTableConfig(shareSettings);
			const foreignKey = shareConfig.foreignKeys[0];
			const reference = foreignKey?.reference();
			expect(shareConfig.foreignKeys).toHaveLength(1);
			expect(foreignKey?.getName()).toBe('share_settings_user_id_users_id_fk');
			expect(reference?.columns.map((column) => column.name)).toEqual(['user_id']);
			expect(reference?.foreignColumns.map((column) => column.name)).toEqual(['id']);
			expect(foreignKey?.onDelete).toBe('cascade');
		});

		it('creates the same table columns as the Drizzle app schema', () => {
			for (const table of Object.values(sharedTestDbTables)) {
				const config = getTableConfig(table);
				expect(getActualColumnNames(config.name)).toEqual(
					config.columns.map((column) => column.name).sort()
				);
			}
		});
	});
});
