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

/**
 * Plex OAuth Callback Endpoint
 *
 * Completes the OAuth flow by:
 * 1. Validating the auth token
 * 2. Getting user info from Plex
 * 3. Verifying server membership
 * 4. Creating/updating user in database
 * 5. Creating a session
 * 6. Setting the session cookie
 */

// =============================================================================
// Request Schemas
// =============================================================================

const CallbackRequestSchema = z.object({
	authToken: z.string().min(1, 'Auth token is required')
});

// =============================================================================
// Cookie Configuration
// =============================================================================

const COOKIE_OPTIONS = {
	path: '/',
	httpOnly: true,
	secure: process.env.NODE_ENV === 'production',
	sameSite: 'lax' as const,
	maxAge: Math.floor(SESSION_DURATION_MS / 1000) // Convert to seconds
};

// =============================================================================
// POST /auth/plex/callback - Complete OAuth
// =============================================================================

/**
 * Complete the Plex OAuth flow
 *
 * Validates the auth token, checks server membership,
 * and creates a session for the user.
 *
 * @example Request:
 * ```json
 * { "authToken": "abc123..." }
 * ```
 *
 * @example Response (success):
 * ```json
 * {
 *   "user": {
 *     "id": 1,
 *     "plexId": 12345,
 *     "username": "john",
 *     "isAdmin": true
 *   }
 * }
 * ```
 *
 * @example Response (not a member):
 * HTTP 403
 * ```json
 * { "message": "You are not a member of this Plex server." }
 * ```
 */
export const POST: RequestHandler = async ({ request, cookies }) => {
	// Parse and validate request body
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
		// Step 1: Get user info from Plex
		const plexUser = await getPlexUserInfo(authToken);

		// Step 2: Verify server membership or ownership
		// Check if we're in onboarding mode with no server configured
		const isOnboarding = await requiresOnboarding();
		const apiConfig = await getApiConfigWithSources();
		const hasServerConfigured = !!apiConfig.plex.serverUrl.value;

		let isAdmin = false;
		let accountId: number;

		if (isOnboarding && !hasServerConfigured) {
			// During onboarding with no server configured, check if user owns any server
			const ownership = await verifyServerOwnership(authToken);

			if (!ownership.isOwner) {
				throw new NotServerMemberError('You must own a Plex server to configure Obzorarr.');
			}

			// User owns a server, grant admin access for onboarding
			isAdmin = true;
			accountId = 1; // Server owners have local accountId = 1
		} else {
			// Normal flow: verify membership of the configured server
			const membership = await requireServerMembership(authToken);

			isAdmin = membership.isOwner;
			// Determine accountId for matching with playHistory
			// Server owners have local accountId = 1, shared users have accountId = plexId
			accountId = membership.isOwner ? 1 : plexUser.id;
		}

		// Step 3: Create or update user in database
		const existingUser = await db.query.users.findFirst({
			where: eq(users.plexId, plexUser.id)
		});

		let userId: number;

		if (existingUser) {
			// Update existing user
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
			// Create new user
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

		// Step 4: Create session
		const sessionId = await createSession({
			userId,
			plexToken: authToken,
			isAdmin
		});

		// Step 5: Set session cookie
		cookies.set('session', sessionId, COOKIE_OPTIONS);

		// Step 6: Return user info
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
