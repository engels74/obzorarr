import { beforeEach, describe, expect, it } from 'bun:test';
import {
	getAnonymizationModeForStat,
	getGlobalAnonymizationMode,
	getPerStatAnonymization,
	setGlobalAnonymizationMode,
	setPerStatAnonymization
} from '$lib/server/anonymization/service';
import { AnonymizationMode, AnonymizationSettingsKey } from '$lib/server/anonymization/types';
import { db } from '$lib/server/db/client';
import { appSettings } from '$lib/server/db/schema';
import { resetSharedTestDb } from '../../helpers/db';

type PerStatSettings = Parameters<typeof setPerStatAnonymization>[0];

const MODE_CASES = [
	[AnonymizationMode.REAL],
	[AnonymizationMode.ANONYMOUS],
	[AnonymizationMode.HYBRID]
] as const;

async function seedSetting(key: string, value: string) {
	await db.insert(appSettings).values({ key, value });
}

const seedDefault = (value: string) => seedSetting(AnonymizationSettingsKey.DEFAULT_MODE, value);
const seedPerStat = (value: string) =>
	seedSetting(AnonymizationSettingsKey.PER_STAT_SETTINGS, value);

describe('Anonymization Service', () => {
	beforeEach(resetSharedTestDb);

	describe('global anonymization mode', () => {
		it.each([
			['missing row defaults safely', null, AnonymizationMode.HYBRID],
			['stored real', AnonymizationMode.REAL, AnonymizationMode.REAL],
			['stored anonymous', AnonymizationMode.ANONYMOUS, AnonymizationMode.ANONYMOUS],
			['stored hybrid', AnonymizationMode.HYBRID, AnonymizationMode.HYBRID],
			['invalid value', 'invalid-mode', AnonymizationMode.HYBRID],
			['empty string', '', AnonymizationMode.HYBRID],
			['numeric string', '123', AnonymizationMode.HYBRID],
			['JSON object', '{"mode":"anonymous"}', AnonymizationMode.HYBRID]
		] as const)('returns %s', async (_name, storedValue, expected) => {
			if (storedValue !== null) await seedDefault(storedValue);

			expect(await getGlobalAnonymizationMode()).toBe(expected);
		});

		it.each(MODE_CASES)('round-trips %s', async (mode) => {
			await setGlobalAnonymizationMode(mode);

			expect(await getGlobalAnonymizationMode()).toBe(mode);
		});

		it('upserts and overwrites corrupt data', async () => {
			await seedDefault('corrupted-data');
			for (const mode of [
				AnonymizationMode.REAL,
				AnonymizationMode.ANONYMOUS,
				AnonymizationMode.HYBRID
			]) {
				await setGlobalAnonymizationMode(mode);
			}

			expect(await getGlobalAnonymizationMode()).toBe(AnonymizationMode.HYBRID);
		});
	});

	describe('per-stat anonymization settings', () => {
		it.each([
			['missing row', null, {}],
			[
				'valid topViewers',
				JSON.stringify({ topViewers: AnonymizationMode.ANONYMOUS }),
				{ topViewers: AnonymizationMode.ANONYMOUS }
			],
			['invalid JSON', 'not-valid-json{', {}],
			['empty string', '', {}],
			['invalid mode', JSON.stringify({ topViewers: 'invalid-mode' }), {}],
			['unknown key', JSON.stringify({ unknownKey: AnonymizationMode.ANONYMOUS }), {}],
			['JSON array', JSON.stringify([AnonymizationMode.ANONYMOUS]), {}],
			['JSON null', 'null', {}],
			['empty object', JSON.stringify({}), {}],
			[
				'hybrid topViewers',
				JSON.stringify({ topViewers: AnonymizationMode.HYBRID }),
				{ topViewers: AnonymizationMode.HYBRID }
			]
		] as const)('parses %s', async (_name, storedValue, expected) => {
			if (storedValue !== null) await seedPerStat(storedValue);

			expect(await getPerStatAnonymization()).toEqual(expected);
		});

		it.each([
			['empty object', {}, {}],
			[
				'anonymous topViewers',
				{ topViewers: AnonymizationMode.ANONYMOUS },
				{ topViewers: AnonymizationMode.ANONYMOUS }
			]
		] as const)('inserts %s', async (_name, input, expected) => {
			await setPerStatAnonymization(input as PerStatSettings);

			expect(await getPerStatAnonymization()).toEqual(expected);
		});

		it.each(MODE_CASES)('round-trips topViewers=%s', async (mode) => {
			await setPerStatAnonymization({ topViewers: mode });

			expect((await getPerStatAnonymization()).topViewers).toBe(mode);
		});

		it('upserts, clears, and overwrites corrupt rows', async () => {
			await setPerStatAnonymization({ topViewers: AnonymizationMode.REAL });
			await setPerStatAnonymization({ topViewers: AnonymizationMode.HYBRID });
			expect(await getPerStatAnonymization()).toEqual({ topViewers: AnonymizationMode.HYBRID });

			await setPerStatAnonymization({});
			expect(await getPerStatAnonymization()).toEqual({});

			await resetSharedTestDb();
			await seedPerStat('corrupted-json-data');
			await setPerStatAnonymization({ topViewers: AnonymizationMode.ANONYMOUS });
			expect(await getPerStatAnonymization()).toEqual({ topViewers: AnonymizationMode.ANONYMOUS });
		});
	});

	describe('getAnonymizationModeForStat', () => {
		it.each([
			['missing config defaults safely', async () => {}, AnonymizationMode.HYBRID],
			[
				'global fallback',
				async () => setGlobalAnonymizationMode(AnonymizationMode.ANONYMOUS),
				AnonymizationMode.ANONYMOUS
			],
			[
				'per-stat override',
				async () => {
					await setGlobalAnonymizationMode(AnonymizationMode.REAL);
					await setPerStatAnonymization({ topViewers: AnonymizationMode.ANONYMOUS });
				},
				AnonymizationMode.ANONYMOUS
			],
			[
				'per-stat precedence over global',
				async () => {
					await setGlobalAnonymizationMode(AnonymizationMode.HYBRID);
					await setPerStatAnonymization({ topViewers: AnonymizationMode.REAL });
				},
				AnonymizationMode.REAL
			],
			[
				'empty per-stat settings fall back',
				async () => {
					await setGlobalAnonymizationMode(AnonymizationMode.HYBRID);
					await setPerStatAnonymization({});
				},
				AnonymizationMode.HYBRID
			],
			[
				'corrupt per-stat settings fall back',
				async () => {
					await setGlobalAnonymizationMode(AnonymizationMode.ANONYMOUS);
					await seedPerStat('corrupted-json');
				},
				AnonymizationMode.ANONYMOUS
			],
			[
				'corrupt global setting defaults safely',
				async () => seedDefault('corrupted'),
				AnonymizationMode.HYBRID
			],
			[
				'undefined topViewers falls back',
				async () => {
					await setGlobalAnonymizationMode(AnonymizationMode.HYBRID);
					await setPerStatAnonymization({ topViewers: undefined });
				},
				AnonymizationMode.HYBRID
			]
		] as const)('%s', async (_name, setup, expected) => {
			await setup();

			expect(await getAnonymizationModeForStat('topViewers')).toBe(expected);
		});
	});

	describe('configuration flow', () => {
		it('persists global and per-stat choices through reads', async () => {
			await setGlobalAnonymizationMode(AnonymizationMode.ANONYMOUS);
			await setPerStatAnonymization({ topViewers: AnonymizationMode.REAL });
			await getGlobalAnonymizationMode();
			await getPerStatAnonymization();

			expect(await getGlobalAnonymizationMode()).toBe(AnonymizationMode.ANONYMOUS);
			expect(await getAnonymizationModeForStat('topViewers')).toBe(AnonymizationMode.REAL);
		});

		it('global changes apply until an override exists, and clearing it reverts to global', async () => {
			expect(await getAnonymizationModeForStat('topViewers')).toBe(AnonymizationMode.HYBRID);
			await setGlobalAnonymizationMode(AnonymizationMode.ANONYMOUS);
			expect(await getAnonymizationModeForStat('topViewers')).toBe(AnonymizationMode.ANONYMOUS);

			await setPerStatAnonymization({ topViewers: AnonymizationMode.REAL });
			expect(await getAnonymizationModeForStat('topViewers')).toBe(AnonymizationMode.REAL);

			await setGlobalAnonymizationMode(AnonymizationMode.HYBRID);
			await setPerStatAnonymization({});
			expect(await getAnonymizationModeForStat('topViewers')).toBe(AnonymizationMode.HYBRID);
		});
	});
});
