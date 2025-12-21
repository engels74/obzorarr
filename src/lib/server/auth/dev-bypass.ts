import { env } from '$env/dynamic/private';
import { dev } from '$app/environment';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { users, sessions, playHistory } from '$lib/server/db/schema';
import { SESSION_DURATION_MS, type NormalizedServerUser } from './types';
import { logger } from '$lib/server/logging';
import {
	getServerOwner,
	getRandomNonOwnerUser,
	resolveUserIdentifier,
	getServerUsers
} from './dev-users';

/**
 * Development Authentication Bypass Module
 *
 * Provides a way to bypass Plex OAuth during development.
 * When DEV_BYPASS_AUTH=true is set, automatically creates/uses
 * a user based on the DEV_BYPASS_USER setting:
 *
 * - Not set or empty: Uses the actual server owner/admin from Plex
 * - "random": Selects a random non-admin user from the server
 * - <plexId or username>: Simulates that specific user
 *
 * Falls back to a mock admin user if Plex API is unavailable.
 *
 * SECURITY: This bypass ONLY works in development mode (dev === true).
 * It will never activate in production builds.
 */

// =============================================================================
// Constants
// =============================================================================

/**
 * Fallback Plex ID for when Plex API is unavailable
 */
const FALLBACK_PLEX_ID = 999999999;

/**
 * Fallback username for when Plex API is unavailable
 */
const FALLBACK_USERNAME = 'dev-admin';

/**
 * Well-known session ID for dev bypass (persists across requests)
 */
const DEV_SESSION_ID = 'dev-bypass-session-00000000-0000-0000-0000-000000000000';

/**
 * Cache the selected random user for the session lifetime
 * This ensures the same random user is used consistently
 */
let cachedRandomUser: NormalizedServerUser | null = null;

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
// User Resolution
// =============================================================================

/**
 * Get the fallback user when Plex API is unavailable
 *
 * Attempts to use an existing user from the database to provide
 * a functional dev experience with real statistics:
 * 1. First, try to find an existing admin user
 * 2. Then, try to find any user with play history
 * 3. Fall back to mock user (will have empty stats)
 */
async function getFallbackUser(): Promise<NormalizedServerUser> {
	// Try to find an existing admin user in the database
	const adminUser = await db.query.users.findFirst({
		where: eq(users.isAdmin, true)
	});

	if (adminUser) {
		logger.info(
			`Dev bypass: Using existing admin user ${adminUser.plexId} (${adminUser.username}) as fallback`,
			'DevBypass'
		);
		return {
			plexId: adminUser.plexId,
			username: adminUser.username,
			email: adminUser.email,
			thumb: adminUser.thumb,
			isOwner: true
		};
	}

	// Try to find any user who has play history (so stats aren't empty)
	const userWithHistory = await db
		.selectDistinct({ accountId: playHistory.accountId })
		.from(playHistory)
		.limit(1);

	const firstUserWithHistory = userWithHistory[0];
	if (firstUserWithHistory) {
		const accountId = firstUserWithHistory.accountId;
		// Check if this accountId has a corresponding user in the database
		const existingUser = await db.query.users.findFirst({
			where: eq(users.plexId, accountId)
		});

		if (existingUser) {
			logger.info(
				`Dev bypass: Using user with play history ${existingUser.plexId} (${existingUser.username}) as fallback`,
				'DevBypass'
			);
			return {
				plexId: existingUser.plexId,
				username: existingUser.username,
				email: existingUser.email,
				thumb: existingUser.thumb,
				isOwner: existingUser.isAdmin ?? false
			};
		}

		// User doesn't exist in users table but has history - use their accountId
		logger.info(
			`Dev bypass: Using orphaned play history accountId ${accountId} as fallback (user may be deleted)`,
			'DevBypass'
		);
		return {
			plexId: accountId,
			username: `user-${accountId}`,
			email: null,
			thumb: null,
			isOwner: true
		};
	}

	// No existing users with history - fall back to mock user
	logger.warn(
		'Dev bypass: No existing users found in database, using mock user (stats will be empty)',
		'DevBypass'
	);
	return {
		plexId: FALLBACK_PLEX_ID,
		username: FALLBACK_USERNAME,
		email: null,
		thumb: null,
		isOwner: true
	};
}

/**
 * Determine which user to simulate based on DEV_BYPASS_USER setting
 *
 * - Not set or empty: Uses the actual server owner/admin
 * - "random": Selects a random non-admin user (cached for session)
 * - <plexId or username>: Simulates that specific user
 *
 * Falls back to mock admin user if Plex API fails.
 */
