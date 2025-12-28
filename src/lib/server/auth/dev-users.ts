import { logger } from '$lib/server/logging';
import {
	PlexFriendsResponseSchema,
	PlexServerIdentitySchema,
	PlexAuthApiError,
	PLEX_CLIENT_ID,
	PLEX_PRODUCT,
	PLEX_VERSION,
	type NormalizedServerUser,
	type PlexSharedServerUser
} from './types';
import { getPlexUserInfo } from './plex-oauth';
import { getPlexConfig, type PlexConfig } from '$lib/server/admin/settings.service';

// SECURITY: This module should only be used in development mode.

const PLEX_TV_URL = 'https://plex.tv';

const PLEX_TV_HEADERS = {
	Accept: 'application/json',
	'X-Plex-Client-Identifier': PLEX_CLIENT_ID,
	'X-Plex-Product': PLEX_PRODUCT,
	'X-Plex-Version': PLEX_VERSION
} as const;

// Plex server requires these headers to return JSON instead of XML
const PLEX_SERVER_HEADERS = {
	Accept: 'application/json',
	'X-Plex-Client-Identifier': PLEX_CLIENT_ID,
	'X-Plex-Product': PLEX_PRODUCT,
	'X-Plex-Version': PLEX_VERSION
} as const;

const CACHE_DURATION_MS = 5 * 60 * 1000;

interface CachedUsers {
	owner: NormalizedServerUser;
	sharedUsers: NormalizedServerUser[];
	fetchedAt: number;
}

let usersCache: CachedUsers | null = null;

async function getServerMachineIdentifier(config: PlexConfig): Promise<string> {
	if (!config.serverUrl || !config.token) {
		throw new PlexAuthApiError(
			'PLEX_SERVER_URL and PLEX_TOKEN must be configured',
			undefined,
			'/identity'
		);
	}

	const endpoint = `${config.serverUrl}/identity`;

	const response = await fetch(endpoint, {
		headers: {
			...PLEX_SERVER_HEADERS,
			'X-Plex-Token': config.token
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

async function fetchSharedUsers(
	machineIdentifier: string,
	token: string
): Promise<PlexSharedServerUser[]> {
	const endpoint = `${PLEX_TV_URL}/api/v2/friends`;

	const response = await fetch(endpoint, {
		headers: {
			...PLEX_TV_HEADERS,
			'X-Plex-Token': token
		}
	});

	if (!response.ok) {
		throw new PlexAuthApiError(
			`Failed to get friends: ${response.status} ${response.statusText}`,
			response.status,
			endpoint
		);
	}

	const data = await response.json();
	const result = PlexFriendsResponseSchema.safeParse(data);

	if (!result.success) {
		logger.warn(
			`Invalid friends response: ${result.error.message}. Shared users will not be available for dev bypass.`,
			'DevUsers'
		);
		return [];
	}

	// Filter friends to only those with access to this specific server
	// and map to PlexSharedServerUser format for compatibility
	return result.data
		.filter((friend) =>
			friend.sharedServers?.some((s) => s.machineIdentifier === machineIdentifier)
		)
		.map((friend) => ({
			id: friend.id,
			username: friend.username,
			email: friend.email,
			thumb: friend.thumb
		}));
}

export async function getServerUsers(): Promise<{
	owner: NormalizedServerUser;
	sharedUsers: NormalizedServerUser[];
}> {
	// Return cached data if still valid
	if (usersCache && Date.now() - usersCache.fetchedAt < CACHE_DURATION_MS) {
		return { owner: usersCache.owner, sharedUsers: usersCache.sharedUsers };
	}

	// Get merged config (database takes priority over environment)
	const config = await getPlexConfig();

	if (!config.token) {
		throw new PlexAuthApiError('Plex token is not configured', undefined, '/dev-users');
	}

	// Fetch owner info using the admin token
	const ownerData = await getPlexUserInfo(config.token);
	const owner: NormalizedServerUser = {
		plexId: ownerData.id,
		username: ownerData.username,
		email: ownerData.email,
		thumb: ownerData.thumb ?? null,
		isOwner: true
	};

	// Fetch server machine identifier and shared users
	const machineIdentifier = await getServerMachineIdentifier(config);
	const sharedUsersData = await fetchSharedUsers(machineIdentifier, config.token);

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

export async function getServerOwner(): Promise<NormalizedServerUser> {
	const { owner } = await getServerUsers();
	return owner;
}

export async function getUserById(plexId: number): Promise<NormalizedServerUser | null> {
	const { owner, sharedUsers } = await getServerUsers();

	if (owner.plexId === plexId) {
		return owner;
	}

	return sharedUsers.find((user) => user.plexId === plexId) ?? null;
}

export async function getUserByUsername(username: string): Promise<NormalizedServerUser | null> {
	const { owner, sharedUsers } = await getServerUsers();
	const lowerUsername = username.toLowerCase();

	if (owner.username.toLowerCase() === lowerUsername) {
		return owner;
	}

	return sharedUsers.find((user) => user.username.toLowerCase() === lowerUsername) ?? null;
}

export async function getRandomNonOwnerUser(): Promise<NormalizedServerUser | null> {
	const { sharedUsers } = await getServerUsers();

	if (sharedUsers.length === 0) {
		return null;
	}

	const randomIndex = Math.floor(Math.random() * sharedUsers.length);
	return sharedUsers[randomIndex] ?? null;
}

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

export function clearUsersCache(): void {
	usersCache = null;
}
