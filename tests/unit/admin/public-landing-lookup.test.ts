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
	PRIVACY_PRESETS,
	serverWrappedShareModeOptions,
	shareModeOptions,
	wrappedLogoOptions
} from '$lib/sharing/options';
import { ShareMode } from '$lib/sharing/types';
import { resetSharedTestDb } from '../../helpers/db';

describe('PUBLIC_LANDING_LOOKUP setting', () => {
	beforeEach(async () => {
		await resetSharedTestDb();
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

	describe('privacy presets', () => {
		const anonymizationValues = new Set(anonymizationOptions.map((o) => o.value));
		const shareModeValues = new Set(shareModeOptions.map((o) => o.value));
		const serverWrappedValues = new Set(serverWrappedShareModeOptions.map((o) => o.value));
		const logoValues = new Set(wrappedLogoOptions.map((o) => o.value));
		const serverAnonymization = new Set(Object.values(AnonymizationMode));
		const serverShareModes = new Set(Object.values(ShareMode));
		const serverLogoModes = new Set(Object.values(WrappedLogoMode));

		const expectedKeys = [
			'anonymizationMode',
			'defaultShareMode',
			'serverWrappedShareMode',
			'publicLandingLookup',
			'allowUserControl',
			'logoMode'
		].sort();

		it('every preset has a unique id', () => {
			const ids = PRIVACY_PRESETS.map((p) => p.id);
			expect(new Set(ids).size).toBe(ids.length);
		});

		it('every preset has non-empty label, description and exposureSummary', () => {
			for (const preset of PRIVACY_PRESETS) {
				expect(preset.label.trim().length).toBeGreaterThan(0);
				expect(preset.description.trim().length).toBeGreaterThan(0);
				expect(preset.exposureSummary.trim().length).toBeGreaterThan(0);
			}
		});

		it('every preset has exactly the six value keys', () => {
			for (const preset of PRIVACY_PRESETS) {
				expect(Object.keys(preset.values).sort()).toEqual(expectedKeys);
			}
		});

		it('every preset value is a member of its option value-set AND the server enum', () => {
			for (const preset of PRIVACY_PRESETS) {
				const v = preset.values;

				expect(anonymizationValues.has(v.anonymizationMode)).toBe(true);
				expect(serverAnonymization.has(v.anonymizationMode)).toBe(true);

				expect(shareModeValues.has(v.defaultShareMode)).toBe(true);
				expect(serverShareModes.has(v.defaultShareMode)).toBe(true);

				expect(serverWrappedValues.has(v.serverWrappedShareMode)).toBe(true);
				expect(serverShareModes.has(v.serverWrappedShareMode)).toBe(true);

				expect(logoValues.has(v.logoMode)).toBe(true);
				expect(serverLogoModes.has(v.logoMode)).toBe(true);

				expect(typeof v.publicLandingLookup).toBe('boolean');
				expect(typeof v.allowUserControl).toBe('boolean');
			}
		});
	});
});
