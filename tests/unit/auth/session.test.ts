import { beforeEach, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import {
	cleanupExpiredSessions,
	createSession,
	extendSession,
	getSessionPlexToken,
	invalidateSession,
	invalidateUserSessions,
	updateUserAndSessionAdmin,
	validateSession
} from '$lib/server/auth/session';
import { db } from '$lib/server/db/client';
import { sessions, users } from '$lib/server/db/schema';
import { seedAuthUser } from '../../helpers/auth';
import { resetSharedTestDb } from '../../helpers/db';

describe('auth session persistence', () => {
	beforeEach(async () => {
		await resetSharedTestDb();
		await seedAuthUser({
			id: 1,
			plexId: 10_001,
			username: 'session-user',
			isAdmin: false
		});
	});

	it('creates and validates a session joined with user identity', async () => {
		const sessionId = await createSession({
			userId: 1,
			plexToken: 'plex-token',
			isAdmin: false
		});

		const session = await validateSession(sessionId);

		expect(session).toMatchObject({
			id: sessionId,
			userId: 1,
			plexId: 10_001,
			username: 'session-user',
			isAdmin: false,
			plexToken: 'plex-token'
		});
		expect(session?.expiresAt).toBeInstanceOf(Date);
	});

	it('invalidates expired sessions during validation', async () => {
		const sessionId = await createSession({
			userId: 1,
			plexToken: 'expired-token',
			isAdmin: false,
			durationMs: -1_000
		});

		expect(await validateSession(sessionId)).toBeNull();

		const remaining = await db.select().from(sessions).where(eq(sessions.id, sessionId));
		expect(remaining).toHaveLength(0);
	});

	it('returns active Plex tokens and hides expired or missing session tokens', async () => {
		const activeSessionId = await createSession({
			userId: 1,
			plexToken: 'active-token',
			isAdmin: false
		});
		const expiredSessionId = await createSession({
			userId: 1,
			plexToken: 'expired-token',
			isAdmin: false,
			durationMs: -1_000
		});

		expect(await getSessionPlexToken(activeSessionId)).toBe('active-token');
		expect(await getSessionPlexToken(expiredSessionId)).toBeNull();
		expect(await getSessionPlexToken('missing-session')).toBeNull();
	});

	it('invalidates one session or all sessions for a user', async () => {
		const firstSessionId = await createSession({
			userId: 1,
			plexToken: 'token-1',
			isAdmin: false
		});
		const secondSessionId = await createSession({
			userId: 1,
			plexToken: 'token-2',
			isAdmin: false
		});

		await invalidateSession(firstSessionId);
		expect(await validateSession(firstSessionId)).toBeNull();
		expect(await validateSession(secondSessionId)).not.toBeNull();

		await invalidateUserSessions(1);
		expect(await validateSession(secondSessionId)).toBeNull();
	});

	it('cleans up only expired sessions', async () => {
		const activeSessionId = await createSession({
			userId: 1,
			plexToken: 'active-token',
			isAdmin: false
		});
		const expiredSessionId = await createSession({
			userId: 1,
			plexToken: 'expired-token',
			isAdmin: false,
			durationMs: -1_000
		});

		await cleanupExpiredSessions();

		expect(await validateSession(activeSessionId)).not.toBeNull();
		const expiredRows = await db.select().from(sessions).where(eq(sessions.id, expiredSessionId));
		expect(expiredRows).toHaveLength(0);
	});

	it('updates session and user admin flags together', async () => {
		const sessionId = await createSession({
			userId: 1,
			plexToken: 'admin-token',
			isAdmin: false
		});

		await updateUserAndSessionAdmin(sessionId, 1, true);

		const sessionRows = await db.select().from(sessions).where(eq(sessions.id, sessionId));
		const userRows = await db.select().from(users).where(eq(users.id, 1));
		expect(sessionRows[0]?.isAdmin).toBe(true);
		expect(userRows[0]?.isAdmin).toBe(true);
	});

	it('extends the stored expiry for an existing session', async () => {
		const sessionId = await createSession({
			userId: 1,
			plexToken: 'extend-token',
			isAdmin: false,
			durationMs: 1_000
		});

		await extendSession(sessionId, 60_000);

		const session = await validateSession(sessionId);
		expect(session?.expiresAt.getTime()).toBeGreaterThan(Date.now() + 10_000);
	});
});
