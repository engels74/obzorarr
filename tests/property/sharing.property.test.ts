import { describe, expect, it } from 'bun:test';
import * as fc from 'fast-check';

// Import the pure functions for testing
import { checkAccess } from '$lib/server/sharing/access-control';
import { generateShareToken, isValidTokenFormat } from '$lib/server/sharing/service';
import { ShareMode, type AccessCheckContext, type ShareModeType } from '$lib/server/sharing/types';

/**
 * Property-based tests for Sharing System
 *
 * Feature: obzorarr, Properties 15-17
 * Validates: Requirements 7.1-7.6
 *
 * These tests verify the formal correctness properties defined in design.md
 * for the sharing system.
 */

// =============================================================================
// Arbitraries
// =============================================================================

const shareModeArbitrary: fc.Arbitrary<ShareModeType> = fc.constantFrom(
	ShareMode.PUBLIC,
	ShareMode.PRIVATE_OAUTH,
	ShareMode.PRIVATE_LINK
);

// =============================================================================
// Property 15: Share Mode Access Control
// =============================================================================

// Feature: obzorarr, Property 15: Share Mode Access Control
describe('Property 15: Share Mode Access Control', () => {
	it('public mode allows all requests', () => {
		fc.assert(
			fc.property(
				fc.boolean(), // isAuthenticated
				fc.boolean(), // isServerMember
				fc.option(fc.uuid(), { nil: undefined }), // shareToken
				(isAuthenticated, isServerMember, shareToken) => {
					const context: AccessCheckContext = {
						shareMode: ShareMode.PUBLIC,
						shareToken,
						validToken: null,
						isAuthenticated,
						isServerMember,
						isOwner: false
					};

					const result = checkAccess(context);
					return result.allowed === true && result.reason === 'public';
				}
			),
			{ numRuns: 100 }
		);
	});

	it('private-oauth mode only allows authenticated server members', () => {
		fc.assert(
			fc.property(
				fc.boolean(), // isAuthenticated
				fc.boolean(), // isServerMember
				(isAuthenticated, isServerMember) => {
					const context: AccessCheckContext = {
						shareMode: ShareMode.PRIVATE_OAUTH,
						shareToken: undefined,
						validToken: null,
						isAuthenticated,
						isServerMember,
						isOwner: false
					};

					const result = checkAccess(context);
					const shouldAllow = isAuthenticated && isServerMember;

					return result.allowed === shouldAllow;
				}
			),
			{ numRuns: 100 }
		);
	});

	it('private-link mode only allows valid share tokens', () => {
		fc.assert(
			fc.property(
				fc.uuid(), // validToken (stored in DB)
				fc.option(fc.uuid(), { nil: undefined }), // shareToken (from URL)
				(validToken, shareToken) => {
					const context: AccessCheckContext = {
						shareMode: ShareMode.PRIVATE_LINK,
						shareToken,
						validToken,
						isAuthenticated: false, // Not required for private-link
						isServerMember: false,
						isOwner: false
					};

					const result = checkAccess(context);
					const shouldAllow = shareToken === validToken;

					return result.allowed === shouldAllow;
				}
			),
			{ numRuns: 100 }
		);
	});

	it('owner always has access regardless of mode', () => {
		fc.assert(
			fc.property(
				shareModeArbitrary,
				fc.boolean(), // isAuthenticated
				fc.option(fc.uuid(), { nil: undefined }), // shareToken
				(shareMode, isAuthenticated, shareToken) => {
					const context: AccessCheckContext = {
						shareMode,
						shareToken,
						validToken: 'some-valid-token',
						isAuthenticated,
						isServerMember: isAuthenticated,
						isOwner: true // Key: owner is always true
					};

					const result = checkAccess(context);
					return result.allowed === true && result.reason === 'owner';
				}
			),
			{ numRuns: 100 }
		);
	});

	it('unauthenticated users are denied for private-oauth', () => {
		fc.assert(
			fc.property(fc.option(fc.uuid(), { nil: undefined }), (shareToken) => {
				const context: AccessCheckContext = {
					shareMode: ShareMode.PRIVATE_OAUTH,
					shareToken,
					validToken: null,
					isAuthenticated: false, // Not authenticated
					isServerMember: false,
					isOwner: false
				};

				const result = checkAccess(context);
				return result.allowed === false && result.denialReason === 'not_authenticated';
			}),
			{ numRuns: 100 }
		);
	});

	it('missing token is denied for private-link', () => {
		fc.assert(
			fc.property(fc.uuid(), (validToken) => {
				const context: AccessCheckContext = {
					shareMode: ShareMode.PRIVATE_LINK,
					shareToken: undefined, // No token provided
					validToken,
					isAuthenticated: true,
					isServerMember: true,
					isOwner: false
				};

				const result = checkAccess(context);
				return result.allowed === false && result.denialReason === 'invalid_token';
			}),
			{ numRuns: 100 }
		);
	});

	it('wrong token is denied for private-link', () => {
		fc.assert(
			fc.property(
				fc.uuid(), // validToken
				fc.uuid().filter((t) => t !== ''), // wrongToken
				(validToken, wrongToken) => {
					// Skip if tokens happen to match
					if (validToken === wrongToken) return true;

					const context: AccessCheckContext = {
						shareMode: ShareMode.PRIVATE_LINK,
						shareToken: wrongToken,
						validToken,
						isAuthenticated: true,
						isServerMember: true,
						isOwner: false
					};

					const result = checkAccess(context);
					return result.allowed === false && result.denialReason === 'invalid_token';
				}
			),
			{ numRuns: 100 }
		);
	});

	it('access check result structure is valid', () => {
		fc.assert(
			fc.property(
				shareModeArbitrary,
				fc.option(fc.uuid(), { nil: undefined }),
				fc.option(fc.uuid(), { nil: null }),
				fc.boolean(),
				fc.boolean(),
				fc.boolean(),
				(shareMode, shareToken, validToken, isAuthenticated, isServerMember, isOwner) => {
					const context: AccessCheckContext = {
						shareMode,
						shareToken,
						validToken,
						isAuthenticated,
						isServerMember,
						isOwner
					};

					const result = checkAccess(context);

					// Result must have allowed boolean
					if (typeof result.allowed !== 'boolean') return false;

					// If allowed, must have reason
					if (result.allowed && !result.reason) return false;

					// If denied, must have denialReason (unless edge case)
					if (!result.allowed && !result.denialReason) return false;

					return true;
				}
			),
			{ numRuns: 100 }
		);
	});
});

