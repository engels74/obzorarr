import { getPlexConfig, type PlexConfig } from '$lib/server/admin/settings.service';
import { logger } from '$lib/server/logging';
import { fetchCurrentSharedAccounts } from '$lib/server/plex/accounts';
import { getPlexUserInfo } from './plex-oauth';
import {
	type NormalizedServerUser,
	PLEX_CLIENT_ID,
	PLEX_PRODUCT,
	PLEX_VERSION,
	PlexAuthApiError,
	PlexServerIdentitySchema
} from './types';

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
		throw new PlexAuthApiError('PLEX_SERVER_URL and PLEX_TOKEN must be configured');
	}
	const response = await fetch(`${config.serverUrl}/identity`, {
		headers: { ...PLEX_SERVER_HEADERS, 'X-Plex-Token': config.token }
	});
	if (!response.ok) throw new PlexAuthApiError('Failed to get server identity', response.status);
	const parsed = PlexServerIdentitySchema.safeParse(await response.json());
	if (!parsed.success) throw new PlexAuthApiError('Invalid server identity response');
	return parsed.data.MediaContainer.machineIdentifier;
}

export async function getServerUsers(): Promise<{
	owner: NormalizedServerUser;
	sharedUsers: NormalizedServerUser[];
}> {
	if (usersCache && Date.now() - usersCache.fetchedAt < CACHE_DURATION_MS) {
		return { owner: usersCache.owner, sharedUsers: usersCache.sharedUsers };
	}
	const config = await getPlexConfig();
	if (!config.token) throw new PlexAuthApiError('Plex token is not configured');
	const ownerData = await getPlexUserInfo(config.token);
	const machineIdentifier = await getServerMachineIdentifier(config);
	const shared = await fetchCurrentSharedAccounts(machineIdentifier, config.token);
	if (shared.status !== 'complete') {
		throw new PlexAuthApiError('Current shared Plex identity source is unavailable');
	}
	const owner: NormalizedServerUser = {
		plexId: ownerData.id,
		username: ownerData.username,
		email: ownerData.email,
		thumb: ownerData.thumb ?? null,
		isOwner: true
	};
	const sharedUsers = shared.identities.map((user) => ({
		plexId: user.plexId,
		username: user.username,
		email: null,
		thumb: user.thumb,
		isOwner: false
	}));
	usersCache = { owner, sharedUsers, fetchedAt: Date.now() };
	logger.debug(`Fetched ${sharedUsers.length} shared users from Plex server`, 'DevUsers');
	return { owner, sharedUsers };
}

export async function getServerOwner(): Promise<NormalizedServerUser> {
	return (await getServerUsers()).owner;
}
export async function getUserById(plexId: number): Promise<NormalizedServerUser | null> {
	const { owner, sharedUsers } = await getServerUsers();
	return owner.plexId === plexId
		? owner
		: (sharedUsers.find((user) => user.plexId === plexId) ?? null);
}
export async function getUserByUsername(username: string): Promise<NormalizedServerUser | null> {
	const { owner, sharedUsers } = await getServerUsers();
	const normalized = username.trim().toLowerCase();
	const matches = [owner, ...sharedUsers].filter(
		(user) => user.username.trim().toLowerCase() === normalized
	);
	return matches.length === 1 ? (matches[0] ?? null) : null;
}
export async function getRandomNonOwnerUser(): Promise<NormalizedServerUser | null> {
	const { sharedUsers } = await getServerUsers();
	return sharedUsers.length
		? (sharedUsers[Math.floor(Math.random() * sharedUsers.length)] ?? null)
		: null;
}
export async function resolveUserIdentifier(
	identifier: string
): Promise<NormalizedServerUser | null> {
	const numericId = parseInt(identifier, 10);
	return !Number.isNaN(numericId) && numericId > 0
		? getUserById(numericId)
		: getUserByUsername(identifier);
}
export function clearUsersCache(): void {
	usersCache = null;
}
