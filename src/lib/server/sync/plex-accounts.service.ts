import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db/client';
import { plexAccounts, users } from '$lib/server/db/schema';
import { sql, or, eq } from 'drizzle-orm';
import { logger } from '$lib/server/logging';
import {
	PlexFriendsResponseSchema,
	PlexServerIdentitySchema,
	PlexAuthApiError,
	PLEX_CLIENT_ID,
	PLEX_PRODUCT,
	PLEX_VERSION,
	type PlexSharedServerUser
} from '$lib/server/auth/types';
import { getPlexUserInfo } from '$lib/server/auth/plex-oauth';

const PLEX_TV_URL = 'https://plex.tv';

const PLEX_TV_HEADERS = {
	Accept: 'application/json',
	'X-Plex-Client-Identifier': PLEX_CLIENT_ID,
	'X-Plex-Product': PLEX_PRODUCT,
	'X-Plex-Version': PLEX_VERSION
} as const;

const PLEX_SERVER_HEADERS = {
	Accept: 'application/json',
	'X-Plex-Client-Identifier': PLEX_CLIENT_ID,
	'X-Plex-Product': PLEX_PRODUCT,
	'X-Plex-Version': PLEX_VERSION
} as const;

async function getServerMachineIdentifier(): Promise<string> {
	if (!env.PLEX_SERVER_URL || !env.PLEX_TOKEN) {
		throw new PlexAuthApiError(
			'PLEX_SERVER_URL and PLEX_TOKEN must be configured',
			undefined,
			'/identity'
		);
	}

	const endpoint = `${env.PLEX_SERVER_URL}/identity`;

	const response = await fetch(endpoint, {
		headers: {
			...PLEX_SERVER_HEADERS,
			'X-Plex-Token': env.PLEX_TOKEN ?? ''
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

interface ManagedAccount {
	id: number;
	name: string;
	thumb: string | null;
}

// Local accounts created on the server (not Plex.tv shared users)
async function fetchManagedAccounts(): Promise<ManagedAccount[]> {
	if (!env.PLEX_SERVER_URL || !env.PLEX_TOKEN) {
		return [];
	}

	const endpoint = `${env.PLEX_SERVER_URL}/accounts`;

	try {
		const response = await fetch(endpoint, {
			headers: {
				...PLEX_SERVER_HEADERS,
				'X-Plex-Token': env.PLEX_TOKEN ?? ''
			}
		});

		if (!response.ok) {
			logger.warn(
				`Failed to fetch managed accounts: ${response.status} ${response.statusText}`,
				'PlexAccountsSync'
			);
			return [];
		}

		const data = await response.json();

		// Parse JSON response - structure: { MediaContainer: { Account: [...] } }
		const accounts: ManagedAccount[] = [];

		interface PlexAccount {
			id: number;
			name: string;
			thumb?: string;
		}

		const mediaContainer = data as { MediaContainer?: { Account?: PlexAccount[] } };
		const plexAccounts = mediaContainer.MediaContainer?.Account ?? [];

		for (const account of plexAccounts) {
			// Skip accounts without a name (like the root account id=0)
			if (account.id !== undefined && account.name) {
				accounts.push({
					id: account.id,
					name: account.name,
					thumb: account.thumb ?? null
				});
			}
		}

		logger.info(`Parsed ${accounts.length} managed accounts from Plex server`, 'PlexAccountsSync');
		return accounts;
	} catch (error) {
		logger.warn(
			`Error fetching managed accounts: ${error instanceof Error ? error.message : 'Unknown error'}`,
			'PlexAccountsSync'
		);
		return [];
	}
}

// Uses v2 friends endpoint (returns JSON) instead of legacy shared_servers (XML)
async function fetchSharedUsers(machineIdentifier: string): Promise<PlexSharedServerUser[]> {
	const endpoint = `${PLEX_TV_URL}/api/v2/friends`;

	const response = await fetch(endpoint, {
		headers: {
			...PLEX_TV_HEADERS,
			'X-Plex-Token': env.PLEX_TOKEN ?? ''
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
			`Invalid friends response: ${result.error.message}. Shared users will not have cached usernames.`,
			'PlexAccountsSync'
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

export interface PlexAccountInfo {
	accountId: number;
	plexId: number;
	username: string;
	thumb: string | null;
	isOwner: boolean;
}

// Account ID mapping: owner = 1, shared users = plexId
export async function syncPlexAccounts(): Promise<number> {
	logger.info('Starting Plex accounts sync...', 'PlexAccountsSync');

	const accounts: PlexAccountInfo[] = [];

	try {
		// Fetch owner info using the admin token
		const ownerData = await getPlexUserInfo(env.PLEX_TOKEN ?? '');

		// Server owner has accountId = 1 in play history
		accounts.push({
			accountId: 1,
			plexId: ownerData.id,
			username: ownerData.username,
			thumb: ownerData.thumb ?? null,
			isOwner: true
		});

		// Fetch server machine identifier and shared users
		const machineIdentifier = await getServerMachineIdentifier();
		const sharedUsersData = await fetchSharedUsers(machineIdentifier);

		// Shared users have accountId = plexId in play history
		for (const user of sharedUsersData) {
			accounts.push({
				accountId: user.id, // For shared users, accountId equals plexId
				plexId: user.id,
				username: user.username,
				thumb: user.thumb ?? null,
				isOwner: false
			});
		}

		// Fetch managed accounts from local server (these are local accounts, not Plex.tv users)
		const managedAccountsData = await fetchManagedAccounts();
		let managedCount = 0;

		for (const account of managedAccountsData) {
			// Skip if we already have this accountId (owner or shared user takes precedence)
			if (accounts.some((a) => a.accountId === account.id)) {
				continue;
			}

			accounts.push({
				accountId: account.id,
				plexId: account.id, // Managed accounts don't have Plex.tv IDs, use local ID
				username: account.name,
				thumb: account.thumb,
				isOwner: false
			});
			managedCount++;
		}

		// Upsert all accounts into the database
		for (const account of accounts) {
			await db
				.insert(plexAccounts)
				.values({
					accountId: account.accountId,
					plexId: account.plexId,
					username: account.username,
					thumb: account.thumb,
					isOwner: account.isOwner,
					updatedAt: new Date()
				})
				.onConflictDoUpdate({
					target: plexAccounts.accountId,
					set: {
						plexId: account.plexId,
						username: account.username,
						thumb: account.thumb,
						isOwner: account.isOwner,
						updatedAt: new Date()
					}
				});
		}

		const sharedCount = sharedUsersData.length;
		logger.info(
			`Synced ${accounts.length} Plex accounts (1 owner, ${sharedCount} shared users, ${managedCount} managed accounts)`,
			'PlexAccountsSync'
		);

		return accounts.length;
	} catch (error) {
		logger.error(
			`Failed to sync Plex accounts: ${error instanceof Error ? error.message : 'Unknown error'}`,
			'PlexAccountsSync'
		);
		throw error;
	}
}

export async function getPlexUsername(accountId: number): Promise<string | null> {
	const result = await db.query.plexAccounts.findFirst({
		where: (accounts, { eq }) => eq(accounts.accountId, accountId),
		columns: { username: true }
	});

	return result?.username ?? null;
}

export async function getAllPlexAccounts(): Promise<Map<number, PlexAccountInfo>> {
	const results = await db.select().from(plexAccounts);

	const map = new Map<number, PlexAccountInfo>();
	for (const account of results) {
		map.set(account.accountId, {
			accountId: account.accountId,
			plexId: account.plexId,
			username: account.username,
			thumb: account.thumb,
			isOwner: account.isOwner ?? false
		});
	}

	return map;
}

export interface UserLookupResult {
	userId: number;
	username: string;
	accountId: number;
}

// Used for landing page quick access - find registered users by username
export async function findUserByUsername(username: string): Promise<UserLookupResult | null> {
	// Step 1: Find in plexAccounts (case-insensitive using LOWER())
	const plexAccountResults = await db
		.select()
		.from(plexAccounts)
		.where(sql`LOWER(${plexAccounts.username}) = LOWER(${username})`)
		.limit(1);

	const plexAccount = plexAccountResults[0];
	if (!plexAccount) {
		return null; // Username not found on server
	}

	// Step 2: Check if this account is registered in users table
	// Match by accountId or plexId (handles both owner and shared users)
	const userResults = await db
		.select()
		.from(users)
		.where(or(eq(users.accountId, plexAccount.accountId), eq(users.plexId, plexAccount.plexId)))
		.limit(1);

	const user = userResults[0];
	if (!user) {
		return null; // User exists in Plex but hasn't registered with Obzorarr
	}

	return {
		userId: user.id,
		username: user.username,
		accountId: plexAccount.accountId
	};
}