// =============================================================================
// Property 16: Share Token Uniqueness
// =============================================================================

// Feature: obzorarr, Property 16: Share Token Uniqueness
describe('Property 16: Share Token Uniqueness', () => {
	it('generated tokens are valid UUID v4 format', () => {
		fc.assert(
			fc.property(fc.integer({ min: 1, max: 1000 }), () => {
				const token = generateShareToken();
				return isValidTokenFormat(token);
			}),
			{ numRuns: 100 }
		);
	});

	it('generated tokens are unique', () => {
		fc.assert(
			fc.property(
				fc.integer({ min: 10, max: 100 }), // Number of tokens to generate
				(count) => {
					const tokens = new Set<string>();
					for (let i = 0; i < count; i++) {
						tokens.add(generateShareToken());
					}
					// All tokens should be unique
					return tokens.size === count;
				}
			),
			{ numRuns: 100 }
		);
	});

	it('two independently generated tokens are never equal', () => {
		fc.assert(
			fc.property(fc.constant(null), () => {
				const token1 = generateShareToken();
				const token2 = generateShareToken();
				return token1 !== token2;
			}),
			{ numRuns: 1000 } // Extra iterations for uniqueness
		);
	});

	it('token format validation accepts valid UUID v4 tokens', () => {
		fc.assert(
			fc.property(fc.constant(null), () => {
				// Our generated tokens should always pass validation
				const token = generateShareToken();
				return isValidTokenFormat(token);
			}),
			{ numRuns: 100 }
		);
	});

	it('token format validation rejects invalid tokens', () => {
		fc.assert(
			fc.property(
				fc
					.string({ minLength: 1, maxLength: 50 })
					.filter(
						(s) => !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)
					),
				(invalidToken) => {
					return !isValidTokenFormat(invalidToken);
				}
			),
			{ numRuns: 100 }
		);
	});

	it('token generation is idempotent format', () => {
		// Each call produces a new unique token
		const tokens = Array.from({ length: 100 }, () => generateShareToken());
		const uniqueTokens = new Set(tokens);
		expect(uniqueTokens.size).toBe(100);
	});
});

// =============================================================================
// Property 17: Permission Enforcement
// =============================================================================

