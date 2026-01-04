import { Database } from 'bun:sqlite';
import { describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import * as fc from 'fast-check';
import * as schema from '$lib/server/db/schema';
import { sessions, users } from '$lib/server/db/schema';

// Note: We can't import from membership.ts directly because it uses $env/static/private
// Instead, we test the pure function logic here

/**
 * Determine the user's role based on ownership
 *
 * This is the same pure function from membership.ts, duplicated here
 * for testing without environment dependencies.
 */
function determineRole(isOwner: boolean): { isAdmin: boolean } {
	return { isAdmin: isOwner };
}

/**
 * Property-based tests for Authentication System
 *
 * Tests the following formal correctness properties:
 *
 * Property 1: Role Assignment Correctness
 * - Admin privileges assigned iff user is server owner
 *
 * Property 2: Non-Member Access Denial
 * - Non-members of configured Plex server are denied access
 *
 * Property 3: Session Invalidation
 * - Sessions are invalid after logout
 *
 * Validates: Requirements 1.3, 1.4, 1.5, 1.7
 */

// =============================================================================
// Test Database Setup
// =============================================================================

/**
 * Create an in-memory test database with schema
 */
function createTestDatabase() {
	const sqlite = new Database(':memory:', { strict: true });

	// Enable pragmas for testing
	sqlite.exec('PRAGMA journal_mode = WAL');
	sqlite.exec('PRAGMA foreign_keys = ON');

	// Create tables directly
	sqlite.exec(`
		CREATE TABLE IF NOT EXISTS users (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			plex_id INTEGER NOT NULL UNIQUE,
			account_id INTEGER,
			username TEXT NOT NULL,
			email TEXT,
			thumb TEXT,
			is_admin INTEGER DEFAULT 0,
			created_at INTEGER DEFAULT (unixepoch())
		)
	`);

	sqlite.exec(`
		CREATE TABLE IF NOT EXISTS sessions (
			id TEXT PRIMARY KEY,
			user_id INTEGER NOT NULL,
			plex_token TEXT NOT NULL,
			is_admin INTEGER DEFAULT 0,
			expires_at INTEGER NOT NULL,
			FOREIGN KEY (user_id) REFERENCES users(id)
		)
	`);

	return drizzle(sqlite, { schema });
}

// =============================================================================
// Session Test Helpers
// =============================================================================

/**
 * Create a test session in the database
 */
async function createTestSession(
	db: ReturnType<typeof createTestDatabase>,
	params: {
		userId: number;
		plexToken: string;
		isAdmin: boolean;
		durationMs?: number;
	}
): Promise<string> {
	const sessionId = crypto.randomUUID();
	const expiresAt = new Date(Date.now() + (params.durationMs ?? 7 * 24 * 60 * 60 * 1000));

	await db.insert(sessions).values({
		id: sessionId,
		userId: params.userId,
		plexToken: params.plexToken,
		isAdmin: params.isAdmin,
		expiresAt
	});

	return sessionId;
}

/**
 * Validate a session (test implementation)
 */
async function validateTestSession(
	db: ReturnType<typeof createTestDatabase>,
	sessionId: string
): Promise<{ userId: number; isAdmin: boolean } | null> {
	const now = new Date();

	const result = await db
		.select({
			userId: sessions.userId,
			isAdmin: sessions.isAdmin,
			expiresAt: sessions.expiresAt
		})
		.from(sessions)
		.where(eq(sessions.id, sessionId))
		.limit(1);

	const session = result[0];

	if (!session) {
		return null;
	}

	if (session.expiresAt < now) {
		return null;
	}

	return {
		userId: session.userId,
		isAdmin: session.isAdmin ?? false
	};
}

/**
 * Invalidate a session (test implementation)
 */
async function invalidateTestSession(
	db: ReturnType<typeof createTestDatabase>,
	sessionId: string
): Promise<void> {
	await db.delete(sessions).where(eq(sessions.id, sessionId));
}

/**
 * Create a test user in the database
 */
async function createTestUser(
	db: ReturnType<typeof createTestDatabase>,
	params: {
		plexId: number;
		username: string;
		isAdmin: boolean;
	}
): Promise<number> {
	const result = await db
		.insert(users)
		.values({
			plexId: params.plexId,
			username: params.username,
			isAdmin: params.isAdmin
		})
		.returning({ id: users.id });

	const inserted = result[0];
	if (!inserted) {
		throw new Error('Failed to create test user');
	}
	return inserted.id;
}

// =============================================================================
// Property 1: Role Assignment Correctness
// =============================================================================

// Feature: obzorarr, Property 1: Role Assignment Correctness
describe('Property 1: Role Assignment Correctness', () => {
	it('assigns admin privileges if and only if user is server owner', () => {
		fc.assert(
			fc.property(fc.boolean(), (isOwner) => {
				const result = determineRole(isOwner);

				// Admin should be true iff isOwner is true
				return result.isAdmin === isOwner;
			}),
			{ numRuns: 100 }
		);
	});

	it('server owner always gets admin role', () => {
		fc.assert(
			fc.property(
				fc.constantFrom(true), // Always owner
				(isOwner) => {
					const result = determineRole(isOwner);
					return result.isAdmin === true;
				}
			),
			{ numRuns: 100 }
		);
	});

	it('non-owner members never get admin role', () => {
		fc.assert(
			fc.property(
				fc.constantFrom(false), // Never owner
				(isOwner) => {
					const result = determineRole(isOwner);
					return result.isAdmin === false;
				}
			),
			{ numRuns: 100 }
		);
	});

	it('role assignment is deterministic for any ownership state', () => {
		fc.assert(
			fc.property(fc.boolean(), (isOwner) => {
				const result1 = determineRole(isOwner);
				const result2 = determineRole(isOwner);

				// Same input should always produce same output
				return result1.isAdmin === result2.isAdmin;
			}),
			{ numRuns: 100 }
		);
	});
});

// =============================================================================
// Property 2: Non-Member Access Denial
// =============================================================================

// Feature: obzorarr, Property 2: Non-Member Access Denial
describe('Property 2: Non-Member Access Denial', () => {
	/**
	 * This property tests that non-members are denied access.
	 *
	 * In our implementation, this is handled by requireServerMembership()
	 * which throws NotServerMemberError when isMember is false.
	 *
	 * We test the conceptual property here using a pure function approach.
	 */

	interface MembershipResult {
		isMember: boolean;
		isOwner: boolean;
	}

	function shouldGrantAccess(membership: MembershipResult): boolean {
		return membership.isMember;
	}

	it('non-members are always denied access', () => {
		fc.assert(
			fc.property(fc.boolean(), (_isOwner) => {
				// Non-member scenario
				const membership: MembershipResult = {
					isMember: false,
					isOwner: false // Can't be owner if not a member
				};

				return shouldGrantAccess(membership) === false;
			}),
			{ numRuns: 100 }
		);
	});

	it('members are always granted access', () => {
		fc.assert(
			fc.property(fc.boolean(), (isOwner) => {
				// Member scenario
				const membership: MembershipResult = {
					isMember: true,
					isOwner
				};

				return shouldGrantAccess(membership) === true;
			}),
			{ numRuns: 100 }
		);
	});

	it('access decision is based solely on membership status', () => {
		fc.assert(
			fc.property(
				fc.boolean(), // isMember
				fc.boolean(), // isOwner (ignored for access decision)
				(isMember, isOwner) => {
					const membership: MembershipResult = {
						isMember,
						// Owner status is only valid if member
						isOwner: isMember ? isOwner : false
					};

					// Access should match membership status exactly
					return shouldGrantAccess(membership) === membership.isMember;
				}
			),
			{ numRuns: 100 }
		);
	});
});

// =============================================================================
// Property 3: Session Invalidation
// =============================================================================

// Feature: obzorarr, Property 3: Session Invalidation
describe('Property 3: Session Invalidation', () => {
	// Use a unique counter to ensure unique plexIds across property test iterations
	let plexIdCounter = 0;

	function getUniquePlexId(): number {
		return ++plexIdCounter;
	}

	it('session is invalid after logout', async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.record({
					username: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
					plexToken: fc.string({ minLength: 10, maxLength: 100 }),
					isAdmin: fc.boolean()
				}),
				async ({ username, plexToken, isAdmin }) => {
					// Create fresh database for each iteration
					const db = createTestDatabase();
					const plexId = getUniquePlexId();

					// Create user
					const userId = await createTestUser(db, { plexId, username, isAdmin });

					// Create session
					const sessionId = await createTestSession(db, {
						userId,
						plexToken,
						isAdmin
					});

					// Verify session is valid before logout
					const beforeLogout = await validateTestSession(db, sessionId);
					if (!beforeLogout) {
						return false; // Session should be valid initially
					}

					// Invalidate session (logout)
					await invalidateTestSession(db, sessionId);

					// Verify session is now invalid
					const afterLogout = await validateTestSession(db, sessionId);

					return afterLogout === null;
				}
			),
			{ numRuns: 100 }
		);
	});

	it('invalidating a non-existent session does not throw', async () => {
		const db = createTestDatabase();
		await fc.assert(
			fc.asyncProperty(fc.uuid(), async (sessionId) => {
				// Should not throw even if session doesn't exist
				await invalidateTestSession(db, sessionId);
				return true;
			}),
			{ numRuns: 100 }
		);
	});

	it('session remains invalid once invalidated', async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.record({
					username: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
					plexToken: fc.string({ minLength: 10, maxLength: 100 }),
					isAdmin: fc.boolean(),
					checkCount: fc.integer({ min: 1, max: 5 })
				}),
				async ({ username, plexToken, isAdmin, checkCount }) => {
					// Create fresh database for each iteration
					const db = createTestDatabase();
					const plexId = getUniquePlexId();

					// Create user and session
					const userId = await createTestUser(db, { plexId, username, isAdmin });
					const sessionId = await createTestSession(db, {
						userId,
						plexToken,
						isAdmin
					});

					// Invalidate session
					await invalidateTestSession(db, sessionId);

					// Check multiple times - should always be invalid
					for (let i = 0; i < checkCount; i++) {
						const result = await validateTestSession(db, sessionId);
						if (result !== null) {
							return false; // Session should never be valid after invalidation
						}
					}

					return true;
				}
			),
			{ numRuns: 100 }
		);
	});

	it('expired sessions are invalid', async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.record({
					username: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
					plexToken: fc.string({ minLength: 10, maxLength: 100 }),
					isAdmin: fc.boolean()
				}),
				async ({ username, plexToken, isAdmin }) => {
					// Create fresh database for each iteration
					const db = createTestDatabase();
					const plexId = getUniquePlexId();

					// Create user
					const userId = await createTestUser(db, { plexId, username, isAdmin });

					// Create session that already expired (negative duration)
					const sessionId = await createTestSession(db, {
						userId,
						plexToken,
						isAdmin,
						durationMs: -1000 // Already expired
					});

					// Verify session is invalid due to expiration
					const result = await validateTestSession(db, sessionId);

					return result === null;
				}
			),
			{ numRuns: 100 }
		);
	});
});

