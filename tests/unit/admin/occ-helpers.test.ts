import { beforeEach, describe, expect, it } from 'bun:test';
import { externalOccCheck, inlineOccCheck } from '$lib/server/admin/occ-helpers';
import {
	AppSettingsKey,
	LOG_SETTINGS_KEYS,
	setAppSetting,
	UI_THEME_SETTINGS_KEYS
} from '$lib/server/admin/settings.service';
import { db } from '$lib/server/db/client';
import { appSettings } from '$lib/server/db/schema';
import { resetSharedTestDb } from '../../helpers/db';

describe('externalOccCheck', () => {
	beforeEach(async () => {
		await resetSharedTestDb();
	});

	it('returns conflict for blank submittedVersion (defends fresh-install loophole)', async () => {
		const result = await externalOccCheck('', UI_THEME_SETTINGS_KEYS);

		expect(result.status).toBe('conflict');
		// With no rows yet, `current` is the epoch sentinel so the client can
		// refresh to a known-old version and retry without a perpetual 409.
		expect((result as { current: string }).current).toBe(new Date(0).toISOString());
	});

	it('reports the real updatedAt for blank submittedVersion when rows exist', async () => {
		await setAppSetting(AppSettingsKey.UI_THEME, 'modern-minimal');

		const result = await externalOccCheck('', UI_THEME_SETTINGS_KEYS);

		expect(result.status).toBe('conflict');
		// With rows present, `current` must be the row's actual updatedAt — not
		// the epoch — so a client trusting the payload refreshes to the true
		// version instead of a perpetually-stale 1970 timestamp.
		const current = (result as { current: string }).current;
		expect(Date.parse(current)).toBeGreaterThan(0);
	});

	it('returns conflict for unparseable submittedVersion', async () => {
		const result = await externalOccCheck('not-a-date', UI_THEME_SETTINGS_KEYS);

		expect(result.status).toBe('conflict');
	});

	it('returns ok when submitted version is the epoch and no rows exist', async () => {
		// No-rows-yet case: maxMs is 0, epoch parses to 0, 0 < 0 is false → ok.
		const result = await externalOccCheck(new Date(0).toISOString(), UI_THEME_SETTINGS_KEYS);

		expect(result.status).toBe('ok');
	});

	it('returns conflict when submitted version is stale (older than current row updatedAt)', async () => {
		await setAppSetting(AppSettingsKey.UI_THEME, 'modern-minimal');

		// setAppSetting just wrote the row at ~Date.now(); the epoch is older.
		const result = await externalOccCheck(new Date(0).toISOString(), UI_THEME_SETTINGS_KEYS);

		expect(result.status).toBe('conflict');
		// `current` reflects the row's actual updatedAt so the client can refresh
		// its local version after the conflict.
		const current = (result as { current: string }).current;
		expect(Date.parse(current)).toBeGreaterThan(0);
	});

	it('returns ok when submitted version is fresh (>= current row updatedAt)', async () => {
		await setAppSetting(AppSettingsKey.UI_THEME, 'modern-minimal');

		const futureVersion = new Date(Date.now() + 60_000).toISOString();
		const result = await externalOccCheck(futureVersion, UI_THEME_SETTINGS_KEYS);

		expect(result.status).toBe('ok');
	});

	it('returns ok when submitted version equals current row updatedAt (boundary)', async () => {
		await setAppSetting(AppSettingsKey.UI_THEME, 'modern-minimal');

		// Read the freshly-bumped timestamp back out via a 2nd write — too racy
		// to compute at ms resolution. Instead, send a clearly-future-or-equal
		// timestamp and verify the boundary passes. The < (strict) comparison in
		// externalOccCheck means equal-millisecond submissions pass OCC.
		const rows = await db.select().from(appSettings);
		const currentMs = rows[0]?.updatedAt.getTime() ?? 0;
		const boundaryVersion = new Date(currentMs).toISOString();
		const result = await externalOccCheck(boundaryVersion, UI_THEME_SETTINGS_KEYS);

		expect(result.status).toBe('ok');
	});
});

describe('inlineOccCheck', () => {
	beforeEach(async () => {
		await resetSharedTestDb();
	});

	it('returns conflict for blank submittedVersion', async () => {
		const result = await inlineOccCheck('', LOG_SETTINGS_KEYS);

		expect(result).toEqual({ status: 'conflict' });
		// Inline shape intentionally omits `current` (failure message is the
		// generic "Settings changed in another tab" string; clients don't
		// consume a fresh version from the response).
		expect('current' in result).toBe(false);
	});

	it('returns conflict for unparseable submittedVersion', async () => {
		const result = await inlineOccCheck('garbage', LOG_SETTINGS_KEYS);
		expect(result).toEqual({ status: 'conflict' });
	});

	it('returns ok when submitted version is the epoch and no rows exist', async () => {
		const result = await inlineOccCheck(new Date(0).toISOString(), LOG_SETTINGS_KEYS);
		expect(result).toEqual({ status: 'ok' });
	});

	it('returns conflict when submitted version is stale', async () => {
		// Seed one of the LOG_SETTINGS_KEYS rows so max(updatedAt) > 0.
		await setAppSetting('log_retention_days' as never, '14');

		const result = await inlineOccCheck(new Date(0).toISOString(), LOG_SETTINGS_KEYS);
		expect(result).toEqual({ status: 'conflict' });
	});

	it('returns ok when submitted version is fresh (>= current row updatedAt)', async () => {
		await setAppSetting('log_retention_days' as never, '14');

		const futureVersion = new Date(Date.now() + 60_000).toISOString();
		const result = await inlineOccCheck(futureVersion, LOG_SETTINGS_KEYS);
		expect(result).toEqual({ status: 'ok' });
	});

	it('returns ok when submitted version equals current row updatedAt (boundary)', async () => {
		// Symmetric with the externalOccCheck boundary test. inlineOccCheck
		// uses strict `submittedMs < currentMs`, so submissions landing on the
		// exact-ms boundary pass OCC. Same-second concurrent submissions from
		// two tabs both succeed; the SQLite atomic-write path is the final
		// arbiter via setApiConfigAtomic / setUserDefaultsAtomic.
		await setAppSetting('log_retention_days' as never, '14');

		const rows = await db.select().from(appSettings);
		const currentMs = rows[0]?.updatedAt.getTime() ?? 0;
		const boundaryVersion = new Date(currentMs).toISOString();
		const result = await inlineOccCheck(boundaryVersion, LOG_SETTINGS_KEYS);
		expect(result).toEqual({ status: 'ok' });
	});
});
