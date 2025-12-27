import { describe, expect, it } from 'bun:test';
import * as fc from 'fast-check';

// Import the pure functions for testing
import { applyAnonymization, generateAnonymousIdentifier } from '$lib/server/anonymization/service';
import { AnonymizationMode, type AnonymizationModeType } from '$lib/server/anonymization/types';

/**
 * Property-based tests for Anonymization System
 *
 * Property 18: Anonymization Mode Display
 * For any anonymization mode M and viewing user V:
 * - If M = 'real': all usernames SHALL be displayed as-is
 * - If M = 'anonymous': all usernames SHALL be replaced with generic identifiers
 * - If M = 'hybrid': only V's username SHALL be displayed, others anonymized
 *
 * These tests verify the formal correctness properties defined in design.md
 * for the anonymization system.
 */

// =============================================================================
// Arbitraries
// =============================================================================

const anonymizationModeArbitrary: fc.Arbitrary<AnonymizationModeType> = fc.constantFrom(
	AnonymizationMode.REAL,
	AnonymizationMode.ANONYMOUS,
	AnonymizationMode.HYBRID
);

/**
 * User display info for testing
 */
interface TestUserDisplay {
	userId: number;
	username: string;
	totalMinutes: number;
	rank: number;
}

/**
 * Generate a user display object (similar to topViewers items)
 */
const userDisplayArbitrary: fc.Arbitrary<TestUserDisplay> = fc.record({
	userId: fc.integer({ min: 1, max: 10000 }),
	username: fc.string({ minLength: 1, maxLength: 50 }),
	totalMinutes: fc.integer({ min: 0, max: 100000 }),
	rank: fc.integer({ min: 1, max: 100 })
});

/**
 * Generate a non-empty array of users with unique userIds
 */
const uniqueUsersArbitrary: fc.Arbitrary<TestUserDisplay[]> = fc
	.array(userDisplayArbitrary, { minLength: 1, maxLength: 10 })
	.map((users) => {
		// Ensure unique userIds by adding index to userId
		return users.map((user, index) => ({
			...user,
			userId: user.userId * 1000 + index // Ensure uniqueness
		}));
	});

// =============================================================================
// Property 18: Anonymization Mode Display
// =============================================================================

