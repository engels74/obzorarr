import { env } from '$env/dynamic/private';
import { dev } from '$app/environment';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { users, sessions } from '$lib/server/db/schema';
import { SESSION_DURATION_MS } from './types';
import { logger } from '$lib/server/logging';

/**
 * Development Authentication Bypass Module
 *
 * Provides a way to bypass Plex OAuth during development.
 * When DEV_BYPASS_AUTH=true is set, automatically creates/uses
 * a simulated admin user with credentials from environment variables.
 *
 * SECURITY: This bypass ONLY works in development mode (dev === true).
 * It will never activate in production builds.
 */

// =============================================================================
// Constants
// =============================================================================

/**
 * Plex ID for the development bypass user
 * Uses a fixed value to ensure the same user is reused across restarts
 */
const DEV_USER_PLEX_ID = 999999999;

/**
 * Username for the development bypass user
 */
const DEV_USER_USERNAME = 'dev-admin';

/**
 * Well-known session ID for dev bypass (persists across requests)
 */
const DEV_SESSION_ID = 'dev-bypass-session-00000000-0000-0000-0000-000000000000';

// =============================================================================
// Bypass Detection
// =============================================================================

/**
 * Check if dev bypass authentication is enabled
 *
 * Returns true only if:
 * 1. Running in development mode (not production)
 * 2. DEV_BYPASS_AUTH environment variable is set to 'true'
 *
 * @returns true if dev bypass is enabled
 */
export function isDevBypassEnabled(): boolean {
	// SECURITY: Never enable in production
	if (!dev) {
		return false;
	}

	return env.DEV_BYPASS_AUTH === 'true';
}

// =============================================================================
// User and Session Management
// =============================================================================

/**
 * Get or create the development bypass user
 *
 * Creates a user with admin privileges if it doesn't exist.
 * Uses environment PLEX_TOKEN for the simulated session.
 *
 * @returns The user ID of the dev bypass user
 */
async function getOrCreateDevUser(): Promise<number> {
	// Check if user already exists
	const existingUser = await db.query.users.findFirst({
		where: eq(users.plexId, DEV_USER_PLEX_ID)
	});

	if (existingUser) {
		// Ensure user is admin (in case it was previously created without admin)
		if (!existingUser.isAdmin) {
			await db.update(users).set({ isAdmin: true }).where(eq(users.id, existingUser.id));
		}
		return existingUser.id;
	}

	// Create new dev user with admin privileges
	const result = await db
		.insert(users)
		.values({
			plexId: DEV_USER_PLEX_ID,
			username: DEV_USER_USERNAME,
			email: 'dev@localhost',
			thumb: null,
			isAdmin: true
		})
		.returning({ id: users.id });

	const newUser = result[0];
	if (!newUser) {
		throw new Error('Failed to create dev bypass user');
	}

	logger.info(`Created dev bypass user with ID ${newUser.id}`, 'DevBypass');
	return newUser.id;
}

/**
 * Get or create the development bypass session
 *
 * Creates a long-lived session for the dev user if one doesn't exist
 * or if the existing one has expired.
 *
 * @returns The session ID for the dev bypass
 */
export async function getOrCreateDevSession(): Promise<string> {
	const userId = await getOrCreateDevUser();

	// Check if dev session exists and is valid
	const existingSession = await db.query.sessions.findFirst({
		where: eq(sessions.id, DEV_SESSION_ID)
	});

	const now = new Date();

	if (existingSession && existingSession.expiresAt > now) {
		return DEV_SESSION_ID;
	}

	// Delete old session if exists
	if (existingSession) {
		await db.delete(sessions).where(eq(sessions.id, DEV_SESSION_ID));
	}

	// Get the Plex token from environment (used for Plex API calls)
	const plexToken = env.PLEX_TOKEN ?? 'dev-token';

	// Create new dev session with long expiration
	const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

	await db.insert(sessions).values({
		id: DEV_SESSION_ID,
		userId,
		plexToken,
		isAdmin: true,
		expiresAt
	});

	logger.info(
		`Dev bypass session created/renewed (expires: ${expiresAt.toISOString()})`,
		'DevBypass'
	);

	return DEV_SESSION_ID;
}