async function resolveTargetUser(): Promise<NormalizedServerUser> {
	const bypassUserSetting = env.DEV_BYPASS_USER?.trim() ?? '';

	try {
		// Case 1: No setting - use server owner
		if (!bypassUserSetting) {
			const owner = await getServerOwner();
			logger.info(
				`Dev bypass: Using server owner ${owner.plexId} (${owner.username})`,
				'DevBypass'
			);
			return owner;
		}

		// Case 2: Random user selection
		if (bypassUserSetting.toLowerCase() === 'random') {
			// Return cached random user if available
			if (cachedRandomUser) {
				return cachedRandomUser;
			}

			const randomUser = await getRandomNonOwnerUser();

			if (randomUser) {
				cachedRandomUser = randomUser;
				logger.info(
					`Dev bypass: Randomly selected user ${randomUser.plexId} (${randomUser.username})`,
					'DevBypass'
				);
				return randomUser;
			}

			// No shared users - fall back to owner
			logger.warn(
				'Dev bypass: No shared users found for random selection, using server owner',
				'DevBypass'
			);
			const owner = await getServerOwner();
			cachedRandomUser = owner;
			return owner;
		}

		// Case 3: Specific user by ID or username
		const specificUser = await resolveUserIdentifier(bypassUserSetting);

		if (specificUser) {
			logger.info(
				`Dev bypass: Using specified user ${specificUser.plexId} (${specificUser.username})`,
				'DevBypass'
			);
			return specificUser;
		}

		// User not found - warn and fall back to owner
		logger.warn(
			`Dev bypass: User "${bypassUserSetting}" not found on server, falling back to owner`,
			'DevBypass'
		);

		// List available users for developer convenience
		const { owner, sharedUsers } = await getServerUsers();
		const availableUsers = [owner, ...sharedUsers]
			.map((u) => `${u.plexId} (${u.username})`)
			.join(', ');
		logger.info(`Dev bypass: Available users: ${availableUsers}`, 'DevBypass');

		return owner;
	} catch (error) {
		// Plex API failed - fall back to existing user from database
		logger.warn(
			`Dev bypass: Failed to fetch Plex users, attempting to use existing database user. Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
			'DevBypass'
		);
		return await getFallbackUser();
	}
}

// =============================================================================
// User and Session Management
// =============================================================================

/**
 * Get or create a user in the database based on the resolved target user
 *
 * @param targetUser - The normalized user data from Plex
 * @returns The database user ID
 */
async function getOrCreateDevUser(targetUser: NormalizedServerUser): Promise<number> {
	// Check if user already exists
	const existingUser = await db.query.users.findFirst({
		where: eq(users.plexId, targetUser.plexId)
	});

	if (existingUser) {
		// Update user data to match current Plex data
		await db
			.update(users)
			.set({
				username: targetUser.username,
				email: targetUser.email,
				thumb: targetUser.thumb,
				isAdmin: targetUser.isOwner
			})
			.where(eq(users.id, existingUser.id));

		return existingUser.id;
	}

	// Create new user
	const result = await db
		.insert(users)
		.values({
			plexId: targetUser.plexId,
			username: targetUser.username,
			email: targetUser.email,
			thumb: targetUser.thumb,
			isAdmin: targetUser.isOwner
		})
		.returning({ id: users.id });

	const newUser = result[0];
	if (!newUser) {
		throw new Error('Failed to create dev bypass user');
	}

	logger.info(
		`Created dev bypass user: ${targetUser.plexId} (${targetUser.username}) with ID ${newUser.id}`,
		'DevBypass'
	);
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
	// Resolve which user to simulate
	const targetUser = await resolveTargetUser();

	// Get or create the user in database
	const userId = await getOrCreateDevUser(targetUser);

	// Check if dev session exists and is valid
	const existingSession = await db.query.sessions.findFirst({
		where: eq(sessions.id, DEV_SESSION_ID)
	});

	const now = new Date();

	if (existingSession && existingSession.expiresAt > now) {
		// Check if session is for the same user
		if (existingSession.userId === userId) {
			return DEV_SESSION_ID;
		}
		// Different user - delete old session
		await db.delete(sessions).where(eq(sessions.id, DEV_SESSION_ID));
	} else if (existingSession) {
		// Expired session - delete it
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
		isAdmin: targetUser.isOwner,
		expiresAt
	});

	logger.info(
		`Dev bypass session created for ${targetUser.username} (expires: ${expiresAt.toISOString()})`,
		'DevBypass'
	);

	return DEV_SESSION_ID;
}

/**
 * Clear the cached random user (useful for testing or forcing re-selection)
 */
export function clearCachedRandomUser(): void {
	cachedRandomUser = null;
}