// Feature: obzorarr, Property 18: Anonymization Mode Display
describe('Property 18: Anonymization Mode Display', () => {
	// -------------------------------------------------------------------------
	// Real mode displays all usernames as-is
	// -------------------------------------------------------------------------

	it('real mode displays all usernames as-is', () => {
		fc.assert(
			fc.property(
				uniqueUsersArbitrary,
				fc.option(fc.integer({ min: 1, max: 10000 }), { nil: null }), // viewingUserId
				(users, viewingUserId) => {
					const result = applyAnonymization(users, AnonymizationMode.REAL, viewingUserId);

					// All usernames should match original
					return result.every((user, index) => {
						const original = users[index];
						return original !== undefined && user.username === original.username;
					});
				}
			),
			{ numRuns: 100 }
		);
	});

	it('real mode preserves all other user properties', () => {
		fc.assert(
			fc.property(uniqueUsersArbitrary, (users) => {
				const result = applyAnonymization(users, AnonymizationMode.REAL, null);

				// All properties should be preserved
				return result.every((user, index) => {
					const original = users[index];
					return (
						original !== undefined &&
						user.userId === original.userId &&
						user.totalMinutes === original.totalMinutes &&
						user.rank === original.rank
					);
				});
			}),
			{ numRuns: 100 }
		);
	});

	// -------------------------------------------------------------------------
	// Anonymous mode replaces all usernames
	// -------------------------------------------------------------------------

	it('anonymous mode replaces all usernames with identifiers', () => {
		fc.assert(
			fc.property(
				uniqueUsersArbitrary,
				fc.option(fc.integer({ min: 1, max: 10000 }), { nil: null }),
				(users, viewingUserId) => {
					const result = applyAnonymization(users, AnonymizationMode.ANONYMOUS, viewingUserId);

					// All usernames should be anonymous identifiers
					return result.every((user, index) => {
						const expected = generateAnonymousIdentifier(index);
						return user.username === expected;
					});
				}
			),
			{ numRuns: 100 }
		);
	});

	it('anonymous mode creates consistent identifier format', () => {
		fc.assert(
			fc.property(uniqueUsersArbitrary, (users) => {
				const result = applyAnonymization(users, AnonymizationMode.ANONYMOUS, null);

				// All usernames should match "User #N" pattern
				return result.every((user, index) => user.username === `User #${index + 1}`);
			}),
			{ numRuns: 100 }
		);
	});

	// -------------------------------------------------------------------------
	// Hybrid mode shows viewing user's name only
	// -------------------------------------------------------------------------

	it('hybrid mode shows viewing user their name, anonymizes others', () => {
		fc.assert(
			fc.property(
				uniqueUsersArbitrary.filter((users) => users.length >= 2),
				(users) => {
					// Pick the first user as the viewing user
					const viewingUserId = users[0]!.userId;
					const originalUsername = users[0]!.username;

					const result = applyAnonymization(users, AnonymizationMode.HYBRID, viewingUserId);

					// Viewing user should see their own name
					const viewingUserResult = result[0];
					if (!viewingUserResult || viewingUserResult.username !== originalUsername) {
						return false;
					}

					// Others should be anonymized
					return result.slice(1).every((user, index) => {
						const expectedAnonymous = generateAnonymousIdentifier(index + 1);
						return user.username === expectedAnonymous;
					});
				}
			),
			{ numRuns: 100 }
		);
	});

	it('hybrid mode with null viewingUserId falls back to anonymous', () => {
		fc.assert(
			fc.property(uniqueUsersArbitrary, (users) => {
				const result = applyAnonymization(users, AnonymizationMode.HYBRID, null);

				// All usernames should be anonymous (fallback behavior)
				return result.every((user, index) => user.username === generateAnonymousIdentifier(index));
			}),
			{ numRuns: 100 }
		);
	});

	it('hybrid mode shows name when viewing user is anywhere in list', () => {
		fc.assert(
			fc.property(
				uniqueUsersArbitrary.filter((users) => users.length >= 3),
				fc.integer({ min: 0, max: 9 }),
				(users, randomIndex) => {
					// Pick a random user as the viewing user
					const viewerIndex = randomIndex % users.length;
					const viewingUser = users[viewerIndex];
					if (!viewingUser) return true; // Skip if no user at index

					const viewingUserId = viewingUser.userId;
					const originalUsername = viewingUser.username;

					const result = applyAnonymization(users, AnonymizationMode.HYBRID, viewingUserId);

					// The viewing user should see their own name
					const viewerResult = result[viewerIndex];
					if (!viewerResult || viewerResult.username !== originalUsername) {
						return false;
					}

					// All other users should be anonymized
					return result.every((user, index) => {
						if (index === viewerIndex) {
							return user.username === originalUsername;
						}
						return user.username === generateAnonymousIdentifier(index);
					});
				}
			),
			{ numRuns: 100 }
		);
	});

	// -------------------------------------------------------------------------
	// General Properties
	// -------------------------------------------------------------------------

	it('anonymization is deterministic for same input', () => {
		fc.assert(
			fc.property(
				uniqueUsersArbitrary,
				anonymizationModeArbitrary,
				fc.option(fc.integer({ min: 1, max: 10000 }), { nil: null }),
				(users, mode, viewingUserId) => {
					const result1 = applyAnonymization(users, mode, viewingUserId);
					const result2 = applyAnonymization(users, mode, viewingUserId);

					// Results should be identical
					return JSON.stringify(result1) === JSON.stringify(result2);
				}
			),
			{ numRuns: 100 }
		);
	});

	it('user count is preserved after anonymization', () => {
		fc.assert(
			fc.property(
				uniqueUsersArbitrary,
				anonymizationModeArbitrary,
				fc.option(fc.integer({ min: 1, max: 10000 }), { nil: null }),
				(users, mode, viewingUserId) => {
					const result = applyAnonymization(users, mode, viewingUserId);
					return result.length === users.length;
				}
			),
			{ numRuns: 100 }
		);
	});

	it('user order is preserved after anonymization', () => {
		fc.assert(
			fc.property(
				uniqueUsersArbitrary,
				anonymizationModeArbitrary,
				fc.option(fc.integer({ min: 1, max: 10000 }), { nil: null }),
				(users, mode, viewingUserId) => {
					const result = applyAnonymization(users, mode, viewingUserId);

					// UserIds should be in same order
					return result.every((user, index) => {
						const original = users[index];
						return original !== undefined && user.userId === original.userId;
					});
				}
			),
			{ numRuns: 100 }
		);
	});

	it('non-username properties are always preserved', () => {
		fc.assert(
			fc.property(
				uniqueUsersArbitrary,
				anonymizationModeArbitrary,
				fc.option(fc.integer({ min: 1, max: 10000 }), { nil: null }),
				(users, mode, viewingUserId) => {
					const result = applyAnonymization(users, mode, viewingUserId);

					return result.every((user, index) => {
						const original = users[index];
						return (
							original !== undefined &&
							user.userId === original.userId &&
							user.totalMinutes === original.totalMinutes &&
							user.rank === original.rank
						);
					});
				}
			),
			{ numRuns: 100 }
		);
	});

	it('empty array returns empty array for all modes', () => {
		fc.assert(
			fc.property(
				anonymizationModeArbitrary,
				fc.option(fc.integer({ min: 1, max: 10000 }), { nil: null }),
				(mode, viewingUserId) => {
					const result = applyAnonymization([], mode, viewingUserId);
					return result.length === 0;
				}
			),
			{ numRuns: 100 }
		);
	});
});

