import { env } from '$env/dynamic/private';
import { PLEX_SERVER_URL, PLEX_TOKEN } from '$env/static/private';
import { logger } from '$lib/server/logging';
import {
	PlexSharedServersResponseSchema,
	PlexServerIdentitySchema,
	PlexAuthApiError,
	PLEX_CLIENT_ID,
	PLEX_PRODUCT,
	PLEX_VERSION,
	type NormalizedServerUser,
	type PlexSharedServerUser
} from './types';
import { getPlexUserInfo } from './plex-oauth';

/**
 * Development Users Module
 *
 * Fetches real user information from the Plex server for dev-bypass authentication.
 * This module provides access to:
 * - Server owner information (via PLEX_TOKEN)
 * - Shared users who have access to the server
 *
 * SECURITY: This module should only be used in development mode.
 */

// =============================================================================
// Constants
// =============================================================================

const PLEX_TV_URL = 'https://plex.tv';

const PLEX_TV_HEADERS = {
	Accept: 'application/json',
	'X-Plex-Client-Identifier': PLEX_CLIENT_ID,
	'X-Plex-Product': PLEX_PRODUCT,
	'X-Plex-Version': PLEX_VERSION
} as const;

/**
 * Headers for local Plex Media Server requests
 *
 * The Plex server requires client identification headers to return JSON responses.
 * Without these, the server may return XML instead.
 */
const PLEX_SERVER_HEADERS = {
	Accept: 'application/json',
	'X-Plex-Client-Identifier': PLEX_CLIENT_ID,
	'X-Plex-Product': PLEX_PRODUCT,
	'X-Plex-Version': PLEX_VERSION
} as const;

/** Cache duration for server users (5 minutes) */
const CACHE_DURATION_MS = 5 * 60 * 1000;

// =============================================================================
// Cache
// =============================================================================

interface CachedUsers {
	owner: NormalizedServerUser;
	sharedUsers: NormalizedServerUser[];
	fetchedAt: number;
}

let usersCache: CachedUsers | null = null;

// =============================================================================
// Server Identity
// =============================================================================

/**
 * Get the server's machine identifier from the local Plex server
 */
async function getServerMachineIdentifier(): Promise<string> {
	if (!PLEX_SERVER_URL || !PLEX_TOKEN) {
		throw new PlexAuthApiError(
			'PLEX_SERVER_URL and PLEX_TOKEN must be configured',
			undefined,
			'/identity'
		);
	}

	const endpoint = `${PLEX_SERVER_URL}/identity`;

	const response = await fetch(endpoint, {
		headers: {
			...PLEX_SERVER_HEADERS,
			'X-Plex-Token': PLEX_TOKEN
		}
	});

	if (!response.ok) {
		throw new PlexAuthApiError(
			`Failed to get server identity: ${response.status} ${response.statusText}`,
			response.status,
			endpoint
		);
	}

	const data = await response.json();
	const result = PlexServerIdentitySchema.safeParse(data);

	if (!result.success) {
		throw new PlexAuthApiError(
			`Invalid server identity response: ${result.error.message}`,
			undefined,
			endpoint,
			result.error
		);
	}

	return result.data.MediaContainer.machineIdentifier;
}

// =============================================================================
// Shared Users
// =============================================================================

/**
 * Fetch users who have access to the server (excluding owner)
 *
 * Note: The Plex API /api/servers/{id}/shared_servers endpoint returns XML,
 * not JSON, despite the Accept header. We handle this gracefully by returning
 * an empty array when XML is received. For dev bypass, the owner info is
 * usually sufficient.
 */
