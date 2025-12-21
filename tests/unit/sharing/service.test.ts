import { describe, expect, it, beforeEach } from 'bun:test';
import { db } from '$lib/server/db/client';
import { shareSettings, appSettings } from '$lib/server/db/schema';
import {
	generateShareToken,
	isValidTokenFormat,
	getGlobalDefaultShareMode,
	getGlobalAllowUserControl,
	setGlobalShareDefaults,
	getShareSettings,
	getOrCreateShareSettings,
	updateShareSettings,
	regenerateShareToken,
	getShareSettingsByToken,
	deleteShareSettings,
	getAllUserShareSettings
} from '$lib/server/sharing/service';
import {
	ShareMode,
	ShareSettingsKey,
	ShareSettingsNotFoundError,
	PermissionExceededError
} from '$lib/server/sharing/types';

/**
 * Unit tests for Sharing Service
 *
 * Tests database operations for share settings management.
 * Uses in-memory SQLite from test setup.
 */

describe('Sharing Service', () => {
	// Clean up tables before each test
	beforeEach(async () => {
		await db.delete(shareSettings);
		await db.delete(appSettings);
	});

	// =========================================================================
	// Token Generation
	// =========================================================================

	describe('Token Generation', () => {
		it('generateShareToken creates valid UUID v4 tokens', () => {
			const token = generateShareToken();
			expect(isValidTokenFormat(token)).toBe(true);
		});

		it('isValidTokenFormat accepts valid UUID v4', () => {
			expect(isValidTokenFormat('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
			expect(isValidTokenFormat('A50E8400-E29B-41D4-B716-446655440000')).toBe(true);
		});

		it('isValidTokenFormat rejects invalid formats', () => {
			expect(isValidTokenFormat('')).toBe(false);
			expect(isValidTokenFormat('not-a-uuid')).toBe(false);
			expect(isValidTokenFormat('550e8400-e29b-51d4-a716-446655440000')).toBe(false); // Wrong version
			expect(isValidTokenFormat('550e8400-e29b-41d4')).toBe(false); // Too short
		});
	});

	// =========================================================================
	// Global Defaults
	// =========================================================================

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
				// Insert initial values
				await setGlobalShareDefaults({
					defaultShareMode: ShareMode.PUBLIC,
					allowUserControl: false
				});

				// Update values
				await setGlobalShareDefaults({
					defaultShareMode: ShareMode.PRIVATE_OAUTH,
					allowUserControl: true
				});

				const mode = await getGlobalDefaultShareMode();
				const allowed = await getGlobalAllowUserControl();

				expect(mode).toBe(ShareMode.PRIVATE_OAUTH);
				expect(allowed).toBe(true);
			});
		});
	});

	// =========================================================================
	// Share Settings CRUD
	// =========================================================================

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
				expect(settings.shareToken).not.toBeNull();
				expect(isValidTokenFormat(settings.shareToken!)).toBe(true);
			});

			it('returns existing settings without modification', async () => {
				const existingToken = generateShareToken();
				await db.insert(shareSettings).values({
					userId,
					year,
					mode: ShareMode.PRIVATE_LINK,
					shareToken: existingToken,
					canUserControl: false
				});

				const settings = await getOrCreateShareSettings({ userId, year });

				expect(settings.shareToken).toBe(existingToken);
			});

			it('throws when createIfMissing is false and settings do not exist', async () => {
				await expect(
					getOrCreateShareSettings({ userId, year, createIfMissing: false })
				).rejects.toBeInstanceOf(ShareSettingsNotFoundError);
			});
		});

		describe('updateShareSettings', () => {
			beforeEach(async () => {
				// Create initial settings
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

				// User changes to public
				const updated = await updateShareSettings(
					userId,
					year,
					{ mode: ShareMode.PUBLIC },
					false // not admin
				);

				expect(updated.mode).toBe(ShareMode.PUBLIC);
			});

			it('denies user without canUserControl', async () => {
				// Remove user control permission
				await updateShareSettings(userId, year, { canUserControl: false }, true);

				await expect(
					updateShareSettings(userId, year, { mode: ShareMode.PRIVATE_OAUTH }, false)
				).rejects.toBeInstanceOf(PermissionExceededError);
			});

			it('denies user trying to enable private-link', async () => {
				await expect(
					updateShareSettings(userId, year, { mode: ShareMode.PRIVATE_LINK }, false)
				).rejects.toBeInstanceOf(PermissionExceededError);
			});

			it('allows user to keep private-link if already set', async () => {
				// Admin sets private-link
				await updateShareSettings(userId, year, { mode: ShareMode.PRIVATE_LINK }, true);

				// User updates something else (mode stays the same)
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

				// Switch to public
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
	});
});