// =============================================================================
// Additional Unit Tests
// =============================================================================

describe('Anonymous Identifier Generation', () => {
	it('generates correct format for index 0', () => {
		expect(generateAnonymousIdentifier(0)).toBe('User #1');
	});

	it('generates correct format for various indices', () => {
		expect(generateAnonymousIdentifier(0)).toBe('User #1');
		expect(generateAnonymousIdentifier(1)).toBe('User #2');
		expect(generateAnonymousIdentifier(9)).toBe('User #10');
		expect(generateAnonymousIdentifier(99)).toBe('User #100');
	});

	it('is deterministic', () => {
		expect(generateAnonymousIdentifier(5)).toBe(generateAnonymousIdentifier(5));
	});
});

describe('Anonymization Edge Cases', () => {
	it('handles single user in real mode', () => {
		const users = [{ userId: 1, username: 'alice' }];
		const result = applyAnonymization(users, AnonymizationMode.REAL, null);

		expect(result).toHaveLength(1);
		expect(result[0]?.username).toBe('alice');
	});

	it('handles single user in anonymous mode', () => {
		const users = [{ userId: 1, username: 'alice' }];
		const result = applyAnonymization(users, AnonymizationMode.ANONYMOUS, null);

		expect(result).toHaveLength(1);
		expect(result[0]?.username).toBe('User #1');
	});

	it('handles single user in hybrid mode as viewer', () => {
		const users = [{ userId: 1, username: 'alice' }];
		const result = applyAnonymization(users, AnonymizationMode.HYBRID, 1);

		expect(result).toHaveLength(1);
		expect(result[0]?.username).toBe('alice');
	});

	it('handles single user in hybrid mode as non-viewer', () => {
		const users = [{ userId: 1, username: 'alice' }];
		const result = applyAnonymization(users, AnonymizationMode.HYBRID, 999);

		expect(result).toHaveLength(1);
		expect(result[0]?.username).toBe('User #1');
	});

	it('handles viewing user not in list for hybrid mode', () => {
		const users = [
			{ userId: 1, username: 'alice' },
			{ userId: 2, username: 'bob' }
		];
		const result = applyAnonymization(users, AnonymizationMode.HYBRID, 999);

		// All should be anonymized since viewer is not in list
		expect(result[0]?.username).toBe('User #1');
		expect(result[1]?.username).toBe('User #2');
	});

	it('preserves extra properties in user objects', () => {
		const users = [{ userId: 1, username: 'alice', rank: 1, totalMinutes: 1000, thumb: 'url' }];
		const result = applyAnonymization(users, AnonymizationMode.ANONYMOUS, null);

		expect(result[0]?.userId).toBe(1);
		expect(result[0]?.rank).toBe(1);
		expect(result[0]?.totalMinutes).toBe(1000);
		expect((result[0] as Record<string, unknown>)?.thumb).toBe('url');
	});
});
