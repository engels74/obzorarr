import { eq, lt, and } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { sessions, users } from '$lib/server/db/schema';
import { SESSION_DURATION_MS, type SessionData, type CreateSessionOptions } from './types';

export async function createSession(options: CreateSessionOptions): Promise<string> {
	const { userId, plexToken, isAdmin, durationMs = SESSION_DURATION_MS } = options;
	const sessionId = crypto.randomUUID();
	const expiresAt = new Date(Date.now() + durationMs);

	await db.insert(sessions).values({
		id: sessionId,
		userId,
		plexToken,
		isAdmin,
		expiresAt
	});

	return sessionId;
}

export async function validateSession(sessionId: string): Promise<SessionData | null> {
	try {
		const now = new Date();
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
		if (!session) {
			return null;
		}

		if (session.expiresAt < now) {
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
		// Graceful degradation when database is not ready
		console.error('[Session] Database error during validation:', error);
		return null;
	}
}

export async function invalidateSession(sessionId: string): Promise<void> {
	await db.delete(sessions).where(eq(sessions.id, sessionId));
}

export async function invalidateUserSessions(userId: number): Promise<void> {
	await db.delete(sessions).where(eq(sessions.userId, userId));
}

export async function cleanupExpiredSessions(): Promise<void> {
	const now = new Date();
	await db.delete(sessions).where(lt(sessions.expiresAt, now));
}

/** Get the Plex token for a session (used for Plex API requests on behalf of a user). */
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

/** Extend a session's expiration time (for sliding session expiration). */
export async function extendSession(
	sessionId: string,
	durationMs: number = SESSION_DURATION_MS
): Promise<void> {
	const expiresAt = new Date(Date.now() + durationMs);

	await db.update(sessions).set({ expiresAt }).where(eq(sessions.id, sessionId));
}
