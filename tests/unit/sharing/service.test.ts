import { beforeEach, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { appSettings, shareSettings } from '$lib/server/db/schema';
import {
	bulkApplyShareDefaults,
	deleteShareSettings,
	generateShareToken,
	getAllUserShareSettings,
	getEffectiveShareMode,
	getGlobalAllowUserControl,
	getGlobalDefaultShareMode,
	getOrCreateShareSettings,
	getShareSettings,
	getShareSettingsByToken,
	getShareSettingsReadOnly,
	getUserLogoPreference,
	isPureNumericId,
	isValidTokenFormat,
	regenerateShareToken,
	setGlobalShareDefaults,
	updateShareSettings,
	updateUserLogoPreference
} from '$lib/server/sharing/service';
import {
	PermissionExceededError,
	ShareMode,
	ShareModeSource,
	ShareSettingsKey,
	ShareSettingsNotFoundError
} from '$lib/server/sharing/types';
import { resetSharedTestDb } from '../../helpers/db';

/**
 * Unit tests for Sharing Service
 *
 * Tests database operations for share settings management.
 * Uses in-memory SQLite from test setup.
 */

describe('Sharing Service', () => {
	beforeEach(async () => {
		await resetSharedTestDb();
	});

	describe('Identifier Helpers', () => {
		it('isPureNumericId accepts non-empty digit strings', () => {
			expect(isPureNumericId('1')).toBe(true);
			expect(isPureNumericId('42')).toBe(true);
			expect(isPureNumericId('1000000')).toBe(true);
		});

		it('isPureNumericId rejects mixed, signed, or empty strings', () => {
			expect(isPureNumericId('')).toBe(false);
			expect(isPureNumericId('2abc')).toBe(false);
			expect(isPureNumericId('2a155c58-MANGLED-0000-0000-000000000000')).toBe(false);
			expect(isPureNumericId('-5')).toBe(false);
			expect(isPureNumericId('+5')).toBe(false);
			expect(isPureNumericId(' 5')).toBe(false);
			expect(isPureNumericId('5 ')).toBe(false);
			expect(isPureNumericId('1.0')).toBe(false);
		});
	});

	describe('Global Defaults', () => {
		describe('getGlobalDefaultShareMode', () => {
			it('returns PUBLIC when no setting exists', async () => {
				const mode = await getGlobalDefaultShareMode();
				expect(mode).toBe(ShareMode.PUBLIC);
			});

			it('returns stored mode when setting exists', async () => {
				await db.insert(appSettings).values({
					key: ShareSettingsKey.DEFAULT_SHARE_MODE,
					value: ShareMode.PRIVATE_OAUTH
				});

				const mode = await getGlobalDefaultShareMode();
				expect(mode).toBe(ShareMode.PRIVATE_OAUTH);
			});

			it('returns PUBLIC for invalid stored value', async () => {
				await db.insert(appSettings).values({
					key: ShareSettingsKey.DEFAULT_SHARE_MODE,
					value: 'invalid-mode'
				});

				const mode = await getGlobalDefaultShareMode();
				expect(mode).toBe(ShareMode.PUBLIC);
			});
		});

		describe('getGlobalAllowUserControl', () => {
			it('returns false when no setting exists', async () => {
				const allowed = await getGlobalAllowUserControl();
				expect(allowed).toBe(false);
			});

			it('returns true when setting is "true"', async () => {
				await db.insert(appSettings).values({
					key: ShareSettingsKey.ALLOW_USER_CONTROL,
					value: 'true'
				});

				const allowed = await getGlobalAllowUserControl();
				expect(allowed).toBe(true);
			});

			it('returns false for any other value', async () => {
				await db.insert(appSettings).values({
					key: ShareSettingsKey.ALLOW_USER_CONTROL,
					value: 'false'
				});

				const allowed = await getGlobalAllowUserControl();
				expect(allowed).toBe(false);
			});
		});

		describe('setGlobalShareDefaults', () => {
			it('inserts new settings', async () => {
				await setGlobalShareDefaults({
					defaultShareMode: ShareMode.PRIVATE_LINK,
					allowUserControl: true
				});

				const mode = await getGlobalDefaultShareMode();
				const allowed = await getGlobalAllowUserControl();

				expect(mode).toBe(ShareMode.PRIVATE_LINK);
				expect(allowed).toBe(true);
			});

			it('updates existing settings', async () => {
				await setGlobalShareDefaults({
					defaultShareMode: ShareMode.PUBLIC,
					allowUserControl: false
				});

				await setGlobalShareDefaults({
					defaultShareMode: ShareMode.PRIVATE_OAUTH,
					allowUserControl: true
				});

				const mode = await getGlobalDefaultShareMode();
				const allowed = await getGlobalAllowUserControl();

				expect(mode).toBe(ShareMode.PRIVATE_OAUTH);
				expect(allowed).toBe(true);
			});

			it('nulls tokens on default-source rows when widening from PRIVATE_LINK to PUBLIC', async () => {
				await setGlobalShareDefaults({
					defaultShareMode: ShareMode.PRIVATE_LINK,
					allowUserControl: true
				});

				const defaultToken = generateShareToken();
				const explicitToken = generateShareToken();

				await db.insert(shareSettings).values([
					{
						userId: 1,
						year: 2024,
						mode: ShareMode.PRIVATE_LINK,
						modeSource: ShareModeSource.DEFAULT,
						shareToken: defaultToken,
						canUserControl: true
					},
					{
						userId: 2,
						year: 2024,
						mode: ShareMode.PRIVATE_LINK,
						modeSource: ShareModeSource.EXPLICIT,
						shareToken: explicitToken,
						canUserControl: true
					}
				]);

				await setGlobalShareDefaults({
					defaultShareMode: ShareMode.PUBLIC,
					allowUserControl: true
				});

				const rows = await db.select().from(shareSettings);
				const defaultRow = rows.find((r) => r.userId === 1);
				const explicitRow = rows.find((r) => r.userId === 2);

				expect(defaultRow?.shareToken).toBeNull();
				expect(explicitRow?.shareToken).toBe(explicitToken);
			});

			it('nulls tokens on default-source rows when widening from PRIVATE_LINK to PRIVATE_OAUTH', async () => {
				await setGlobalShareDefaults({
					defaultShareMode: ShareMode.PRIVATE_LINK,
					allowUserControl: true
				});

				const defaultToken = generateShareToken();
				await db.insert(shareSettings).values({
					userId: 1,
					year: 2024,
					mode: ShareMode.PRIVATE_LINK,
					modeSource: ShareModeSource.DEFAULT,
					shareToken: defaultToken,
					canUserControl: true
				});

				await setGlobalShareDefaults({
					defaultShareMode: ShareMode.PRIVATE_OAUTH,
					allowUserControl: true
				});

				const row = await db.select().from(shareSettings).limit(1);
				expect(row[0]?.shareToken).toBeNull();
			});

			it('does not touch tokens when transitioning from PUBLIC to PRIVATE_LINK', async () => {
				await setGlobalShareDefaults({
					defaultShareMode: ShareMode.PUBLIC,
					allowUserControl: true
				});

				const explicitToken = generateShareToken();
				await db.insert(shareSettings).values({
					userId: 1,
					year: 2024,
					mode: ShareMode.PRIVATE_LINK,
					modeSource: ShareModeSource.EXPLICIT,
					shareToken: explicitToken,
					canUserControl: true
				});

				await setGlobalShareDefaults({
					defaultShareMode: ShareMode.PRIVATE_LINK,
					allowUserControl: true
				});

				const row = await db.select().from(shareSettings).limit(1);
				expect(row[0]?.shareToken).toBe(explicitToken);
			});
		});

		describe('toShareSettings token stripping', () => {
			it('returns shareToken: null when effective mode is PUBLIC even if DB row holds a token', async () => {
				const stashedToken = generateShareToken();
				// Default-sourced row originally created when global default was PRIVATE_LINK.
				await db.insert(shareSettings).values({
					userId: 1,
					year: 2024,
					mode: ShareMode.PRIVATE_LINK,
					modeSource: ShareModeSource.DEFAULT,
					shareToken: stashedToken,
					canUserControl: true
				});

				// Force a PUBLIC global default WITHOUT going through setGlobalShareDefaults
				// (which would null the token) so we exercise the in-memory strip path.
				await db.insert(appSettings).values({
					key: ShareSettingsKey.DEFAULT_SHARE_MODE,
					value: ShareMode.PUBLIC
				});

				const settings = await getShareSettings(1, 2024);
				expect(settings?.mode).toBe(ShareMode.PUBLIC);
				expect(settings?.shareToken).toBeNull();
			});

			it('returns shareToken when effective mode is PRIVATE_LINK', async () => {
				const token = generateShareToken();
				await db.insert(shareSettings).values({
					userId: 1,
					year: 2024,
					mode: ShareMode.PRIVATE_LINK,
					modeSource: ShareModeSource.EXPLICIT,
					shareToken: token,
					canUserControl: true
				});

				const settings = await getShareSettings(1, 2024);
				expect(settings?.shareToken).toBe(token);
			});
		});

		describe('bulkApplyShareDefaults', () => {
			it('rewrites default-sourced rows but leaves explicit overrides untouched (ISSUE-006)', async () => {
				await setGlobalShareDefaults({
					defaultShareMode: ShareMode.PUBLIC,
					allowUserControl: true
				});

				const explicitToken = generateShareToken();
				await db.insert(shareSettings).values([
					{
						userId: 1,
						year: 2024,
						mode: ShareMode.PRIVATE_OAUTH,
						modeSource: ShareModeSource.DEFAULT,
						shareToken: null,
						canUserControl: false
					},
					{
						userId: 2,
						year: 2024,
						mode: ShareMode.PRIVATE_LINK,
						modeSource: ShareModeSource.EXPLICIT,
						shareToken: explicitToken,
						canUserControl: false
					}
				]);

				const result = await bulkApplyShareDefaults();
				expect(result).toEqual({ updated: 1, skipped: 1 });

				const defaultRow = (
					await db.select().from(shareSettings).where(eq(shareSettings.userId, 1)).limit(1)
				)[0];
				expect(defaultRow?.mode).toBe(ShareMode.PUBLIC);
				expect(defaultRow?.modeSource).toBe(ShareModeSource.DEFAULT);
				expect(defaultRow?.canUserControl).toBe(true);

				// Explicit row is fully unchanged: mode, source, token, and canUserControl.
				const explicitRow = (
					await db.select().from(shareSettings).where(eq(shareSettings.userId, 2)).limit(1)
				)[0];
				expect(explicitRow?.mode).toBe(ShareMode.PRIVATE_LINK);
				expect(explicitRow?.modeSource).toBe(ShareModeSource.EXPLICIT);
				expect(explicitRow?.shareToken).toBe(explicitToken);
				expect(explicitRow?.canUserControl).toBe(false);
			});

			it('mints tokens for default-sourced rows only when default is PRIVATE_LINK', async () => {
				await setGlobalShareDefaults({
					defaultShareMode: ShareMode.PRIVATE_LINK,
					allowUserControl: false
				});

				await db.insert(shareSettings).values([
					{
						userId: 1,
						year: 2024,
						mode: ShareMode.PUBLIC,
						modeSource: ShareModeSource.DEFAULT,
						shareToken: null,
						canUserControl: true
					},
					// Explicit PUBLIC override: must NOT be rotated or given a token.
					{
						userId: 2,
						year: 2024,
						mode: ShareMode.PUBLIC,
						modeSource: ShareModeSource.EXPLICIT,
						shareToken: null,
						canUserControl: true
					}
				]);

				const result = await bulkApplyShareDefaults();
				expect(result).toEqual({ updated: 1, skipped: 1 });

				const defaultRow = (
					await db.select().from(shareSettings).where(eq(shareSettings.userId, 1)).limit(1)
				)[0];
				expect(defaultRow?.mode).toBe(ShareMode.PRIVATE_LINK);
				expect(defaultRow?.modeSource).toBe(ShareModeSource.DEFAULT);
				expect(defaultRow?.shareToken).not.toBeNull();
				expect(isValidTokenFormat(defaultRow!.shareToken!)).toBe(true);

				const explicitRow = (
					await db.select().from(shareSettings).where(eq(shareSettings.userId, 2)).limit(1)
				)[0];
				expect(explicitRow?.mode).toBe(ShareMode.PUBLIC);
				expect(explicitRow?.modeSource).toBe(ShareModeSource.EXPLICIT);
				expect(explicitRow?.shareToken).toBeNull();
			});

			it('preserves existing tokens on default-sourced rows when default is PRIVATE_LINK', async () => {
				await setGlobalShareDefaults({
					defaultShareMode: ShareMode.PRIVATE_LINK,
					allowUserControl: false
				});

				const stashedToken = generateShareToken();
				await db.insert(shareSettings).values({
					userId: 1,
					year: 2024,
					mode: ShareMode.PRIVATE_LINK,
					modeSource: ShareModeSource.DEFAULT,
					shareToken: stashedToken,
					canUserControl: true
				});

				await bulkApplyShareDefaults();

				const row = await db.select().from(shareSettings).limit(1);
				expect(row[0]?.shareToken).toBe(stashedToken);
			});

			it('returns 0/0 when there are no share rows', async () => {
				await setGlobalShareDefaults({
					defaultShareMode: ShareMode.PUBLIC,
					allowUserControl: true
				});

				const result = await bulkApplyShareDefaults();
				expect(result).toEqual({ updated: 0, skipped: 0 });
			});

			it('reports updated=0 with skipped>0 when every row is an explicit override', async () => {
				await setGlobalShareDefaults({
					defaultShareMode: ShareMode.PUBLIC,
					allowUserControl: true
				});

				await db.insert(shareSettings).values([
					{
						userId: 1,
						year: 2024,
						mode: ShareMode.PRIVATE_OAUTH,
						modeSource: ShareModeSource.EXPLICIT,
						shareToken: null,
						canUserControl: false
					},
					{
						userId: 2,
						year: 2024,
						mode: ShareMode.PRIVATE_LINK,
						modeSource: ShareModeSource.EXPLICIT,
						shareToken: generateShareToken(),
						canUserControl: false
					}
				]);

				const result = await bulkApplyShareDefaults();
				expect(result).toEqual({ updated: 0, skipped: 2 });

				const rows = await db.select().from(shareSettings);
				for (const row of rows) {
					expect(row.modeSource).toBe(ShareModeSource.EXPLICIT);
				}
			});
		});
	});

	describe('Share Settings CRUD', () => {
		const userId = 1;
		const year = 2024;

		describe('getShareSettings', () => {
			it('returns null when no settings exist', async () => {
				const settings = await getShareSettings(userId, year);
				expect(settings).toBeNull();
			});

			it('returns settings when they exist', async () => {
				await db.insert(shareSettings).values({
					userId,
					year,
					mode: ShareMode.PRIVATE_OAUTH,
					shareToken: null,
					canUserControl: true
				});

				const settings = await getShareSettings(userId, year);
				expect(settings).not.toBeNull();
				expect(settings?.mode).toBe(ShareMode.PRIVATE_OAUTH);
				expect(settings?.canUserControl).toBe(true);
			});

			it('normalizes invalid modeSource to explicit for persisted rows', async () => {
				const token = generateShareToken();
				await db.insert(shareSettings).values({
					userId,
					year,
					mode: ShareMode.PRIVATE_LINK,
					modeSource: 'invalid-source',
					shareToken: token,
					canUserControl: true
				});

				const settings = await getShareSettings(userId, year);
				const effectiveMode = await getEffectiveShareMode(userId, year);

				expect(settings?.modeSource).toBe(ShareModeSource.EXPLICIT);
				expect(settings?.mode).toBe(ShareMode.PRIVATE_LINK);
				expect(settings?.shareToken).toBe(token);
				expect(effectiveMode).toBe(ShareMode.PRIVATE_LINK);
			});

			it('falls back to the global default for invalid persisted modes', async () => {
				await setGlobalShareDefaults({
					defaultShareMode: ShareMode.PRIVATE_OAUTH,
					allowUserControl: false
				});

				await db.insert(shareSettings).values({
					userId,
					year,
					mode: 'invalid-mode',
					modeSource: ShareModeSource.EXPLICIT,
					shareToken: generateShareToken(),
					canUserControl: true
				});

				const settings = await getShareSettings(userId, year);
				const readOnlySettings = await getShareSettingsReadOnly(userId, year);
				const effectiveMode = await getEffectiveShareMode(userId, year);

				expect(settings?.storedMode).toBe(ShareMode.PRIVATE_OAUTH);
				expect(settings?.mode).toBe(ShareMode.PRIVATE_OAUTH);
				expect(settings?.shareToken).toBeNull();
				expect(readOnlySettings?.storedMode).toBe(ShareMode.PRIVATE_OAUTH);
				expect(readOnlySettings?.mode).toBe(ShareMode.PRIVATE_OAUTH);
				expect(effectiveMode).toBe(ShareMode.PRIVATE_OAUTH);
			});

			it('maps shareToken correctly', async () => {
				const token = generateShareToken();
				await db.insert(shareSettings).values({
					userId,
					year,
					mode: ShareMode.PRIVATE_LINK,
					shareToken: token,
					canUserControl: false
				});

				const settings = await getShareSettings(userId, year);
				expect(settings?.shareToken).toBe(token);
			});

			it('repairs missing token when default-sourced settings become private-link', async () => {
				await setGlobalShareDefaults({
					defaultShareMode: ShareMode.PUBLIC,
					allowUserControl: true
				});

				await db.insert(shareSettings).values({
					userId,
					year,
					mode: ShareMode.PUBLIC,
					modeSource: ShareModeSource.DEFAULT,
					shareToken: null,
					canUserControl: true
				});

				await setGlobalShareDefaults({
					defaultShareMode: ShareMode.PRIVATE_LINK,
					allowUserControl: true
				});

				const settings = await getShareSettings(userId, year);
				expect(settings?.mode).toBe(ShareMode.PRIVATE_LINK);
				expect(settings?.shareToken).not.toBeNull();
				expect(isValidTokenFormat(settings!.shareToken!)).toBe(true);
				expect((await getShareSettings(userId, year))?.shareToken).toBe(settings?.shareToken);
			});
		});

		describe('getOrCreateShareSettings', () => {
			it('creates settings with global defaults when none exist', async () => {
				await setGlobalShareDefaults({
					defaultShareMode: ShareMode.PRIVATE_OAUTH,
					allowUserControl: true
				});

				const settings = await getOrCreateShareSettings({ userId, year });

				expect(settings.userId).toBe(userId);
				expect(settings.year).toBe(year);
				expect(settings.mode).toBe(ShareMode.PRIVATE_OAUTH);
				expect(settings.storedMode).toBe(ShareMode.PRIVATE_OAUTH);
				expect(settings.modeSource).toBe(ShareModeSource.DEFAULT);
				expect(settings.canUserControl).toBe(true);
				expect(settings.shareToken).toBeNull();
			});

			it('generates token when default mode is private-link', async () => {
				await setGlobalShareDefaults({
					defaultShareMode: ShareMode.PRIVATE_LINK,
					allowUserControl: false
				});

				const settings = await getOrCreateShareSettings({ userId, year });

				expect(settings.mode).toBe(ShareMode.PRIVATE_LINK);
				expect(settings.modeSource).toBe(ShareModeSource.DEFAULT);
				expect(settings.shareToken).not.toBeNull();
				expect(isValidTokenFormat(settings.shareToken!)).toBe(true);
			});

			it('returns existing settings preserving mode and token', async () => {
				const existingToken = generateShareToken();
				await db.insert(shareSettings).values({
					userId,
					year,
					mode: ShareMode.PRIVATE_LINK,
					shareToken: existingToken,
					canUserControl: false
				});

				const settings = await getOrCreateShareSettings({ userId, year });

				// Mode and token should be preserved from database
				expect(settings.mode).toBe(ShareMode.PRIVATE_LINK);
				expect(settings.modeSource).toBe(ShareModeSource.EXPLICIT);
				expect(settings.shareToken).toBe(existingToken);
			});

			it('preserves stored canUserControl for existing settings', async () => {
				await db.insert(shareSettings).values({
					userId,
					year,
					mode: ShareMode.PUBLIC,
					shareToken: null,
					canUserControl: false
				});

				await setGlobalShareDefaults({
					defaultShareMode: ShareMode.PUBLIC,
					allowUserControl: true
				});

				const settings = await getOrCreateShareSettings({ userId, year });
				expect(settings.canUserControl).toBe(false);

				await setGlobalShareDefaults({
					defaultShareMode: ShareMode.PUBLIC,
					allowUserControl: false
				});

				const settings2 = await getOrCreateShareSettings({ userId, year });
				expect(settings2.canUserControl).toBe(false);
			});

			it('keeps default-sourced mode effective from global defaults without changing control', async () => {
				await setGlobalShareDefaults({
					defaultShareMode: ShareMode.PUBLIC,
					allowUserControl: true
				});

				const settings = await getOrCreateShareSettings({ userId, year });
				expect(settings.mode).toBe(ShareMode.PUBLIC);
				expect(settings.modeSource).toBe(ShareModeSource.DEFAULT);
				expect(settings.canUserControl).toBe(true);

				await setGlobalShareDefaults({
					defaultShareMode: ShareMode.PRIVATE_OAUTH,
					allowUserControl: false
				});

				const updated = await getOrCreateShareSettings({ userId, year });
				expect(updated.mode).toBe(ShareMode.PRIVATE_OAUTH);
				expect(updated.storedMode).toBe(ShareMode.PUBLIC);
				expect(updated.modeSource).toBe(ShareModeSource.DEFAULT);
				expect(updated.canUserControl).toBe(true);
			});

			it('throws when createIfMissing is false and settings do not exist', async () => {
				await expect(
					getOrCreateShareSettings({ userId, year, createIfMissing: false })
				).rejects.toBeInstanceOf(ShareSettingsNotFoundError);
			});
		});

		describe('updateShareSettings', () => {
			beforeEach(async () => {
				await setGlobalShareDefaults({
					defaultShareMode: ShareMode.PUBLIC,
					allowUserControl: true
				});

				await db.insert(shareSettings).values({
					userId,
					year,
					mode: ShareMode.PUBLIC,
					shareToken: null,
					canUserControl: true
				});
			});

			it('allows admin to update mode', async () => {
				const updated = await updateShareSettings(
					userId,
					year,
					{ mode: ShareMode.PRIVATE_OAUTH },
					true // isAdmin
				);

				expect(updated.mode).toBe(ShareMode.PRIVATE_OAUTH);
				expect(updated.modeSource).toBe(ShareModeSource.EXPLICIT);
			});

			it('allows admin to set private-link mode', async () => {
				const updated = await updateShareSettings(
					userId,
					year,
					{ mode: ShareMode.PRIVATE_LINK },
					true // isAdmin
				);

				expect(updated.mode).toBe(ShareMode.PRIVATE_LINK);
				expect(updated.shareToken).not.toBeNull();
			});

			it('allows admin to update canUserControl', async () => {
				const updated = await updateShareSettings(
					userId,
					year,
					{ canUserControl: false },
					true // isAdmin
				);

				expect(updated.canUserControl).toBe(false);
			});

			it('allows user with canUserControl to change to public', async () => {
				// First set to private-oauth
				await updateShareSettings(userId, year, { mode: ShareMode.PRIVATE_OAUTH }, true);

				const updated = await updateShareSettings(
					userId,
					year,
					{ mode: ShareMode.PUBLIC },
					false // not admin
				);

				expect(updated.mode).toBe(ShareMode.PUBLIC);
			});

			it('denies user without canUserControl', async () => {
				await updateShareSettings(userId, year, { canUserControl: false }, true);

				await expect(
					updateShareSettings(userId, year, { mode: ShareMode.PRIVATE_OAUTH }, false)
				).rejects.toBeInstanceOf(PermissionExceededError);
			});

			it('allows user with canUserControl to enable private-link', async () => {
				const updated = await updateShareSettings(
					userId,
					year,
					{ mode: ShareMode.PRIVATE_LINK },
					false // not admin
				);

				expect(updated.mode).toBe(ShareMode.PRIVATE_LINK);
				expect(updated.shareToken).not.toBeNull();
			});

			it('allows user to keep private-link if already set', async () => {
				// Admin sets private-link
				await updateShareSettings(userId, year, { mode: ShareMode.PRIVATE_LINK }, true);

				const updated = await updateShareSettings(
					userId,
					year,
					{ mode: ShareMode.PRIVATE_LINK },
					false
				);

				expect(updated.mode).toBe(ShareMode.PRIVATE_LINK);
			});

			it('denies user trying to change canUserControl', async () => {
				await expect(
					updateShareSettings(userId, year, { canUserControl: false }, false)
				).rejects.toBeInstanceOf(PermissionExceededError);
			});

			it('generates token when switching to private-link', async () => {
				const updated = await updateShareSettings(
					userId,
					year,
					{ mode: ShareMode.PRIVATE_LINK },
					true
				);

				expect(updated.shareToken).not.toBeNull();
				expect(isValidTokenFormat(updated.shareToken!)).toBe(true);
			});

			it('clears token when switching away from private-link', async () => {
				// Set to private-link first
				await updateShareSettings(userId, year, { mode: ShareMode.PRIVATE_LINK }, true);

				const updated = await updateShareSettings(userId, year, { mode: ShareMode.PUBLIC }, true);

				expect(updated.shareToken).toBeNull();
			});
		});

		describe('regenerateShareToken', () => {
			it('generates new token for private-link mode', async () => {
				const originalToken = generateShareToken();
				await db.insert(shareSettings).values({
					userId,
					year,
					mode: ShareMode.PRIVATE_LINK,
					shareToken: originalToken,
					canUserControl: false
				});

				const newToken = await regenerateShareToken(userId, year);

				expect(newToken).not.toBe(originalToken);
				expect(isValidTokenFormat(newToken)).toBe(true);
			});

			it('throws for non-existent settings', async () => {
				await expect(regenerateShareToken(userId, year)).rejects.toBeInstanceOf(
					ShareSettingsNotFoundError
				);
			});

			it('throws for non-private-link mode', async () => {
				await db.insert(shareSettings).values({
					userId,
					year,
					mode: ShareMode.PUBLIC,
					shareToken: null,
					canUserControl: false
				});

				await expect(regenerateShareToken(userId, year)).rejects.toThrow('private-link mode');
			});

			// Defense-in-depth regression for ISSUE-004: a row may legitimately be
			// `private-link` while the floor has been raised to `private-oauth`.
			// Token rotation must refuse rather than mint a usable URL below the
			// current floor.
			it('refuses regeneration when floor is more restrictive than private-link', async () => {
				await setGlobalShareDefaults({
					defaultShareMode: ShareMode.PRIVATE_OAUTH,
					allowUserControl: true
				});

				await db.insert(shareSettings).values({
					userId,
					year,
					mode: ShareMode.PRIVATE_LINK,
					shareToken: generateShareToken(),
					canUserControl: false
				});

				await expect(regenerateShareToken(userId, year)).rejects.toBeInstanceOf(
					PermissionExceededError
				);
			});

			it('allows regeneration when floor is at or below private-link', async () => {
				await setGlobalShareDefaults({
					defaultShareMode: ShareMode.PUBLIC,
					allowUserControl: true
				});

				const originalToken = generateShareToken();
				await db.insert(shareSettings).values({
					userId,
					year,
					mode: ShareMode.PRIVATE_LINK,
					shareToken: originalToken,
					canUserControl: false
				});

				const newToken = await regenerateShareToken(userId, year);
				expect(newToken).not.toBe(originalToken);
			});
		});

		describe('getShareSettingsByToken', () => {
			it('returns null for invalid token format', async () => {
				const settings = await getShareSettingsByToken('invalid-token');
				expect(settings).toBeNull();
			});

			it('returns null for non-existent token', async () => {
				const validToken = generateShareToken();
				const settings = await getShareSettingsByToken(validToken);
				expect(settings).toBeNull();
			});

			it('returns settings for valid token', async () => {
				const token = generateShareToken();
				await db.insert(shareSettings).values({
					userId,
					year,
					mode: ShareMode.PRIVATE_LINK,
					shareToken: token,
					canUserControl: false
				});

				const settings = await getShareSettingsByToken(token);
				expect(settings).not.toBeNull();
				expect(settings?.userId).toBe(userId);
				expect(settings?.year).toBe(year);
			});
		});

		describe('deleteShareSettings', () => {
			it('deletes existing settings', async () => {
				await db.insert(shareSettings).values({
					userId,
					year,
					mode: ShareMode.PUBLIC,
					shareToken: null,
					canUserControl: false
				});

				await deleteShareSettings(userId, year);

				const settings = await getShareSettings(userId, year);
				expect(settings).toBeNull();
			});

			it('does nothing for non-existent settings', async () => {
				// Should not throw
				await deleteShareSettings(userId, year);
			});
		});

		describe('getAllUserShareSettings', () => {
			it('returns empty array when no settings exist', async () => {
				const all = await getAllUserShareSettings(userId);
				expect(all).toEqual([]);
			});

			it('returns all years for a user', async () => {
				await db.insert(shareSettings).values([
					{ userId, year: 2022, mode: ShareMode.PUBLIC, shareToken: null, canUserControl: false },
					{
						userId,
						year: 2023,
						mode: ShareMode.PRIVATE_OAUTH,
						shareToken: null,
						canUserControl: true
					},
					{
						userId,
						year: 2024,
						mode: ShareMode.PRIVATE_LINK,
						shareToken: generateShareToken(),
						canUserControl: false
					}
				]);

				const all = await getAllUserShareSettings(userId);
				expect(all).toHaveLength(3);

				const years = all.map((s) => s.year).sort();
				expect(years).toEqual([2022, 2023, 2024]);
			});

			it('does not return other users settings', async () => {
				await db.insert(shareSettings).values([
					{ userId: 1, year, mode: ShareMode.PUBLIC, shareToken: null, canUserControl: false },
					{
						userId: 2,
						year,
						mode: ShareMode.PRIVATE_OAUTH,
						shareToken: null,
						canUserControl: false
					}
				]);

				const user1Settings = await getAllUserShareSettings(1);
				expect(user1Settings).toHaveLength(1);
				expect(user1Settings[0]?.userId).toBe(1);
			});
		});

		describe('Privacy Floor Enforcement', () => {
			beforeEach(async () => {
				await setGlobalShareDefaults({
					defaultShareMode: ShareMode.PRIVATE_LINK,
					allowUserControl: true
				});

				await db.insert(shareSettings).values({
					userId,
					year,
					mode: ShareMode.PRIVATE_LINK,
					shareToken: generateShareToken(),
					canUserControl: true
				});
			});

			it('denies user setting PUBLIC when floor is PRIVATE_LINK', async () => {
				await expect(
					updateShareSettings(userId, year, { mode: ShareMode.PUBLIC }, false)
				).rejects.toBeInstanceOf(PermissionExceededError);
			});

			it('denies user setting PUBLIC when floor is PRIVATE_OAUTH', async () => {
				await setGlobalShareDefaults({
					defaultShareMode: ShareMode.PRIVATE_OAUTH,
					allowUserControl: true
				});

				await expect(
					updateShareSettings(userId, year, { mode: ShareMode.PUBLIC }, false)
				).rejects.toBeInstanceOf(PermissionExceededError);
			});

			it('denies user setting PRIVATE_LINK when floor is PRIVATE_OAUTH', async () => {
				await setGlobalShareDefaults({
					defaultShareMode: ShareMode.PRIVATE_OAUTH,
					allowUserControl: true
				});

				await expect(
					updateShareSettings(userId, year, { mode: ShareMode.PRIVATE_LINK }, false)
				).rejects.toBeInstanceOf(PermissionExceededError);
			});

			it('allows user to set mode at floor level', async () => {
				const updated = await updateShareSettings(
					userId,
					year,
					{ mode: ShareMode.PRIVATE_LINK },
					false
				);

				expect(updated.mode).toBe(ShareMode.PRIVATE_LINK);
			});

			it('allows user to set more restrictive mode than floor', async () => {
				await setGlobalShareDefaults({
					defaultShareMode: ShareMode.PUBLIC,
					allowUserControl: true
				});

				const updated = await updateShareSettings(
					userId,
					year,
					{ mode: ShareMode.PRIVATE_OAUTH },
					false
				);

				expect(updated.mode).toBe(ShareMode.PRIVATE_OAUTH);
			});

			// SECURITY: admins must respect the server-wide floor too. To go below
			// the floor, admins must lower the global default first.
			it('denies admin setting PUBLIC when floor is PRIVATE_LINK', async () => {
				await expect(
					updateShareSettings(userId, year, { mode: ShareMode.PUBLIC }, true)
				).rejects.toBeInstanceOf(PermissionExceededError);
			});

			it('denies admin setting PRIVATE_LINK when floor is PRIVATE_OAUTH', async () => {
				await setGlobalShareDefaults({
					defaultShareMode: ShareMode.PRIVATE_OAUTH,
					allowUserControl: true
				});

				await expect(
					updateShareSettings(userId, year, { mode: ShareMode.PRIVATE_LINK }, true)
				).rejects.toBeInstanceOf(PermissionExceededError);
			});

			it('admins can still set mode at or above the floor', async () => {
				await setGlobalShareDefaults({
					defaultShareMode: ShareMode.PUBLIC,
					allowUserControl: true
				});

				const updated = await updateShareSettings(userId, year, { mode: ShareMode.PUBLIC }, true);
				expect(updated.mode).toBe(ShareMode.PUBLIC);
			});

			it('admins can update canUserControl regardless of floor', async () => {
				const updated = await updateShareSettings(userId, year, { canUserControl: false }, true);
				expect(updated.canUserControl).toBe(false);
			});
		});

		describe('Token Lifecycle', () => {
			beforeEach(async () => {
				await setGlobalShareDefaults({
					defaultShareMode: ShareMode.PUBLIC,
					allowUserControl: true
				});
			});

			it('preserves existing token when staying on PRIVATE_LINK', async () => {
				const originalToken = generateShareToken();
				await db.insert(shareSettings).values({
					userId,
					year,
					mode: ShareMode.PRIVATE_LINK,
					shareToken: originalToken,
					canUserControl: true
				});

				const updated = await updateShareSettings(
					userId,
					year,
					{ mode: ShareMode.PRIVATE_LINK },
					true
				);

				expect(updated.shareToken).toBe(originalToken);
			});

			it('nulls token when switching from PRIVATE_LINK to PUBLIC', async () => {
				await db.insert(shareSettings).values({
					userId,
					year,
					mode: ShareMode.PRIVATE_LINK,
					shareToken: generateShareToken(),
					canUserControl: true
				});

				const updated = await updateShareSettings(userId, year, { mode: ShareMode.PUBLIC }, true);

				expect(updated.shareToken).toBeNull();
			});

			it('nulls token when switching from PRIVATE_LINK to PRIVATE_OAUTH', async () => {
				await db.insert(shareSettings).values({
					userId,
					year,
					mode: ShareMode.PRIVATE_LINK,
					shareToken: generateShareToken(),
					canUserControl: true
				});

				const updated = await updateShareSettings(
					userId,
					year,
					{ mode: ShareMode.PRIVATE_OAUTH },
					true
				);

				expect(updated.shareToken).toBeNull();
			});

			it('generates new token when switching from PUBLIC to PRIVATE_LINK', async () => {
				await db.insert(shareSettings).values({
					userId,
					year,
					mode: ShareMode.PUBLIC,
					shareToken: null,
					canUserControl: true
				});

				const updated = await updateShareSettings(
					userId,
					year,
					{ mode: ShareMode.PRIVATE_LINK },
					true
				);

				expect(updated.shareToken).not.toBeNull();
				expect(isValidTokenFormat(updated.shareToken!)).toBe(true);
			});

			it('generates new token when switching from PRIVATE_OAUTH to PRIVATE_LINK', async () => {
				await db.insert(shareSettings).values({
					userId,
					year,
					mode: ShareMode.PRIVATE_OAUTH,
					shareToken: null,
					canUserControl: true
				});

				const updated = await updateShareSettings(
					userId,
					year,
					{ mode: ShareMode.PRIVATE_LINK },
					true
				);

				expect(updated.shareToken).not.toBeNull();
			});
		});

		describe('Logo Preference', () => {
			describe('updateUserLogoPreference', () => {
				it('updates showLogo when settings exist', async () => {
					await db.insert(shareSettings).values({
						userId,
						year,
						mode: ShareMode.PUBLIC,
						shareToken: null,
						canUserControl: false,
						showLogo: null
					});

					await updateUserLogoPreference(userId, year, true);

					const pref = await getUserLogoPreference(userId, year);
					expect(pref).toBe(true);
				});

				it('updates showLogo to false', async () => {
					await db.insert(shareSettings).values({
						userId,
						year,
						mode: ShareMode.PUBLIC,
						shareToken: null,
						canUserControl: false,
						showLogo: true
					});

					await updateUserLogoPreference(userId, year, false);

					const pref = await getUserLogoPreference(userId, year);
					expect(pref).toBe(false);
				});

				it('updates showLogo to null', async () => {
					await db.insert(shareSettings).values({
						userId,
						year,
						mode: ShareMode.PUBLIC,
						shareToken: null,
						canUserControl: false,
						showLogo: true
					});

					await updateUserLogoPreference(userId, year, null);

					const pref = await getUserLogoPreference(userId, year);
					expect(pref).toBeNull();
				});

				it('creates settings with global defaults when none exist', async () => {
					await setGlobalShareDefaults({
						defaultShareMode: ShareMode.PRIVATE_OAUTH,
						allowUserControl: true
					});

					await updateUserLogoPreference(userId, year, true);

					const settings = await getShareSettings(userId, year);
					expect(settings).not.toBeNull();
					expect(settings?.mode).toBe(ShareMode.PRIVATE_OAUTH);
					expect(settings?.canUserControl).toBe(true);

					const pref = await getUserLogoPreference(userId, year);
					expect(pref).toBe(true);
				});

				it('creates with token when default mode is PRIVATE_LINK', async () => {
					await setGlobalShareDefaults({
						defaultShareMode: ShareMode.PRIVATE_LINK,
						allowUserControl: false
					});

					await updateUserLogoPreference(userId, year, false);

					const settings = await getShareSettings(userId, year);
					expect(settings?.mode).toBe(ShareMode.PRIVATE_LINK);
					expect(settings?.shareToken).not.toBeNull();
					expect(settings?.shareToken).toBeDefined();
					expect(isValidTokenFormat(settings!.shareToken!)).toBe(true);
				});

				it('creates without token when default mode is PUBLIC', async () => {
					await setGlobalShareDefaults({
						defaultShareMode: ShareMode.PUBLIC,
						allowUserControl: true
					});

					await updateUserLogoPreference(userId, year, true);

					const settings = await getShareSettings(userId, year);
					expect(settings?.mode).toBe(ShareMode.PUBLIC);
					expect(settings?.shareToken).toBeNull();
				});
			});

			describe('getUserLogoPreference', () => {
				it('returns null when no settings exist', async () => {
					const pref = await getUserLogoPreference(userId, year);
					expect(pref).toBeNull();
				});

				it('returns null when settings exist but showLogo is null', async () => {
					await db.insert(shareSettings).values({
						userId,
						year,
						mode: ShareMode.PUBLIC,
						shareToken: null,
						canUserControl: false,
						showLogo: null
					});

					const pref = await getUserLogoPreference(userId, year);
					expect(pref).toBeNull();
				});

				it('returns true when showLogo is true', async () => {
					await db.insert(shareSettings).values({
						userId,
						year,
						mode: ShareMode.PUBLIC,
						shareToken: null,
						canUserControl: false,
						showLogo: true
					});

					const pref = await getUserLogoPreference(userId, year);
					expect(pref).toBe(true);
				});

				it('returns false when showLogo is false', async () => {
					await db.insert(shareSettings).values({
						userId,
						year,
						mode: ShareMode.PUBLIC,
						shareToken: null,
						canUserControl: false,
						showLogo: false
					});

					const pref = await getUserLogoPreference(userId, year);
					expect(pref).toBe(false);
				});
			});
		});
	});
});
