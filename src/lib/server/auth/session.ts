import { eq, lt, and } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { sessions, users } from '$lib/server/db/schema';
import { SESSION_DURATION_MS, type SessionData, type CreateSessionOptions } from './types';

/**
 * Session Management Module
 *
 * Handles session CRUD operations for authentication:
 * - Creating new sessions after successful OAuth
 * - Validating sessions for route protection
 * - Invalidating sessions on logout
 * - Cleaning up expired sessions
 *
 * Implements Requirements 1.6 and 1.7:
 * - Store sessions securely with appropriate expiration
 * - Invalidate session and clear tokens on logout
 */

// =============================================================================
// Session Creation
// =============================================================================

/**
 * Create a new session for an authenticated user
 *
 * Generates a cryptographically secure session ID using crypto.randomUUID().
 * Stores session in SQLite with expiration timestamp.
 *
 * @param options - Session creation options
 * @returns The session ID to be stored in a cookie
 *
 * @example
 * ```typescript
 * const sessionId = await createSession({
 *   userId: 1,
 *   plexToken: 'abc123',
 *   isAdmin: true
 * });
 * // Set sessionId in HttpOnly cookie
 * ```
 */
export async function createSession(options: CreateSessionOptions): Promise<string> {
	const { userId, plexToken, isAdmin, durationMs = SESSION_DURATION_MS } = options;

	// Generate cryptographically secure session ID
	const sessionId = crypto.randomUUID();

	// Calculate expiration timestamp
	const expiresAt = new Date(Date.now() + durationMs);

	// Insert session into database
	await db.insert(sessions).values({
		id: sessionId,
		userId,
		plexToken,
		isAdmin,
		expiresAt
	});

	return sessionId;
}

// =============================================================================
// Session Validation
// =============================================================================

/**
 * Validate a session and retrieve session data
 *
 * Checks if the session exists and has not expired.
 * Joins with users table to get user information.
 *
 * @param sessionId - The session ID from cookie
 * @returns Session data if valid, null if invalid or expired
 *
 * @example
 * ```typescript
 * const session = await validateSession(sessionId);
 * if (session) {
 *   event.locals.user = {
 *     id: session.userId,
 *     plexId: session.plexId,
 *     username: session.username,
 *     isAdmin: session.isAdmin
 *   };
 * }
 * ```
 */
export async function validateSession(sessionId: string): Promise<SessionData | null> {
	try {
		const now = new Date();

		// Query session with user join
		const result = await db
			.select({
				sessionId: sessions.id,
				userId: sessions.userId,
				isAdmin: sessions.isAdmin,
				expiresAt: sessions.expiresAt,
				plexId: users.plexId,
				username: users.username
			})
			.from(sessions)
			.innerJoin(users, eq(sessions.userId, users.id))
			.where(eq(sessions.id, sessionId))
			.limit(1);

		const session = result[0];

		// Check if session exists
		if (!session) {
			return null;
		}

		// Check if session has expired
		if (session.expiresAt < now) {
			// Clean up expired session
			await invalidateSession(sessionId);
			return null;
		}

		return {
			id: session.sessionId,
			userId: session.userId,
			plexId: session.plexId,
			username: session.username,
			isAdmin: session.isAdmin ?? false,
			expiresAt: session.expiresAt
		};
	} catch (error) {
		// Log the error for debugging - this helps diagnose database initialization issues
		console.error('[Session] Database error during validation:', error);
		// Return null to treat as unauthenticated (graceful degradation)
		// This prevents silent 500 errors when the database is not ready
		return null;
	}
}

// =============================================================================
// Session Invalidation
// =============================================================================

/**
 * Invalidate a session (logout)
 *
 * Removes the session from the database.
 * The session ID will no longer be valid.
 *
 * @param sessionId - The session ID to invalidate
 *
 * @example
 * ```typescript
 * await invalidateSession(sessionId);
 * // Clear the session cookie
 * ```
 */
export async function invalidateSession(sessionId: string): Promise<void> {
	await db.delete(sessions).where(eq(sessions.id, sessionId));
}

/**
 * Invalidate all sessions for a user
 *
 * Useful when user's access is revoked or they want to log out everywhere.
 *
 * @param userId - The user ID whose sessions should be invalidated
 */
export async function invalidateUserSessions(userId: number): Promise<void> {
	await db.delete(sessions).where(eq(sessions.userId, userId));
}

// =============================================================================
// Session Cleanup
// =============================================================================

/**
 * Clean up expired sessions from the database
 *
 * Removes all sessions that have passed their expiration time.
 * Should be called periodically (e.g., daily via cron job).
 *
 * @example
 * ```typescript
 * // In a cron job
 * await cleanupExpiredSessions();
 * console.log('Cleaned expired sessions');
 * ```
 */
export async function cleanupExpiredSessions(): Promise<void> {
	const now = new Date();
	await db.delete(sessions).where(lt(sessions.expiresAt, now));
}

// =============================================================================
// Session Utilities
// =============================================================================

/**
 * Get the Plex token for a session
 *
 * Used when making Plex API requests on behalf of a user.
 *
 * @param sessionId - The session ID
 * @returns The Plex token if session is valid, null otherwise
 */
export async function getSessionPlexToken(sessionId: string): Promise<string | null> {
	const now = new Date();

	const result = await db
		.select({ plexToken: sessions.plexToken, expiresAt: sessions.expiresAt })
		.from(sessions)
		.where(eq(sessions.id, sessionId))
		.limit(1);

	const session = result[0];

	if (!session || session.expiresAt < now) {
		return null;
	}

	return session.plexToken;
}

/**
 * Extend a session's expiration time
 *
 * Used to implement sliding session expiration.
 * Not currently used but available for future implementation.
 *
 * @param sessionId - The session ID to extend
 * @param durationMs - New duration from now
 */
export async function extendSession(
	sessionId: string,
	durationMs: number = SESSION_DURATION_MS
): Promise<void> {
	const expiresAt = new Date(Date.now() + durationMs);

	await db.update(sessions).set({ expiresAt }).where(eq(sessions.id, sessionId));
}
