import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { users } from '$lib/server/db/schema';
import { getPlexUserInfo } from '$lib/server/auth/plex-oauth';
import {
	requireServerMembership,
	verifyServerOwnership,
	verifyServerMembership
} from '$lib/server/auth/membership';
import { createSession } from '$lib/server/auth/session';
import {
	PlexAuthApiError,
	NotServerMemberError,
	SESSION_DURATION_MS
} from '$lib/server/auth/types';
import { getApiConfigWithSources } from '$lib/server/admin/settings.service';
import { requiresOnboarding } from '$lib/server/onboarding';
import { z } from 'zod';

const CallbackRequestSchema = z.object({
	authToken: z.string().min(1, 'Auth token is required')
});

const COOKIE_OPTIONS = {
	path: '/',
	httpOnly: true,
	secure: process.env.NODE_ENV === 'production',
	sameSite: 'lax' as const,
	maxAge: Math.floor(SESSION_DURATION_MS / 1000)
};

export const POST: RequestHandler = async ({ request, cookies }) => {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		error(400, { message: 'Invalid JSON body' });
	}

	const parseResult = CallbackRequestSchema.safeParse(body);
	if (!parseResult.success) {
		error(400, {
			message: 'Invalid request: authToken is required'
		});
	}

	const { authToken } = parseResult.data;

	try {
		const plexUser = await getPlexUserInfo(authToken);

		// Check if we're in onboarding mode with no server configured
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
			accountId = 1; // Server owners have local accountId = 1
		} else {
			const membership = await requireServerMembership(authToken);

			isAdmin = membership.isOwner;
			// Server owners have local accountId = 1, shared users have accountId = plexId
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

		return json({
			user: {
				id: userId,
				plexId: plexUser.id,
				username: plexUser.username,
				isAdmin
			}
		});
	} catch (err) {
		if (err instanceof NotServerMemberError) {
			error(403, {
				message: err.message
			});
		}

		if (err instanceof PlexAuthApiError) {
			console.error('Plex API error:', err.message);

			// Check if it's an auth error (invalid token)
			if (err.statusCode === 401) {
				error(401, {
					message: 'Invalid or expired auth token. Please try again.'
				});
			}

			error(502, {
				message: 'Unable to connect to Plex. Please try again.'
			});
		}

		console.error('Unexpected error in OAuth callback:', err);
		error(500, {
			message: 'An unexpected error occurred.'
		});
	}
};
