import type { Cookies } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { getApiConfigWithSources } from '$lib/server/admin/settings.service';
import { db } from '$lib/server/db/client';
import { users } from '$lib/server/db/schema';
import { requiresOnboarding } from '$lib/server/onboarding';
import { requireServerMembership, verifyServerOwnership } from './membership';
import { checkPinStatus, getPlexUserInfo } from './plex-oauth';
import { createSession } from './session';
import { NotServerMemberError, SESSION_DURATION_MS } from './types';

const COOKIE_OPTIONS = {
	path: '/',
	httpOnly: true,
	secure: process.env.NODE_ENV === 'production',
	sameSite: 'lax' as const,
	maxAge: Math.floor(SESSION_DURATION_MS / 1000)
};

export interface CompletedLoginUser {
	id: number;
	plexId: number;
	username: string;
	isAdmin: boolean;
}

export interface CompletedLogin {
	user: CompletedLoginUser;
	redirectTo: '/admin' | '/dashboard';
}

export type PinLoginResult = { pending: true } | CompletedLogin;

export async function createSessionFromPlexToken(
	authToken: string,
	cookies: Cookies
): Promise<CompletedLogin> {
	const plexUser = await getPlexUserInfo(authToken);

	const isOnboarding = await requiresOnboarding();
	const apiConfig = await getApiConfigWithSources();
	const hasServerConfigured = !!apiConfig.plex.serverUrl.value;

	let isAdmin = false;
	let accountId: number;

	if (isOnboarding && !hasServerConfigured) {
		const ownership = await verifyServerOwnership(authToken);

		if (!ownership.isOwner) {
			throw new NotServerMemberError('You must own a Plex server to configure Obzorarr.');
		}

		isAdmin = true;
		accountId = 1;
	} else {
		const membership = await requireServerMembership(authToken);

		isAdmin = membership.isOwner;
		accountId = membership.isOwner ? 1 : plexUser.id;
	}

	const existingUser = await db.query.users.findFirst({
		where: eq(users.plexId, plexUser.id)
	});

	let userId: number;

	if (existingUser) {
		await db
			.update(users)
			.set({
				username: plexUser.username,
				email: plexUser.email,
				thumb: plexUser.thumb ?? null,
				isAdmin,
				accountId
			})
			.where(eq(users.id, existingUser.id));

		userId = existingUser.id;
	} else {
		const result = await db
			.insert(users)
			.values({
				plexId: plexUser.id,
				accountId,
				username: plexUser.username,
				email: plexUser.email,
				thumb: plexUser.thumb ?? null,
				isAdmin
			})
			.returning({ id: users.id });

		const insertedUser = result[0];
		if (!insertedUser) {
			throw new Error('Failed to create user');
		}
		userId = insertedUser.id;
	}

	const sessionId = await createSession({
		userId,
		plexToken: authToken,
		isAdmin
	});

	cookies.set('session', sessionId, COOKIE_OPTIONS);

	return {
		user: {
			id: userId,
			plexId: plexUser.id,
			username: plexUser.username,
			isAdmin
		},
		redirectTo: isAdmin ? '/admin' : '/dashboard'
	};
}

export async function completePlexPinLogin(
	pinId: number,
	cookies: Cookies
): Promise<PinLoginResult> {
	const pinStatus = await checkPinStatus(pinId);

	if (!pinStatus.authToken) {
		return { pending: true };
	}

	return createSessionFromPlexToken(pinStatus.authToken, cookies);
}