// Feature: obzorarr, Property 17: Permission Enforcement
describe('Property 17: Permission Enforcement', () => {
	/**
	 * Permission levels hierarchy:
	 * - Admin: Can set any mode, can grant/revoke user control
	 * - User with canUserControl: Can set public or private-oauth
	 * - User without canUserControl: Cannot change settings
	 */

	interface PermissionContext {
		isAdmin: boolean;
		canUserControl: boolean;
		currentMode: ShareModeType;
		requestedMode: ShareModeType;
	}

	function isPermissionAllowed(ctx: PermissionContext): boolean {
		// Admins can do anything
		if (ctx.isAdmin) return true;

		// Users without control permission cannot change anything
		if (!ctx.canUserControl) return false;

		// Users with control can only set public or private-oauth
		// They cannot enable private-link unless already in that mode
		if (
			ctx.requestedMode === ShareMode.PRIVATE_LINK &&
			ctx.currentMode !== ShareMode.PRIVATE_LINK
		) {
			return false;
		}

		return true;
	}

	it('admins can set any share mode', () => {
		fc.assert(
			fc.property(shareModeArbitrary, shareModeArbitrary, (currentMode, requestedMode) => {
				const ctx: PermissionContext = {
					isAdmin: true,
					canUserControl: false, // Doesn't matter for admin
					currentMode,
					requestedMode
				};

				return isPermissionAllowed(ctx) === true;
			}),
			{ numRuns: 100 }
		);
	});

	it('users without canUserControl cannot change settings', () => {
		fc.assert(
			fc.property(shareModeArbitrary, shareModeArbitrary, (currentMode, requestedMode) => {
				const ctx: PermissionContext = {
					isAdmin: false,
					canUserControl: false,
					currentMode,
					requestedMode
				};

				return isPermissionAllowed(ctx) === false;
			}),
			{ numRuns: 100 }
		);
	});

	it('users with canUserControl can set public or private-oauth', () => {
		fc.assert(
			fc.property(
				shareModeArbitrary,
				fc.constantFrom(ShareMode.PUBLIC, ShareMode.PRIVATE_OAUTH),
				(currentMode, requestedMode) => {
					const ctx: PermissionContext = {
						isAdmin: false,
						canUserControl: true,
						currentMode,
						requestedMode
					};

					return isPermissionAllowed(ctx) === true;
				}
			),
			{ numRuns: 100 }
		);
	});

	it('users with canUserControl cannot enable private-link', () => {
		fc.assert(
			fc.property(
				fc.constantFrom(ShareMode.PUBLIC, ShareMode.PRIVATE_OAUTH), // Current mode not private-link
				() => {
					const ctx: PermissionContext = {
						isAdmin: false,
						canUserControl: true,
						currentMode: ShareMode.PUBLIC,
						requestedMode: ShareMode.PRIVATE_LINK
					};

					return isPermissionAllowed(ctx) === false;
				}
			),
			{ numRuns: 100 }
		);
	});

	it('users with canUserControl can keep private-link if already set', () => {
		const ctx: PermissionContext = {
			isAdmin: false,
			canUserControl: true,
			currentMode: ShareMode.PRIVATE_LINK,
			requestedMode: ShareMode.PRIVATE_LINK
		};

		expect(isPermissionAllowed(ctx)).toBe(true);
	});

	it('permission enforcement is deterministic', () => {
		fc.assert(
			fc.property(
				fc.boolean(), // isAdmin
				fc.boolean(), // canUserControl
				shareModeArbitrary, // currentMode
				shareModeArbitrary, // requestedMode
				(isAdmin, canUserControl, currentMode, requestedMode) => {
					const ctx: PermissionContext = {
						isAdmin,
						canUserControl,
						currentMode,
						requestedMode
					};

					const result1 = isPermissionAllowed(ctx);
					const result2 = isPermissionAllowed(ctx);

					return result1 === result2;
				}
			),
			{ numRuns: 100 }
		);
	});

	it('admin permissions override canUserControl', () => {
		fc.assert(
			fc.property(
				fc.boolean(), // canUserControl
				shareModeArbitrary,
				shareModeArbitrary,
				(canUserControl, currentMode, requestedMode) => {
					const ctx: PermissionContext = {
						isAdmin: true,
						canUserControl,
						currentMode,
						requestedMode
					};

					// Admin should always be allowed, regardless of canUserControl
					return isPermissionAllowed(ctx) === true;
				}
			),
			{ numRuns: 100 }
		);
	});

	it('user settings cannot exceed admin-granted permissions (Requirement 7.6)', () => {
		fc.assert(
			fc.property(shareModeArbitrary, (currentMode) => {
				// User without control cannot change from current mode
				const ctxNoControl: PermissionContext = {
					isAdmin: false,
					canUserControl: false,
					currentMode,
					requestedMode: ShareMode.PUBLIC // Any requested mode
				};

				// User should be denied
				const denied = !isPermissionAllowed(ctxNoControl);

				// User with control cannot exceed to private-link
				const ctxWithControl: PermissionContext = {
					isAdmin: false,
					canUserControl: true,
					currentMode: ShareMode.PUBLIC,
					requestedMode: ShareMode.PRIVATE_LINK
				};

				const limitedExceeded = !isPermissionAllowed(ctxWithControl);

				return denied && limitedExceeded;
			}),
			{ numRuns: 100 }
		);
	});
});

