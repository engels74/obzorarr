/**
 * Plex Accounts Sync Service
 *
 * Fetches all server members from Plex (owner + shared users) and stores
 * their information in the plex_accounts table. This enables displaying
 * real Plex usernames in Top Contributors and other statistics for ALL
 * users who have watched content, not just those registered with Obzorarr.
 */

import { PLEX_SERVER_URL, PLEX_TOKEN } from '$env/static/private';
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

const PLEX_SERVER_HEADERS = {
	Accept: 'application/json',
	'X-Plex-Client-Identifier': PLEX_CLIENT_ID,
	'X-Plex-Product': PLEX_PRODUCT,
	'X-Plex-Version': PLEX_VERSION
} as const;

// =============================================================================
// Internal Functions
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

/**
 * Managed user account from local Plex server
 */
interface ManagedAccount {
	id: number;
	name: string;
	thumb: string | null;
}

/**
 * Fetch managed accounts from the local Plex server.
 * These are local accounts created on the server (not Plex.tv shared users).
 */
async function fetchManagedAccounts(): Promise<ManagedAccount[]> {
	if (!PLEX_SERVER_URL || !PLEX_TOKEN) {
		return [];
	}

	const endpoint = `${PLEX_SERVER_URL}/accounts`;

	try {
		const response = await fetch(endpoint, {
			headers: {
				...PLEX_SERVER_HEADERS,
				'X-Plex-Token': PLEX_TOKEN
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

/**
 * Fetch users who have access to the server (excluding owner)
 *
 * Uses the v2 friends endpoint which properly returns JSON instead of the
 * legacy shared_servers endpoint which returns XML.
 */
async function fetchSharedUsers(machineIdentifier: string): Promise<PlexSharedServerUser[]> {
	const endpoint = `${PLEX_TV_URL}/api/v2/friends`;

	const response = await fetch(endpoint, {
		headers: {
			...PLEX_TV_HEADERS,
			'X-Plex-Token': PLEX_TOKEN
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
		.filter((friend) => friend.sharedServers?.some((s) => s.machineIdentifier === machineIdentifier))
		.map((friend) => ({
			id: friend.id,
			username: friend.username,
			email: friend.email,
			thumb: friend.thumb
		}));
}

// =============================================================================
// Public API
// =============================================================================

export interface PlexAccountInfo {
	accountId: number;
	plexId: number;
	username: string;
	thumb: string | null;
	isOwner: boolean;
}

/**
 * Sync all Plex server members to the plex_accounts table.
 *
 * This fetches the server owner and all shared users from the Plex API,
 * then upserts their information into the database. This ensures that
 * Top Contributors and other statistics can display real Plex usernames
 * for ALL users who have watched content.
 *
 * Account ID mapping:
 * - Server owner: accountId = 1 (Plex's local admin account)
 * - Shared users: accountId = plexId (their Plex.tv account ID)
 *
 * @returns The number of accounts synced
 */
export async function syncPlexAccounts(): Promise<number> {
	logger.info('Starting Plex accounts sync...', 'PlexAccountsSync');

	const accounts: PlexAccountInfo[] = [];

	try {
		// Fetch owner info using the admin token
		const ownerData = await getPlexUserInfo(PLEX_TOKEN);

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

/**
 * Get a username for an accountId from the plex_accounts table.
 *
 * @param accountId - The Plex account ID from play history
 * @returns The username if found, null otherwise
 */
export async function getPlexUsername(accountId: number): Promise<string | null> {
	const result = await db.query.plexAccounts.findFirst({
		where: (accounts, { eq }) => eq(accounts.accountId, accountId),
		columns: { username: true }
	});

	return result?.username ?? null;
}

/**
 * Get all Plex accounts from the database.
 *
 * @returns Map of accountId to PlexAccountInfo
 */
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

/**
 * Result of a username lookup for quick access
 */
export interface UserLookupResult {
	/** The user's database ID (from users table) */
	userId: number;
	/** The user's Plex username */
	username: string;
	/** The local Plex account ID */
	accountId: number;
}

/**
 * Find a registered user by their Plex username (case-insensitive).
 *
 * This is used for the landing page quick access feature, allowing users
 * to enter their username to view their wrapped page without logging in.
 *
 * The lookup process:
 * 1. Search plex_accounts table for the username (case-insensitive)
 * 2. If found, check if they have a registered account in the users table
 * 3. Only return users who have authenticated with Obzorarr
 *
 * @param username - The Plex username to search for
 * @returns User info if found and registered, null otherwise
 *
 * @example
 * ```typescript
 * const user = await findUserByUsername('JohnDoe');
 * if (user) {
 *   redirect(303, `/wrapped/2024/u/${user.userId}`);
 * }
 * ```
 */
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
