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
import {
	AuthError,
	NotServerMemberError,
	PinExpiredError,
	PLEX_CLIENT_ID,
	PLEX_PRODUCT,
	PLEX_VERSION,
	PlexAuthApiError,
	PlexFriendSchema,
	SESSION_DURATION_MS,
	SessionExpiredError
} from '$lib/server/auth/types';
import { db } from '$lib/server/db/client';
import { sessions, users } from '$lib/server/db/schema';
import { seedAuthUser } from '../../helpers/auth';
import { resetSharedTestDb } from '../../helpers/db';

describe('auth core contracts', () => {
	describe('types and schemas', () => {
		it.each([
			['SESSION_DURATION_MS', SESSION_DURATION_MS, 7 * 24 * 60 * 60 * 1000],
			['PLEX_CLIENT_ID', PLEX_CLIENT_ID, 'obzorarr'],
			['PLEX_PRODUCT', PLEX_PRODUCT, 'Obzorarr'],
			['PLEX_VERSION', PLEX_VERSION, '1.0.0']
		] as const)('exports %s', (_name, actual, expected) => {
			expect(actual).toBe(expected);
		});

		it('preserves AuthError context', () => {
			const cause = new Error('Original error');
			const error = new AuthError('Wrapper message', 'WRAPPED', cause);

			expect(error).toBeInstanceOf(Error);
			expect(error).toMatchObject({
				message: 'Wrapper message',
				code: 'WRAPPED',
				cause,
				name: 'AuthError'
			});
		});

		it.each([
			[
				'NotServerMemberError',
				NotServerMemberError,
				'You are not a member of this Plex server.',
				'Custom not a member message',
				'NOT_SERVER_MEMBER'
			],
			[
				'PinExpiredError',
				PinExpiredError,
				'Login session expired. Please try again.',
				'Custom PIN expired message',
				'PIN_EXPIRED'
			],
			[
				'SessionExpiredError',
				SessionExpiredError,
				'Your session has expired. Please log in again.',
				'Custom session expired message',
				'SESSION_EXPIRED'
			]
		] as const)('%s preserves default/custom messages, code, name, and inheritance', (name, ErrorClass, defaultMessage, customMessage, code) => {
			const defaultError = new ErrorClass();
			const customError = new ErrorClass(customMessage);

			expect(defaultError).toBeInstanceOf(AuthError);
			expect(defaultError).toBeInstanceOf(Error);
			expect(defaultError).toMatchObject({ message: defaultMessage, code, name });
			expect(customError.message).toBe(customMessage);
		});

		it('stores Plex API error context and distinguishes concrete error classes', () => {
			const cause = new Error('Network failure');
			const apiError = new PlexAuthApiError('Request failed', 500, '/api', cause);
			const minimal = new PlexAuthApiError('Minimal error');
			const errors = [
				new NotServerMemberError(),
				new PinExpiredError(),
				new SessionExpiredError(),
				apiError
			];

			expect(apiError).toMatchObject({
				message: 'Request failed',
				code: 'PLEX_API_ERROR',
				name: 'PlexAuthApiError',
				statusCode: 500,
				endpoint: '/api',
				cause
			});
			expect(minimal.statusCode).toBeUndefined();
			expect(minimal.endpoint).toBeUndefined();
			expect(errors.every((error) => error instanceof AuthError)).toBe(true);
			expect(errors.map((error) => error.code)).toEqual([
				'NOT_SERVER_MEMBER',
				'PIN_EXPIRED',
				'SESSION_EXPIRED',
				'PLEX_API_ERROR'
			]);
			expect(errors[0]).toBeInstanceOf(NotServerMemberError);
			expect(errors[0]).not.toBeInstanceOf(SessionExpiredError);
			expect(errors[1]).toBeInstanceOf(PinExpiredError);
			expect(errors[1]).not.toBeInstanceOf(PlexAuthApiError);
		});

		it.each([
			['null username', { id: 42, username: null, email: 'x@example.com' }, true],
			['null email', { id: 42, username: 'someone', email: null }, true],
			['both names nullish', { id: 42, username: null, email: null }, true],
			['string username and email', { id: 42, username: 'someone', email: 'x@example.com' }, true],
			['missing id', { username: 'someone', email: null }, false]
		] as const)('PlexFriendSchema handles %s', (_name, payload, success) => {
			expect(PlexFriendSchema.safeParse(payload).success).toBe(success);
		});
	});

	describe('session persistence', () => {
		beforeEach(async () => {
			await resetSharedTestDb();
			await seedAuthUser({ id: 1, plexId: 10_001, username: 'session-user' });
		});

		it('creates and validates a session joined with user identity', async () => {
			const sessionId = await createSession({ userId: 1, plexToken: 'plex-token', isAdmin: false });
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
			expect(await db.select().from(sessions).where(eq(sessions.id, sessionId))).toHaveLength(0);
		});

		it('returns active Plex tokens and hides expired or missing session tokens', async () => {
			const active = await createSession({ userId: 1, plexToken: 'active-token', isAdmin: false });
			const expired = await createSession({
				userId: 1,
				plexToken: 'expired-token',
				isAdmin: false,
				durationMs: -1_000
			});

			expect(await getSessionPlexToken(active)).toBe('active-token');
			expect(await getSessionPlexToken(expired)).toBeNull();
			expect(await getSessionPlexToken('missing-session')).toBeNull();
		});

		it('invalidates one session or all sessions for a user', async () => {
			const first = await createSession({ userId: 1, plexToken: 'token-1', isAdmin: false });
			const second = await createSession({ userId: 1, plexToken: 'token-2', isAdmin: false });

			await invalidateSession(first);
			expect(await validateSession(first)).toBeNull();
			expect(await validateSession(second)).not.toBeNull();

			await invalidateUserSessions(1);
			expect(await validateSession(second)).toBeNull();
		});

		it('cleans up only expired sessions', async () => {
			const active = await createSession({ userId: 1, plexToken: 'active-token', isAdmin: false });
			const expired = await createSession({
				userId: 1,
				plexToken: 'expired-token',
				isAdmin: false,
				durationMs: -1_000
			});

			await cleanupExpiredSessions();

			expect(await validateSession(active)).not.toBeNull();
			expect(await db.select().from(sessions).where(eq(sessions.id, expired))).toHaveLength(0);
		});

		it('updates admin flags together and extends existing sessions', async () => {
			const sessionId = await createSession({
				userId: 1,
				plexToken: 'admin-token',
				isAdmin: false,
				durationMs: 1_000
			});

			await updateUserAndSessionAdmin(sessionId, 1, true);
			await extendSession(sessionId, 60_000);

			const sessionRows = await db.select().from(sessions).where(eq(sessions.id, sessionId));
			const userRows = await db.select().from(users).where(eq(users.id, 1));
			expect(sessionRows[0]?.isAdmin).toBe(true);
			expect(userRows[0]?.isAdmin).toBe(true);
			expect((await validateSession(sessionId))?.expiresAt.getTime()).toBeGreaterThan(
				Date.now() + 10_000
			);
		});
	});
});
