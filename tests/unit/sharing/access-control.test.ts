import { beforeEach, describe, expect, it } from 'bun:test';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { appSettings, shareSettings } from '$lib/server/db/schema';
import {
	checkAccess,
	checkServerWrappedAccess,
	checkTokenAccess,
	checkWrappedAccess
} from '$lib/server/sharing/access-control';
import {
	generateShareToken,
	setGlobalShareDefaults,
	setServerWrappedShareMode
} from '$lib/server/sharing/service';
import {
	getMoreRestrictiveMode,
	InvalidShareTokenError,
	meetsPrivacyFloor,
	ShareAccessDeniedError,
	ShareMode,
	ShareModePrivacyLevel
} from '$lib/server/sharing/types';

/**
 * Unit tests for Sharing Access Control
 *
 * Tests access control logic for wrapped pages.
 * Covers pure access check function and high-level route guards.
 *
 * Uses in-memory SQLite from test setup.
 */

describe('Sharing Access Control', () => {
	// Clean up tables before each test
	beforeEach(async () => {
		await db.delete(shareSettings);
		await db.delete(appSettings);
	});

	// =========================================================================
	// checkAccess - Pure Function Tests
	// =========================================================================

	describe('checkAccess', () => {
		describe('owner access', () => {
			it('allows owner access regardless of share mode', () => {
				const modes = [ShareMode.PUBLIC, ShareMode.PRIVATE_OAUTH, ShareMode.PRIVATE_LINK] as const;

				for (const shareMode of modes) {
					const result = checkAccess({
						shareMode,
						isOwner: true,
						isAuthenticated: false,
						isServerMember: false
					});

					expect(result.allowed).toBe(true);
					expect(result.reason).toBe('owner');
				}
			});
		});

		describe('public mode', () => {
			it('allows access to anyone', () => {
				const result = checkAccess({
					shareMode: ShareMode.PUBLIC,
					isOwner: false,
					isAuthenticated: false,
					isServerMember: false
				});

				expect(result.allowed).toBe(true);
				expect(result.reason).toBe('public');
			});

			it('allows access to authenticated users', () => {
				const result = checkAccess({
					shareMode: ShareMode.PUBLIC,
					isOwner: false,
					isAuthenticated: true,
					isServerMember: true
				});

				expect(result.allowed).toBe(true);
				expect(result.reason).toBe('public');
			});
		});

		describe('private-oauth mode', () => {
			it('denies access to unauthenticated users', () => {
				const result = checkAccess({
					shareMode: ShareMode.PRIVATE_OAUTH,
					isOwner: false,
					isAuthenticated: false,
					isServerMember: false
				});

				expect(result.allowed).toBe(false);
				expect(result.denialReason).toBe('not_authenticated');
			});

			it('denies access to authenticated non-members', () => {
				const result = checkAccess({
					shareMode: ShareMode.PRIVATE_OAUTH,
					isOwner: false,
					isAuthenticated: true,
					isServerMember: false
				});

				expect(result.allowed).toBe(false);
				expect(result.denialReason).toBe('mode_requires_auth');
			});

			it('allows access to authenticated server members', () => {
				const result = checkAccess({
					shareMode: ShareMode.PRIVATE_OAUTH,
					isOwner: false,
					isAuthenticated: true,
					isServerMember: true
				});

				expect(result.allowed).toBe(true);
				expect(result.reason).toBe('authenticated');
			});
		});

		describe('private-link mode', () => {
			const validToken = 'valid-token-123';

			it('denies access without token', () => {
				const result = checkAccess({
					shareMode: ShareMode.PRIVATE_LINK,
					validToken,
					isOwner: false,
					isAuthenticated: false,
					isServerMember: false
				});

				expect(result.allowed).toBe(false);
				expect(result.denialReason).toBe('invalid_token');
			});

			it('denies access with invalid token', () => {
				const result = checkAccess({
					shareMode: ShareMode.PRIVATE_LINK,
					shareToken: 'wrong-token',
					validToken,
					isOwner: false,
					isAuthenticated: false,
					isServerMember: false
				});

				expect(result.allowed).toBe(false);
				expect(result.denialReason).toBe('invalid_token');
			});

			it('allows access with valid token', () => {
				const result = checkAccess({
					shareMode: ShareMode.PRIVATE_LINK,
					shareToken: validToken,
					validToken,
					isOwner: false,
					isAuthenticated: false,
					isServerMember: false
				});

				expect(result.allowed).toBe(true);
				expect(result.reason).toBe('valid_token');
			});

			it('allows access to authenticated user with valid token', () => {
				const result = checkAccess({
					shareMode: ShareMode.PRIVATE_LINK,
					shareToken: validToken,
					validToken,
					isOwner: false,
					isAuthenticated: true,
					isServerMember: true
				});

				expect(result.allowed).toBe(true);
				expect(result.reason).toBe('valid_token');
			});
		});

		describe('unknown/invalid mode', () => {
			it('denies access for unknown share mode', () => {
				const result = checkAccess({
					shareMode: 'unknown-mode' as typeof ShareMode.PUBLIC,
					isOwner: false,
					isAuthenticated: false,
					isServerMember: false
				});

				expect(result.allowed).toBe(false);
				expect(result.denialReason).toBe('mode_requires_auth');
			});

			it('denies access for empty string mode', () => {
				const result = checkAccess({
					shareMode: '' as typeof ShareMode.PUBLIC,
					isOwner: false,
					isAuthenticated: true,
					isServerMember: true
				});

				expect(result.allowed).toBe(false);
				expect(result.denialReason).toBe('mode_requires_auth');
			});
		});
	});

	// =========================================================================
	// checkWrappedAccess - Integration Tests
	// =========================================================================

	describe('checkWrappedAccess', () => {
		const userId = 1;
		const year = 2024;

		describe('with public mode', () => {
			beforeEach(async () => {
				await setGlobalShareDefaults({
					defaultShareMode: ShareMode.PUBLIC,
					allowUserControl: false
				});
			});

			it('allows access to unauthenticated users', async () => {
				const result = await checkWrappedAccess({ userId, year });

				expect(result.accessReason).toBe('public');
				expect(result.settings.mode).toBe(ShareMode.PUBLIC);
			});

			it('allows access to authenticated users', async () => {
				const currentUser = { id: 2, plexId: 200, isAdmin: false };

				const result = await checkWrappedAccess({ userId, year, currentUser });

				expect(result.accessReason).toBe('public');
			});

			it('returns owner reason for page owner', async () => {
				const currentUser = { id: userId, plexId: 100, isAdmin: false };

				const result = await checkWrappedAccess({ userId, year, currentUser });

				expect(result.accessReason).toBe('owner');
			});

			it('returns owner reason for admin', async () => {
				const currentUser = { id: 999, plexId: 999, isAdmin: true };

				const result = await checkWrappedAccess({ userId, year, currentUser });

				expect(result.accessReason).toBe('owner');
			});
		});

		describe('with private-oauth mode', () => {
			beforeEach(async () => {
				await setGlobalShareDefaults({
					defaultShareMode: ShareMode.PRIVATE_OAUTH,
					allowUserControl: false
				});
			});

			it('throws ShareAccessDeniedError for unauthenticated users', async () => {
				try {
					await checkWrappedAccess({ userId, year });
					expect.unreachable('Should have thrown');
				} catch (error) {
					expect(error).toBeInstanceOf(ShareAccessDeniedError);
					expect((error as ShareAccessDeniedError).message).toBe(
						'You must be logged in to view this page.'
					);
				}
			});

			it('allows access to authenticated server members', async () => {
				const currentUser = { id: 2, plexId: 200, isAdmin: false };

				const result = await checkWrappedAccess({ userId, year, currentUser });

				expect(result.accessReason).toBe('authenticated');
			});

			it('allows owner access even when unauthenticated logic would deny', async () => {
				const currentUser = { id: userId, plexId: 100, isAdmin: false };

				const result = await checkWrappedAccess({ userId, year, currentUser });

				expect(result.accessReason).toBe('owner');
			});
		});

		describe('with private-link mode', () => {
			let validToken: string;

			beforeEach(async () => {
				validToken = generateShareToken();
				await db.insert(shareSettings).values({
					userId,
					year,
					mode: ShareMode.PRIVATE_LINK,
					shareToken: validToken,
					canUserControl: false
				});
			});

			it('throws InvalidShareTokenError without token', async () => {
				try {
					await checkWrappedAccess({ userId, year });
					expect.unreachable('Should have thrown');
				} catch (error) {
					expect(error).toBeInstanceOf(InvalidShareTokenError);
				}
			});

			it('throws InvalidShareTokenError with wrong token', async () => {
				try {
					await checkWrappedAccess({ userId, year, shareToken: 'wrong-token' });
					expect.unreachable('Should have thrown');
				} catch (error) {
					expect(error).toBeInstanceOf(InvalidShareTokenError);
				}
			});

			it('allows access with valid token', async () => {
				const result = await checkWrappedAccess({ userId, year, shareToken: validToken });

				expect(result.accessReason).toBe('valid_token');
			});

			it('allows owner access without token', async () => {
				const currentUser = { id: userId, plexId: 100, isAdmin: false };

				const result = await checkWrappedAccess({ userId, year, currentUser });

				expect(result.accessReason).toBe('owner');
			});

			it('allows admin access without token', async () => {
				const currentUser = { id: 999, plexId: 999, isAdmin: true };

				const result = await checkWrappedAccess({ userId, year, currentUser });

				expect(result.accessReason).toBe('owner');
			});
		});

		describe('auto-creates share settings', () => {
			it('creates settings with global defaults when none exist', async () => {
				await setGlobalShareDefaults({
					defaultShareMode: ShareMode.PUBLIC,
					allowUserControl: true
				});

				const result = await checkWrappedAccess({ userId, year });

				expect(result.settings.userId).toBe(userId);
				expect(result.settings.year).toBe(year);
				expect(result.settings.mode).toBe(ShareMode.PUBLIC);
				expect(result.settings.canUserControl).toBe(true);
			});
		});

		describe('error message mapping', () => {
			it('maps mode_requires_auth to server member required message', async () => {
				// Insert a share setting with an invalid/unknown mode to trigger default case
				await db.insert(shareSettings).values({
					userId,
					year,
					mode: 'unknown-mode' as typeof ShareMode.PUBLIC, // Invalid mode
					shareToken: null,
					canUserControl: false
				});

				try {
					await checkWrappedAccess({ userId, year });
					expect.unreachable('Should have thrown');
				} catch (error) {
					expect(error).toBeInstanceOf(ShareAccessDeniedError);
					expect((error as ShareAccessDeniedError).message).toContain('member of this Plex server');
				}
			});

			it('maps not_authenticated to login required message', async () => {
				await setGlobalShareDefaults({
					defaultShareMode: ShareMode.PRIVATE_OAUTH,
					allowUserControl: false
				});

				try {
					await checkWrappedAccess({ userId, year });
					expect.unreachable('Should have thrown');
				} catch (error) {
					expect(error).toBeInstanceOf(ShareAccessDeniedError);
					expect((error as ShareAccessDeniedError).message).toContain('logged in');
				}
			});

			it('maps invalid_token to InvalidShareTokenError', async () => {
				await db.insert(shareSettings).values({
					userId,
					year,
					mode: ShareMode.PRIVATE_LINK,
					shareToken: generateShareToken(),
					canUserControl: false
				});

				try {
					await checkWrappedAccess({ userId, year, shareToken: 'invalid' });
					expect.unreachable('Should have thrown');
				} catch (error) {
					expect(error).toBeInstanceOf(InvalidShareTokenError);
				}
			});
		});
	});

	// =========================================================================
	// checkTokenAccess - Token Validation Tests
	// =========================================================================

	describe('checkTokenAccess', () => {
		const userId = 1;
		const year = 2024;

		it('throws InvalidShareTokenError for non-existent token', async () => {
			const token = generateShareToken();

			try {
				await checkTokenAccess(token);
				expect.unreachable('Should have thrown');
			} catch (error) {
				expect(error).toBeInstanceOf(InvalidShareTokenError);
			}
		});

		it('throws InvalidShareTokenError for invalid token format', async () => {
			try {
				await checkTokenAccess('not-a-valid-uuid');
				expect.unreachable('Should have thrown');
			} catch (error) {
				expect(error).toBeInstanceOf(InvalidShareTokenError);
			}
		});

		it('throws InvalidShareTokenError when mode is not private-link', async () => {
			const token = generateShareToken();

			// Insert token but with PUBLIC mode (simulating mode change after token generation)
			await db.insert(shareSettings).values({
				userId,
				year,
				mode: ShareMode.PUBLIC, // Not PRIVATE_LINK
				shareToken: token,
				canUserControl: false
			});

			try {
				await checkTokenAccess(token);
				expect.unreachable('Should have thrown');
			} catch (error) {
				expect(error).toBeInstanceOf(InvalidShareTokenError);
				expect((error as InvalidShareTokenError).message).toContain('no longer valid');
			}
		});

		it('throws InvalidShareTokenError when mode is private-oauth', async () => {
			const token = generateShareToken();

			await db.insert(shareSettings).values({
				userId,
				year,
				mode: ShareMode.PRIVATE_OAUTH, // Not PRIVATE_LINK
				shareToken: token,
				canUserControl: false
			});

			try {
				await checkTokenAccess(token);
				expect.unreachable('Should have thrown');
			} catch (error) {
				expect(error).toBeInstanceOf(InvalidShareTokenError);
				expect((error as InvalidShareTokenError).message).toContain('no longer valid');
			}
		});

		it('returns settings for valid token with private-link mode', async () => {
			const token = generateShareToken();

			await db.insert(shareSettings).values({
				userId,
				year,
				mode: ShareMode.PRIVATE_LINK,
				shareToken: token,
				canUserControl: false
			});

			const result = await checkTokenAccess(token);

			expect(result.userId).toBe(userId);
			expect(result.year).toBe(year);
			expect(result.settings.mode).toBe(ShareMode.PRIVATE_LINK);
			expect(result.settings.shareToken).toBe(token);
		});

		it('returns correct userId and year from settings', async () => {
			const token = generateShareToken();
			const testUserId = 42;
			const testYear = 2023;

			await db.insert(shareSettings).values({
				userId: testUserId,
				year: testYear,
				mode: ShareMode.PRIVATE_LINK,
				shareToken: token,
				canUserControl: false
			});

			const result = await checkTokenAccess(token);

			expect(result.userId).toBe(testUserId);
			expect(result.year).toBe(testYear);
		});
	});

	// =========================================================================
	// Integration: Full Access Flow
	// =========================================================================

	describe('Integration: Access Flow', () => {
		const userId = 1;
		const year = 2024;

		it('complete flow: admin sets private-link, user shares token', async () => {
			const token = generateShareToken();

			// Admin creates private-link settings
			await db.insert(shareSettings).values({
				userId,
				year,
				mode: ShareMode.PRIVATE_LINK,
				shareToken: token,
				canUserControl: false
			});

			// Unauthenticated user with token can access via checkTokenAccess
			const tokenResult = await checkTokenAccess(token);
			expect(tokenResult.userId).toBe(userId);

			// And via checkWrappedAccess with token
			const wrappedResult = await checkWrappedAccess({ userId, year, shareToken: token });
			expect(wrappedResult.accessReason).toBe('valid_token');
		});

		it('complete flow: mode changed from private-link to public', async () => {
			const token = generateShareToken();

			// Start with private-link
			await db.insert(shareSettings).values({
				userId,
				year,
				mode: ShareMode.PRIVATE_LINK,
				shareToken: token,
				canUserControl: false
			});

			// Token works
			let result = await checkWrappedAccess({ userId, year, shareToken: token });
			expect(result.accessReason).toBe('valid_token');

			// Change to public
			await db
				.update(shareSettings)
				.set({ mode: ShareMode.PUBLIC })
				.where(and(eq(shareSettings.userId, userId), eq(shareSettings.year, year)));

			// Now anyone can access (no token needed)
			result = await checkWrappedAccess({ userId, year });
			expect(result.accessReason).toBe('public');

			// Old token no longer works via checkTokenAccess
			try {
				await checkTokenAccess(token);
				expect.unreachable('Should have thrown');
			} catch (error) {
				expect(error).toBeInstanceOf(InvalidShareTokenError);
			}
		});
	});

	// =========================================================================
	// Privacy Level Helpers - Floor Enforcement
	// =========================================================================

	describe('Privacy Level Helpers', () => {
		describe('ShareModePrivacyLevel', () => {
			it('has correct ordering (higher = more restrictive)', () => {
				expect(ShareModePrivacyLevel[ShareMode.PUBLIC]).toBe(0);
				expect(ShareModePrivacyLevel[ShareMode.PRIVATE_LINK]).toBe(1);
				expect(ShareModePrivacyLevel[ShareMode.PRIVATE_OAUTH]).toBe(2);

				// OAuth is most restrictive
				expect(ShareModePrivacyLevel[ShareMode.PRIVATE_OAUTH]).toBeGreaterThan(
					ShareModePrivacyLevel[ShareMode.PRIVATE_LINK]
				);
				expect(ShareModePrivacyLevel[ShareMode.PRIVATE_LINK]).toBeGreaterThan(
					ShareModePrivacyLevel[ShareMode.PUBLIC]
				);
			});
		});

		describe('getMoreRestrictiveMode', () => {
			it('returns private-oauth when comparing with public', () => {
				expect(getMoreRestrictiveMode(ShareMode.PUBLIC, ShareMode.PRIVATE_OAUTH)).toBe(
					ShareMode.PRIVATE_OAUTH
				);
				expect(getMoreRestrictiveMode(ShareMode.PRIVATE_OAUTH, ShareMode.PUBLIC)).toBe(
					ShareMode.PRIVATE_OAUTH
				);
			});

			it('returns private-oauth when comparing with private-link', () => {
				expect(getMoreRestrictiveMode(ShareMode.PRIVATE_LINK, ShareMode.PRIVATE_OAUTH)).toBe(
					ShareMode.PRIVATE_OAUTH
				);
				expect(getMoreRestrictiveMode(ShareMode.PRIVATE_OAUTH, ShareMode.PRIVATE_LINK)).toBe(
					ShareMode.PRIVATE_OAUTH
				);
			});

			it('returns private-link when comparing with public', () => {
				expect(getMoreRestrictiveMode(ShareMode.PUBLIC, ShareMode.PRIVATE_LINK)).toBe(
					ShareMode.PRIVATE_LINK
				);
				expect(getMoreRestrictiveMode(ShareMode.PRIVATE_LINK, ShareMode.PUBLIC)).toBe(
					ShareMode.PRIVATE_LINK
				);
			});

			it('returns same mode when both are equal', () => {
				expect(getMoreRestrictiveMode(ShareMode.PUBLIC, ShareMode.PUBLIC)).toBe(ShareMode.PUBLIC);
				expect(getMoreRestrictiveMode(ShareMode.PRIVATE_OAUTH, ShareMode.PRIVATE_OAUTH)).toBe(
					ShareMode.PRIVATE_OAUTH
				);
			});
		});

		describe('meetsPrivacyFloor', () => {
			it('returns true when user mode is more restrictive than floor', () => {
				expect(meetsPrivacyFloor(ShareMode.PRIVATE_OAUTH, ShareMode.PUBLIC)).toBe(true);
				expect(meetsPrivacyFloor(ShareMode.PRIVATE_OAUTH, ShareMode.PRIVATE_LINK)).toBe(true);
				expect(meetsPrivacyFloor(ShareMode.PRIVATE_LINK, ShareMode.PUBLIC)).toBe(true);
			});

			it('returns true when user mode equals floor', () => {
				expect(meetsPrivacyFloor(ShareMode.PUBLIC, ShareMode.PUBLIC)).toBe(true);
				expect(meetsPrivacyFloor(ShareMode.PRIVATE_OAUTH, ShareMode.PRIVATE_OAUTH)).toBe(true);
				expect(meetsPrivacyFloor(ShareMode.PRIVATE_LINK, ShareMode.PRIVATE_LINK)).toBe(true);
			});

			it('returns false when user mode is less restrictive than floor', () => {
				expect(meetsPrivacyFloor(ShareMode.PUBLIC, ShareMode.PRIVATE_OAUTH)).toBe(false);
				expect(meetsPrivacyFloor(ShareMode.PUBLIC, ShareMode.PRIVATE_LINK)).toBe(false);
				expect(meetsPrivacyFloor(ShareMode.PRIVATE_LINK, ShareMode.PRIVATE_OAUTH)).toBe(false);
			});
		});
	});

	// =========================================================================
	// Floor Enforcement in checkWrappedAccess
	// =========================================================================

	describe('Floor Enforcement', () => {
		const userId = 1;
		const year = 2024;

		describe('when user setting is public but floor is private-oauth', () => {
			beforeEach(async () => {
				// Set global floor to private-oauth
				await setGlobalShareDefaults({
					defaultShareMode: ShareMode.PRIVATE_OAUTH,
					allowUserControl: true
				});

				// Create user setting as public (less restrictive than floor)
				await db.insert(shareSettings).values({
					userId,
					year,
					mode: ShareMode.PUBLIC, // User wants public
					shareToken: null,
					canUserControl: true
				});
			});

			it('enforces floor by requiring authentication', async () => {
				// Unauthenticated should be denied (floor is OAuth)
				try {
					await checkWrappedAccess({ userId, year });
					expect.unreachable('Should have thrown');
				} catch (error) {
					expect(error).toBeInstanceOf(ShareAccessDeniedError);
				}
			});

			it('allows authenticated server members', async () => {
				const currentUser = { id: 2, plexId: 200, isAdmin: false };
				const result = await checkWrappedAccess({ userId, year, currentUser });
				expect(result.accessReason).toBe('authenticated');
			});

			it('returns effective mode (floor) in settings', async () => {
				const currentUser = { id: 2, plexId: 200, isAdmin: false };
				const result = await checkWrappedAccess({ userId, year, currentUser });
				// Effective mode should be the floor, not the user's setting
				expect(result.settings.mode).toBe(ShareMode.PRIVATE_OAUTH);
			});
		});

		describe('when user setting is more restrictive than floor', () => {
			beforeEach(async () => {
				// Set global floor to public
				await setGlobalShareDefaults({
					defaultShareMode: ShareMode.PUBLIC,
					allowUserControl: true
				});

				// Create user setting as private-oauth (more restrictive)
				await db.insert(shareSettings).values({
					userId,
					year,
					mode: ShareMode.PRIVATE_OAUTH, // More restrictive than floor
					shareToken: null,
					canUserControl: true
				});
			});

			it('respects user setting when more restrictive', async () => {
				// Unauthenticated should be denied (user wants OAuth)
				try {
					await checkWrappedAccess({ userId, year });
					expect.unreachable('Should have thrown');
				} catch (error) {
					expect(error).toBeInstanceOf(ShareAccessDeniedError);
				}
			});

			it('allows authenticated server members', async () => {
				const currentUser = { id: 2, plexId: 200, isAdmin: false };
				const result = await checkWrappedAccess({ userId, year, currentUser });
				expect(result.accessReason).toBe('authenticated');
			});
		});

		describe('owner bypass', () => {
			it('allows owner access regardless of floor', async () => {
				await setGlobalShareDefaults({
					defaultShareMode: ShareMode.PRIVATE_OAUTH,
					allowUserControl: false
				});

				const currentUser = { id: userId, plexId: 100, isAdmin: false };
				const result = await checkWrappedAccess({ userId, year, currentUser });
				expect(result.accessReason).toBe('owner');
			});

			it('allows admin access regardless of floor', async () => {
				await setGlobalShareDefaults({
					defaultShareMode: ShareMode.PRIVATE_OAUTH,
					allowUserControl: false
				});

				const currentUser = { id: 999, plexId: 999, isAdmin: true };
				const result = await checkWrappedAccess({ userId, year, currentUser });
				expect(result.accessReason).toBe('owner');
			});
		});
	});

	// =========================================================================
	// Server-Wide Wrapped Access Control
	// =========================================================================

	describe('checkServerWrappedAccess', () => {
		const year = 2024;

		describe('with public mode', () => {
			beforeEach(async () => {
				await setServerWrappedShareMode(ShareMode.PUBLIC);
			});

			it('allows unauthenticated access', async () => {
				const result = await checkServerWrappedAccess({ year });
				expect(result.accessReason).toBe('public');
				expect(result.shareMode).toBe(ShareMode.PUBLIC);
			});

			it('allows authenticated access', async () => {
				const currentUser = { id: 1, plexId: 100, isAdmin: false };
				const result = await checkServerWrappedAccess({ year, currentUser });
				expect(result.accessReason).toBe('public');
			});

			it('returns owner reason for admin', async () => {
				const currentUser = { id: 1, plexId: 100, isAdmin: true };
				const result = await checkServerWrappedAccess({ year, currentUser });
				expect(result.accessReason).toBe('owner');
			});
		});

		describe('with private-oauth mode', () => {
			beforeEach(async () => {
				await setServerWrappedShareMode(ShareMode.PRIVATE_OAUTH);
			});

			it('denies unauthenticated access', async () => {
				try {
					await checkServerWrappedAccess({ year });
					expect.unreachable('Should have thrown');
				} catch (error) {
					expect(error).toBeInstanceOf(ShareAccessDeniedError);
					expect((error as ShareAccessDeniedError).message).toContain('logged in');
				}
			});

			it('allows authenticated server members', async () => {
				const currentUser = { id: 1, plexId: 100, isAdmin: false };
				const result = await checkServerWrappedAccess({ year, currentUser });
				expect(result.accessReason).toBe('authenticated');
			});

			it('allows admin access', async () => {
				const currentUser = { id: 1, plexId: 100, isAdmin: true };
				const result = await checkServerWrappedAccess({ year, currentUser });
				expect(result.accessReason).toBe('owner');
			});
		});

		describe('defaults to public when not set', () => {
			it('allows unauthenticated access by default', async () => {
				// Don't set any mode - should default to public
				const result = await checkServerWrappedAccess({ year });
				expect(result.accessReason).toBe('public');
				expect(result.shareMode).toBe(ShareMode.PUBLIC);
			});
		});
	});
});