async function fetchSharedUsers(machineIdentifier: string): Promise<PlexSharedServerUser[]> {
	const endpoint = `${PLEX_TV_URL}/api/servers/${machineIdentifier}/shared_servers`;

	const response = await fetch(endpoint, {
		headers: {
			...PLEX_TV_HEADERS,
			'X-Plex-Token': PLEX_TOKEN
		}
	});

	if (!response.ok) {
		throw new PlexAuthApiError(
			`Failed to get shared servers: ${response.status} ${response.statusText}`,
			response.status,
			endpoint
		);
	}

	// Check content type - Plex API may return XML instead of JSON for this endpoint
	const contentType = response.headers.get('content-type') ?? '';
	if (contentType.includes('xml')) {
		logger.warn(
			'Plex API returned XML for shared_servers endpoint (expected JSON). Shared users will not be available for dev bypass.',
			'DevUsers'
		);
		return [];
	}

	// Try to parse as JSON
	let data: unknown;
	try {
		data = await response.json();
	} catch (error) {
		// JSON parse failed - likely XML response
		logger.warn(
			`Failed to parse shared_servers response as JSON: ${error instanceof Error ? error.message : 'Unknown error'}. Shared users will not be available for dev bypass.`,
			'DevUsers'
		);
		return [];
	}

	const result = PlexSharedServersResponseSchema.safeParse(data);

	if (!result.success) {
		throw new PlexAuthApiError(
			`Invalid shared servers response: ${result.error.message}`,
			undefined,
			endpoint,
			result.error
		);
	}

	return result.data.MediaContainer.SharedServer ?? [];
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Fetch all users with access to the server (owner + shared users)
 *
 * Results are cached for 5 minutes to avoid excessive API calls.
 */
export async function getServerUsers(): Promise<{
	owner: NormalizedServerUser;
	sharedUsers: NormalizedServerUser[];
}> {
	// Return cached data if still valid
	if (usersCache && Date.now() - usersCache.fetchedAt < CACHE_DURATION_MS) {
		return { owner: usersCache.owner, sharedUsers: usersCache.sharedUsers };
	}

	// Fetch owner info using the admin token
	const ownerData = await getPlexUserInfo(PLEX_TOKEN);
	const owner: NormalizedServerUser = {
		plexId: ownerData.id,
		username: ownerData.username,
		email: ownerData.email,
		thumb: ownerData.thumb ?? null,
		isOwner: true
	};

	// Fetch server machine identifier and shared users
	const machineIdentifier = await getServerMachineIdentifier();
	const sharedUsersData = await fetchSharedUsers(machineIdentifier);

	// Normalize shared users
	const sharedUsers: NormalizedServerUser[] = sharedUsersData.map((user) => ({
		plexId: user.id,
		username: user.username,
		email: user.email ?? null,
		thumb: user.thumb ?? null,
		isOwner: false
	}));

	// Update cache
	usersCache = {
		owner,
		sharedUsers,
		fetchedAt: Date.now()
	};

	logger.debug(`Fetched ${sharedUsers.length} shared users from Plex server`, 'DevUsers');

	return { owner, sharedUsers };
}

/**
 * Get the server owner's information
 */
export async function getServerOwner(): Promise<NormalizedServerUser> {
	const { owner } = await getServerUsers();
	return owner;
}

/**
 * Get a specific user by Plex ID
 *
 * @param plexId - The Plex user ID to find
 * @returns The user if found, null otherwise
 */
export async function getUserById(plexId: number): Promise<NormalizedServerUser | null> {
	const { owner, sharedUsers } = await getServerUsers();

	if (owner.plexId === plexId) {
		return owner;
	}

	return sharedUsers.find((user) => user.plexId === plexId) ?? null;
}

/**
 * Get a specific user by username
 *
 * @param username - The username to find (case-insensitive)
 * @returns The user if found, null otherwise
 */
export async function getUserByUsername(username: string): Promise<NormalizedServerUser | null> {
	const { owner, sharedUsers } = await getServerUsers();
	const lowerUsername = username.toLowerCase();

	if (owner.username.toLowerCase() === lowerUsername) {
		return owner;
	}

	return sharedUsers.find((user) => user.username.toLowerCase() === lowerUsername) ?? null;
}

/**
 * Get a random non-owner user from the server
 *
 * @returns A random shared user, or null if no shared users exist
 */
export async function getRandomNonOwnerUser(): Promise<NormalizedServerUser | null> {
	const { sharedUsers } = await getServerUsers();

	if (sharedUsers.length === 0) {
		return null;
	}

	const randomIndex = Math.floor(Math.random() * sharedUsers.length);
	return sharedUsers[randomIndex] ?? null;
}

/**
 * Resolve a user identifier (can be Plex ID or username)
 *
 * @param identifier - Either a numeric Plex ID or a username string
 * @returns The resolved user, or null if not found
 */
export async function resolveUserIdentifier(
	identifier: string
): Promise<NormalizedServerUser | null> {
	// Try parsing as numeric Plex ID first
	const numericId = parseInt(identifier, 10);

	if (!isNaN(numericId) && numericId > 0) {
		return getUserById(numericId);
	}

	// Otherwise treat as username
	return getUserByUsername(identifier);
}

/**
 * Clear the users cache (useful for testing)
 */
export function clearUsersCache(): void {
	usersCache = null;
}
