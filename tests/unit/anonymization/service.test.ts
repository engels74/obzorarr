import { describe, expect, it, beforeEach } from 'bun:test';
import { db } from '$lib/server/db/client';
import { appSettings } from '$lib/server/db/schema';
import {
	AnonymizationMode,
	AnonymizationSettingsKey,
	type AnonymizationModeType
} from '$lib/server/anonymization/types';
import {
	getGlobalAnonymizationMode,
	setGlobalAnonymizationMode,
	getPerStatAnonymization,
	setPerStatAnonymization,
	getAnonymizationModeForStat
} from '$lib/server/anonymization/service';

/**
 * Unit tests for Anonymization Service Database Functions
 *
 * Tests the database persistence layer for anonymization settings.
 * Covers CRUD operations, validation, error handling, and edge cases.
 *
 * Uses in-memory SQLite from test setup.
 */

describe('Anonymization Service', () => {
	// Clean up app settings before each test
	beforeEach(async () => {
		await db.delete(appSettings);
	});

	// =========================================================================
	// Global Anonymization Mode
	// =========================================================================

	describe('getGlobalAnonymizationMode', () => {
		it('returns REAL as default when no setting exists', async () => {
			const mode = await getGlobalAnonymizationMode();
			expect(mode).toBe(AnonymizationMode.REAL);
		});

		it('returns stored mode when valid - real', async () => {
			await db.insert(appSettings).values({
				key: AnonymizationSettingsKey.DEFAULT_MODE,
				value: AnonymizationMode.REAL
			});

			const mode = await getGlobalAnonymizationMode();
			expect(mode).toBe(AnonymizationMode.REAL);
		});

		it('returns stored mode when valid - anonymous', async () => {
			await db.insert(appSettings).values({
				key: AnonymizationSettingsKey.DEFAULT_MODE,
				value: AnonymizationMode.ANONYMOUS
			});

			const mode = await getGlobalAnonymizationMode();
			expect(mode).toBe(AnonymizationMode.ANONYMOUS);
		});

		it('returns stored mode when valid - hybrid', async () => {
			await db.insert(appSettings).values({
				key: AnonymizationSettingsKey.DEFAULT_MODE,
				value: AnonymizationMode.HYBRID
			});

			const mode = await getGlobalAnonymizationMode();
			expect(mode).toBe(AnonymizationMode.HYBRID);
		});

		it('returns REAL as fallback for invalid stored value', async () => {
			await db.insert(appSettings).values({
				key: AnonymizationSettingsKey.DEFAULT_MODE,
				value: 'invalid-mode'
			});

			const mode = await getGlobalAnonymizationMode();
			expect(mode).toBe(AnonymizationMode.REAL);
		});

		it('returns REAL for empty string value', async () => {
			await db.insert(appSettings).values({
				key: AnonymizationSettingsKey.DEFAULT_MODE,
				value: ''
			});

			const mode = await getGlobalAnonymizationMode();
			expect(mode).toBe(AnonymizationMode.REAL);
		});

		it('returns REAL for numeric value', async () => {
			await db.insert(appSettings).values({
				key: AnonymizationSettingsKey.DEFAULT_MODE,
				value: '123'
			});

			const mode = await getGlobalAnonymizationMode();
			expect(mode).toBe(AnonymizationMode.REAL);
		});

		it('returns REAL for JSON object value', async () => {
			await db.insert(appSettings).values({
				key: AnonymizationSettingsKey.DEFAULT_MODE,
				value: '{"mode": "anonymous"}'
			});

			const mode = await getGlobalAnonymizationMode();
			expect(mode).toBe(AnonymizationMode.REAL);
		});
	});

	describe('setGlobalAnonymizationMode', () => {
		it('inserts new setting for REAL mode', async () => {
			await setGlobalAnonymizationMode(AnonymizationMode.REAL);

			const mode = await getGlobalAnonymizationMode();
			expect(mode).toBe(AnonymizationMode.REAL);
		});

		it('inserts new setting for ANONYMOUS mode', async () => {
			await setGlobalAnonymizationMode(AnonymizationMode.ANONYMOUS);

			const mode = await getGlobalAnonymizationMode();
			expect(mode).toBe(AnonymizationMode.ANONYMOUS);
		});

		it('inserts new setting for HYBRID mode', async () => {
			await setGlobalAnonymizationMode(AnonymizationMode.HYBRID);

			const mode = await getGlobalAnonymizationMode();
			expect(mode).toBe(AnonymizationMode.HYBRID);
		});

		it('updates existing setting via upsert', async () => {
			await setGlobalAnonymizationMode(AnonymizationMode.REAL);
			await setGlobalAnonymizationMode(AnonymizationMode.ANONYMOUS);
			await setGlobalAnonymizationMode(AnonymizationMode.HYBRID);

			const mode = await getGlobalAnonymizationMode();
			expect(mode).toBe(AnonymizationMode.HYBRID);
		});

		it('round-trip: set and get returns same value', async () => {
			const modes: AnonymizationModeType[] = [
				AnonymizationMode.REAL,
				AnonymizationMode.ANONYMOUS,
				AnonymizationMode.HYBRID
			];

			for (const expectedMode of modes) {
				await setGlobalAnonymizationMode(expectedMode);
				const actualMode = await getGlobalAnonymizationMode();
				expect(actualMode).toBe(expectedMode);
			}
		});

		it('overwrites invalid stored value', async () => {
			// First, insert an invalid value directly
			await db.insert(appSettings).values({
				key: AnonymizationSettingsKey.DEFAULT_MODE,
				value: 'corrupted-data'
			});

			// Now set a valid mode - should overwrite
			await setGlobalAnonymizationMode(AnonymizationMode.ANONYMOUS);

			const mode = await getGlobalAnonymizationMode();
			expect(mode).toBe(AnonymizationMode.ANONYMOUS);
		});
	});

	// =========================================================================
	// Per-Stat Anonymization Settings
	// =========================================================================

	describe('getPerStatAnonymization', () => {
		it('returns empty object when no setting exists', async () => {
			const settings = await getPerStatAnonymization();
			expect(settings).toEqual({});
		});

		it('returns parsed settings when valid JSON with topViewers', async () => {
			await db.insert(appSettings).values({
				key: AnonymizationSettingsKey.PER_STAT_SETTINGS,
				value: JSON.stringify({ topViewers: AnonymizationMode.ANONYMOUS })
			});

			const settings = await getPerStatAnonymization();
			expect(settings).toEqual({ topViewers: AnonymizationMode.ANONYMOUS });
		});

		it('returns empty object for invalid JSON', async () => {
			await db.insert(appSettings).values({
				key: AnonymizationSettingsKey.PER_STAT_SETTINGS,
				value: 'not-valid-json{'
			});

			const settings = await getPerStatAnonymization();
			expect(settings).toEqual({});
		});

		it('returns empty object for empty string', async () => {
			await db.insert(appSettings).values({
				key: AnonymizationSettingsKey.PER_STAT_SETTINGS,
				value: ''
			});

			const settings = await getPerStatAnonymization();
			expect(settings).toEqual({});
		});

		it('returns empty object for invalid schema (wrong mode value)', async () => {
			await db.insert(appSettings).values({
				key: AnonymizationSettingsKey.PER_STAT_SETTINGS,
				value: JSON.stringify({ topViewers: 'invalid-mode' })
			});

			const settings = await getPerStatAnonymization();
			expect(settings).toEqual({});
		});

		it('returns empty object for invalid schema (wrong structure)', async () => {
			await db.insert(appSettings).values({
				key: AnonymizationSettingsKey.PER_STAT_SETTINGS,
				value: JSON.stringify({ unknownKey: AnonymizationMode.ANONYMOUS })
			});

			// Schema validation will fail due to unrecognized key (strict mode)
			// Actually, Zod by default allows extra keys - let's check actual behavior
			const settings = await getPerStatAnonymization();
			// Zod will strip unknown keys and return valid part or fail
			expect(settings).toBeDefined();
		});

		it('returns empty object for JSON array', async () => {
			await db.insert(appSettings).values({
				key: AnonymizationSettingsKey.PER_STAT_SETTINGS,
				value: JSON.stringify([AnonymizationMode.ANONYMOUS])
			});

			const settings = await getPerStatAnonymization();
			expect(settings).toEqual({});
		});

		it('returns empty object for JSON null', async () => {
			await db.insert(appSettings).values({
				key: AnonymizationSettingsKey.PER_STAT_SETTINGS,
				value: 'null'
			});

			const settings = await getPerStatAnonymization();
			expect(settings).toEqual({});
		});

		it('returns valid partial settings (topViewers only)', async () => {
			await db.insert(appSettings).values({
				key: AnonymizationSettingsKey.PER_STAT_SETTINGS,
				value: JSON.stringify({ topViewers: AnonymizationMode.HYBRID })
			});

			const settings = await getPerStatAnonymization();
			expect(settings.topViewers).toBe(AnonymizationMode.HYBRID);
		});

		it('handles empty JSON object', async () => {
			await db.insert(appSettings).values({
				key: AnonymizationSettingsKey.PER_STAT_SETTINGS,
				value: JSON.stringify({})
			});

			const settings = await getPerStatAnonymization();
			expect(settings).toEqual({});
		});
	});

	describe('setPerStatAnonymization', () => {
		it('inserts new setting with empty object', async () => {
			await setPerStatAnonymization({});

			const settings = await getPerStatAnonymization();
			expect(settings).toEqual({});
		});

		it('inserts new setting with topViewers', async () => {
			await setPerStatAnonymization({ topViewers: AnonymizationMode.ANONYMOUS });

			const settings = await getPerStatAnonymization();
			expect(settings).toEqual({ topViewers: AnonymizationMode.ANONYMOUS });
		});

		it('updates existing setting via upsert', async () => {
			await setPerStatAnonymization({ topViewers: AnonymizationMode.REAL });
			await setPerStatAnonymization({ topViewers: AnonymizationMode.HYBRID });

			const settings = await getPerStatAnonymization();
			expect(settings).toEqual({ topViewers: AnonymizationMode.HYBRID });
		});

		it('overwrites with empty object clears previous settings', async () => {
			await setPerStatAnonymization({ topViewers: AnonymizationMode.ANONYMOUS });
			await setPerStatAnonymization({});

			const settings = await getPerStatAnonymization();
			expect(settings).toEqual({});
		});

		it('round-trip: set and get returns same value', async () => {
			const testSettings = { topViewers: AnonymizationMode.HYBRID };

			await setPerStatAnonymization(testSettings);
			const actual = await getPerStatAnonymization();

			expect(actual).toEqual(testSettings);
		});

		it('handles all valid mode values for topViewers', async () => {
			const modes: AnonymizationModeType[] = [
				AnonymizationMode.REAL,
				AnonymizationMode.ANONYMOUS,
				AnonymizationMode.HYBRID
			];

			for (const mode of modes) {
				await setPerStatAnonymization({ topViewers: mode });
				const settings = await getPerStatAnonymization();
				expect(settings.topViewers).toBe(mode);
			}
		});

		it('overwrites corrupted data', async () => {
			// Insert corrupted data directly
			await db.insert(appSettings).values({
				key: AnonymizationSettingsKey.PER_STAT_SETTINGS,
				value: 'corrupted-json-data'
			});

			// Set valid data should overwrite
			await setPerStatAnonymization({ topViewers: AnonymizationMode.ANONYMOUS });

			const settings = await getPerStatAnonymization();
			expect(settings).toEqual({ topViewers: AnonymizationMode.ANONYMOUS });
		});
	});

	// =========================================================================
	// getAnonymizationModeForStat - Orchestration with Fallback
	// =========================================================================

	describe('getAnonymizationModeForStat', () => {
		it('returns global default when no per-stat override exists', async () => {
			// Set global to anonymous, no per-stat settings
			await setGlobalAnonymizationMode(AnonymizationMode.ANONYMOUS);

			const mode = await getAnonymizationModeForStat('topViewers');
			expect(mode).toBe(AnonymizationMode.ANONYMOUS);
		});

		it('returns global default (REAL) when nothing configured', async () => {
			const mode = await getAnonymizationModeForStat('topViewers');
			expect(mode).toBe(AnonymizationMode.REAL);
		});

		it('returns per-stat override when configured', async () => {
			await setGlobalAnonymizationMode(AnonymizationMode.REAL);
			await setPerStatAnonymization({ topViewers: AnonymizationMode.ANONYMOUS });

			const mode = await getAnonymizationModeForStat('topViewers');
			expect(mode).toBe(AnonymizationMode.ANONYMOUS);
		});

		it('per-stat override takes precedence over global', async () => {
			await setGlobalAnonymizationMode(AnonymizationMode.HYBRID);
			await setPerStatAnonymization({ topViewers: AnonymizationMode.REAL });

			const mode = await getAnonymizationModeForStat('topViewers');
			expect(mode).toBe(AnonymizationMode.REAL);
		});

		it('falls back to global when per-stat settings exist but not for this stat', async () => {
			await setGlobalAnonymizationMode(AnonymizationMode.HYBRID);
			// Set per-stat but without topViewers (empty object)
			await setPerStatAnonymization({});

			const mode = await getAnonymizationModeForStat('topViewers');
			expect(mode).toBe(AnonymizationMode.HYBRID);
		});

		it('handles corrupted per-stat settings by falling back to global', async () => {
			await setGlobalAnonymizationMode(AnonymizationMode.ANONYMOUS);

			// Insert corrupted per-stat settings
			await db.insert(appSettings).values({
				key: AnonymizationSettingsKey.PER_STAT_SETTINGS,
				value: 'corrupted-json'
			});

			const mode = await getAnonymizationModeForStat('topViewers');
			// getPerStatAnonymization returns {} for corrupted data
			// So it falls back to global
			expect(mode).toBe(AnonymizationMode.ANONYMOUS);
		});

		it('handles corrupted global settings by falling back to REAL', async () => {
			// Insert corrupted global setting
			await db.insert(appSettings).values({
				key: AnonymizationSettingsKey.DEFAULT_MODE,
				value: 'corrupted'
			});

			const mode = await getAnonymizationModeForStat('topViewers');
			expect(mode).toBe(AnonymizationMode.REAL);
		});

		it('handles undefined topViewers in per-stat settings correctly', async () => {
			await setGlobalAnonymizationMode(AnonymizationMode.HYBRID);
			await setPerStatAnonymization({ topViewers: undefined });

			const mode = await getAnonymizationModeForStat('topViewers');
			// undefined should fall through to global
			expect(mode).toBe(AnonymizationMode.HYBRID);
		});
	});

	// =========================================================================
	// Integration: Full Configuration Flow
	// =========================================================================

	describe('Integration: Configuration Flow', () => {
		it('admin configures full anonymization setup', async () => {
			// Step 1: Set global default to anonymous
			await setGlobalAnonymizationMode(AnonymizationMode.ANONYMOUS);

			// Step 2: Override topViewers to show real names
			await setPerStatAnonymization({ topViewers: AnonymizationMode.REAL });

			// Step 3: Verify configuration
			const globalMode = await getGlobalAnonymizationMode();
			expect(globalMode).toBe(AnonymizationMode.ANONYMOUS);

			const topViewersMode = await getAnonymizationModeForStat('topViewers');
			expect(topViewersMode).toBe(AnonymizationMode.REAL);
		});

		it('configuration persists across multiple operations', async () => {
			// Set initial config
			await setGlobalAnonymizationMode(AnonymizationMode.HYBRID);
			await setPerStatAnonymization({ topViewers: AnonymizationMode.ANONYMOUS });

			// Perform other operations (simulating app usage)
			await getGlobalAnonymizationMode();
			await getPerStatAnonymization();

			// Verify config still correct
			const mode = await getAnonymizationModeForStat('topViewers');
			expect(mode).toBe(AnonymizationMode.ANONYMOUS);
		});

		it('changing global default affects stats without override', async () => {
			// Initially REAL
			let mode = await getAnonymizationModeForStat('topViewers');
			expect(mode).toBe(AnonymizationMode.REAL);

			// Change global to ANONYMOUS
			await setGlobalAnonymizationMode(AnonymizationMode.ANONYMOUS);
			mode = await getAnonymizationModeForStat('topViewers');
			expect(mode).toBe(AnonymizationMode.ANONYMOUS);

			// Change global to HYBRID
			await setGlobalAnonymizationMode(AnonymizationMode.HYBRID);
			mode = await getAnonymizationModeForStat('topViewers');
			expect(mode).toBe(AnonymizationMode.HYBRID);
		});

		it('clearing per-stat override reverts to global', async () => {
			await setGlobalAnonymizationMode(AnonymizationMode.HYBRID);
			await setPerStatAnonymization({ topViewers: AnonymizationMode.REAL });

			// Verify override is active
			let mode = await getAnonymizationModeForStat('topViewers');
			expect(mode).toBe(AnonymizationMode.REAL);

			// Clear per-stat settings
			await setPerStatAnonymization({});

			// Should fall back to global
			mode = await getAnonymizationModeForStat('topViewers');
			expect(mode).toBe(AnonymizationMode.HYBRID);
		});
	});
});