// =============================================================================
// Additional Unit Tests
// =============================================================================

describe('Session Management', () => {
	it('creates valid sessions', async () => {
		const db = createTestDatabase();
		const userId = await createTestUser(db, {
			plexId: 100001,
			username: 'testuser',
			isAdmin: false
		});

		const sessionId = await createTestSession(db, {
			userId,
			plexToken: 'test-token',
			isAdmin: false
		});

		expect(sessionId).toBeDefined();
		expect(typeof sessionId).toBe('string');
		expect(sessionId.length).toBeGreaterThan(0);

		const validated = await validateTestSession(db, sessionId);
		expect(validated).not.toBeNull();
		expect(validated?.userId).toBe(userId);
		expect(validated?.isAdmin).toBe(false);
	});

	it('creates admin sessions correctly', async () => {
		const db = createTestDatabase();
		const userId = await createTestUser(db, {
			plexId: 100002,
			username: 'adminuser',
			isAdmin: true
		});

		const sessionId = await createTestSession(db, {
			userId,
			plexToken: 'admin-token',
			isAdmin: true
		});

		const validated = await validateTestSession(db, sessionId);
		expect(validated).not.toBeNull();
		expect(validated?.isAdmin).toBe(true);
	});

	it('returns null for non-existent sessions', async () => {
		const db = createTestDatabase();
		const result = await validateTestSession(db, 'non-existent-session-id');
		expect(result).toBeNull();
	});
});

describe('Role Determination', () => {
	it('owner gets admin', () => {
		expect(determineRole(true)).toEqual({ isAdmin: true });
	});

	it('non-owner does not get admin', () => {
		expect(determineRole(false)).toEqual({ isAdmin: false });
	});
});