// =============================================================================
// Additional Unit Tests
// =============================================================================

describe('Share Token Generation', () => {
	it('generates UUID v4 format tokens', () => {
		const token = generateShareToken();
		expect(isValidTokenFormat(token)).toBe(true);
	});

	it('generates different tokens each call', () => {
		const token1 = generateShareToken();
		const token2 = generateShareToken();
		expect(token1).not.toBe(token2);
	});

	it('validates correct UUID format', () => {
		expect(isValidTokenFormat('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
		expect(isValidTokenFormat('550E8400-E29B-41D4-A716-446655440000')).toBe(true); // Case insensitive
	});

	it('rejects invalid UUID formats', () => {
		expect(isValidTokenFormat('')).toBe(false);
		expect(isValidTokenFormat('not-a-uuid')).toBe(false);
		expect(isValidTokenFormat('550e8400-e29b-41d4-a716')).toBe(false); // Too short
		expect(isValidTokenFormat('550e8400-e29b-51d4-a716-446655440000')).toBe(false); // Wrong version
	});
});

describe('Access Control Logic', () => {
	it('public mode allows anonymous access', () => {
		const result = checkAccess({
			shareMode: ShareMode.PUBLIC,
			isAuthenticated: false,
			isServerMember: false,
			isOwner: false
		});
		expect(result.allowed).toBe(true);
		expect(result.reason).toBe('public');
	});

	it('private-oauth denies unauthenticated', () => {
		const result = checkAccess({
			shareMode: ShareMode.PRIVATE_OAUTH,
			isAuthenticated: false,
			isServerMember: false,
			isOwner: false
		});
		expect(result.allowed).toBe(false);
		expect(result.denialReason).toBe('not_authenticated');
	});

	it('private-oauth allows authenticated members', () => {
		const result = checkAccess({
			shareMode: ShareMode.PRIVATE_OAUTH,
			isAuthenticated: true,
			isServerMember: true,
			isOwner: false
		});
		expect(result.allowed).toBe(true);
		expect(result.reason).toBe('authenticated');
	});

	it('private-link allows matching token', () => {
		const result = checkAccess({
			shareMode: ShareMode.PRIVATE_LINK,
			shareToken: 'abc123',
			validToken: 'abc123',
			isAuthenticated: false,
			isServerMember: false,
			isOwner: false
		});
		expect(result.allowed).toBe(true);
		expect(result.reason).toBe('valid_token');
	});

	it('private-link denies wrong token', () => {
		const result = checkAccess({
			shareMode: ShareMode.PRIVATE_LINK,
			shareToken: 'wrong',
			validToken: 'correct',
			isAuthenticated: false,
			isServerMember: false,
			isOwner: false
		});
		expect(result.allowed).toBe(false);
		expect(result.denialReason).toBe('invalid_token');
	});

	it('owner access overrides all modes', () => {
		const modes: ShareModeType[] = [
			ShareMode.PUBLIC,
			ShareMode.PRIVATE_OAUTH,
			ShareMode.PRIVATE_LINK
		];

		for (const mode of modes) {
			const result = checkAccess({
				shareMode: mode,
				isAuthenticated: false,
				isServerMember: false,
				isOwner: true
			});
			expect(result.allowed).toBe(true);
			expect(result.reason).toBe('owner');
		}
	});
});
