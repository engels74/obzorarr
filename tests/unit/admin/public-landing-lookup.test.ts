import { beforeEach, describe, expect, it } from 'bun:test';
import {
	AnonymizationMode,
	AppSettingsKey,
	ensurePublicLandingLookupDefault,
	getAppSetting,
	getPublicLandingLookupEnabled,
	setAppSetting,
	setPublicLandingLookupEnabled,
	WrappedLogoMode
} from '$lib/server/admin/settings.service';
import { db } from '$lib/server/db/client';
import { appSettings } from '$lib/server/db/schema';
import {
	anonymizationOptions,
	type OptionCopy,
	serverWrappedShareModeOptions,
	shareModeOptions,
	wrappedLogoOptions
} from '$lib/sharing/options';
import { ShareMode } from '$lib/sharing/types';

describe('PUBLIC_LANDING_LOOKUP setting', () => {
	beforeEach(async () => {
		await db.delete(appSettings);
	});

	it('getPublicLandingLookupEnabled defaults to false with no row', async () => {
		expect(await getPublicLandingLookupEnabled()).toBe(false);
	});

	it('round-trips through the setter', async () => {
		await setPublicLandingLookupEnabled(true);
		expect(await getPublicLandingLookupEnabled()).toBe(true);
		await setPublicLandingLookupEnabled(false);
		expect(await getPublicLandingLookupEnabled()).toBe(false);
	});

	describe('ensurePublicLandingLookupDefault (upgrade backfill)', () => {
		it('seeds true when onboarded and no row exists', async () => {
			await setAppSetting(AppSettingsKey.ONBOARDING_COMPLETED, 'true');
			await ensurePublicLandingLookupDefault();
			expect(await getAppSetting(AppSettingsKey.PUBLIC_LANDING_LOOKUP)).toBe('true');
		});

		it('does NOT seed when onboarding is not complete', async () => {
			// no ONBOARDING_COMPLETED row
			await ensurePublicLandingLookupDefault();
			expect(await getAppSetting(AppSettingsKey.PUBLIC_LANDING_LOOKUP)).toBeNull();

			await setAppSetting(AppSettingsKey.ONBOARDING_COMPLETED, 'false');
			await ensurePublicLandingLookupDefault();
			expect(await getAppSetting(AppSettingsKey.PUBLIC_LANDING_LOOKUP)).toBeNull();
		});

		it('never overwrites an explicit false', async () => {
			await setAppSetting(AppSettingsKey.ONBOARDING_COMPLETED, 'true');
			await setPublicLandingLookupEnabled(false);
			await ensurePublicLandingLookupDefault();
			expect(await getAppSetting(AppSettingsKey.PUBLIC_LANDING_LOOKUP)).toBe('false');
		});

		it('never overwrites an explicit true', async () => {
			await setAppSetting(AppSettingsKey.ONBOARDING_COMPLETED, 'true');
			await setPublicLandingLookupEnabled(true);
			await ensurePublicLandingLookupDefault();
			expect(await getAppSetting(AppSettingsKey.PUBLIC_LANDING_LOOKUP)).toBe('true');
		});

		it('is idempotent: rerun is a no-op once seeded', async () => {
			await setAppSetting(AppSettingsKey.ONBOARDING_COMPLETED, 'true');
			await ensurePublicLandingLookupDefault();
			await ensurePublicLandingLookupDefault();
			await ensurePublicLandingLookupDefault();

			const rows = await db.select().from(appSettings);
			const lookupRows = rows.filter((r) => r.key === AppSettingsKey.PUBLIC_LANDING_LOOKUP);
			expect(lookupRows).toHaveLength(1);
			expect(lookupRows[0]?.value).toBe('true');
		});
	});
});

describe('shared sharing-option copy module', () => {
	const assertWellFormed = (options: OptionCopy[]) => {
		const values = options.map((o) => o.value);
		// exactly one entry per value
		expect(new Set(values).size).toBe(values.length);
		for (const opt of options) {
			expect(opt.label.trim().length).toBeGreaterThan(0);
			expect(opt.description.trim().length).toBeGreaterThan(0);
		}
	};

	it('every option has a unique value and non-empty label + description', () => {
		assertWellFormed(anonymizationOptions);
		assertWellFormed(shareModeOptions);
		assertWellFormed(serverWrappedShareModeOptions);
		assertWellFormed(wrappedLogoOptions);
	});

	it('anonymization values match the server AnonymizationMode enum exactly', () => {
		expect(new Set(anonymizationOptions.map((o) => o.value))).toEqual(
			new Set(Object.values(AnonymizationMode))
		);
	});

	it('logo values match the server WrappedLogoMode enum exactly', () => {
		expect(new Set(wrappedLogoOptions.map((o) => o.value))).toEqual(
			new Set(Object.values(WrappedLogoMode))
		);
	});

	it('per-user share modes cover all ShareMode values', () => {
		expect(new Set(shareModeOptions.map((o) => o.value))).toEqual(
			new Set(Object.values(ShareMode))
		);
	});

	it('server-wide share modes are public | private-oauth only (no private-link)', () => {
		expect(serverWrappedShareModeOptions.map((o) => o.value).sort()).toEqual([
			'private-oauth',
			'public'
		]);
	});
});
