import { and, eq, notInArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
	AppSettingsKey,
	getAppSetting,
	getPlexConfig,
	getPlexConfigFingerprint,
	type PlexConfig,
	setCachedServerMachineId
} from '$lib/server/admin/settings.service';
import { getPlexUserInfo } from '$lib/server/auth/plex-oauth';
import {
	PLEX_CLIENT_ID,
	PLEX_PRODUCT,
	PLEX_VERSION,
	PlexAuthApiError,
	PlexServerIdentitySchema
} from '$lib/server/auth/types';
import { db } from '$lib/server/db/client';
import { appSettings, plexAccounts, users } from '$lib/server/db/schema';
import { logger } from '$lib/server/logging';
import {
	type CurrentSharedIdentity,
	fetchCurrentSharedAccounts,
	verifyOwnedServerResource
} from '$lib/server/plex/accounts';

const PLEX_SERVER_HEADERS = {
	Accept: 'application/json',
	'X-Plex-Client-Identifier': PLEX_CLIENT_ID,
	'X-Plex-Product': PLEX_PRODUCT,
	'X-Plex-Version': PLEX_VERSION
} as const;

export const PLEX_ACCOUNT_FRESHNESS_MS = 24 * 60 * 60 * 1000;
export const PLEX_REQUEST_TIMEOUT_MS = 10_000;

const PmsAccountsSchema = z.object({
	MediaContainer: z.object({
		Account: z.array(
			z.object({ id: z.number().int(), name: z.string(), thumb: z.string().nullish() })
		)
	})
});

const IdentityProofSchema = z.object({
	protocol: z.literal('three-proof-v1'),
	fingerprintProtocol: z.literal('plex-config-fingerprint-v1'),
	authorityEpoch: z.string().regex(/^[1-9]\d*$/),
	machineIdentifier: z.string().min(1),
	configFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
	confirmedAt: z.number().int().nonnegative()
});

type ManagedAccount = z.infer<typeof PmsAccountsSchema>['MediaContainer']['Account'][number];
type IdentityProof = z.infer<typeof IdentityProofSchema>;
type CorrelatedSharedIdentity = CurrentSharedIdentity & { accountId: number };

async function readAuthoritySnapshot(): Promise<{
	config: PlexConfig;
	configFingerprint: string;
	authorityEpoch: string | null;
	authorityDiscriminator: string | null;
}> {
	const config = await getPlexConfig();
	const configFingerprint = getPlexConfigFingerprint(config);
	return {
		config,
		configFingerprint,
		authorityEpoch: await getAppSetting(AppSettingsKey.PLEX_AUTHORITY_EPOCH),
		authorityDiscriminator: await getAppSetting(AppSettingsKey.PLEX_AUTHORITY_DISCRIMINATOR)
	};
}

function hasCurrentAuthorityDiscriminator(snapshot: {
	configFingerprint: string;
	authorityDiscriminator: string | null;
}): boolean {
	return (
		typeof snapshot.authorityDiscriminator === 'string' &&
		/^[a-f0-9]{64}$/.test(snapshot.authorityDiscriminator) &&
		snapshot.authorityDiscriminator === snapshot.configFingerprint
	);
}

function isCanonicalPositiveAuthorityEpoch(value: string | null): value is string {
	return typeof value === 'string' && /^[1-9]\d*$/.test(value);
}

export async function buildPlexIdentityProofValue(
	machineIdentifier: string,
	confirmedAt: number
): Promise<string> {
	await setCachedServerMachineId(machineIdentifier);
	const snapshot = await readAuthoritySnapshot();
	if (
		!isCanonicalPositiveAuthorityEpoch(snapshot.authorityEpoch) ||
		!hasCurrentAuthorityDiscriminator(snapshot)
	) {
		throw new Error('Plex authority is unavailable');
	}
	return JSON.stringify({
		protocol: 'three-proof-v1',
		fingerprintProtocol: 'plex-config-fingerprint-v1',
		authorityEpoch: snapshot.authorityEpoch,
		machineIdentifier,
		configFingerprint: snapshot.configFingerprint,
		confirmedAt
	} satisfies IdentityProof);
}

async function getServerMachineIdentifier(config: PlexConfig): Promise<string> {
	if (!config.serverUrl || !config.token) {
		throw new PlexAuthApiError('PLEX_SERVER_URL and PLEX_TOKEN must be configured');
	}
	let response: Response;
	try {
		response = await fetch(`${config.serverUrl}/identity`, {
			headers: { ...PLEX_SERVER_HEADERS, 'X-Plex-Token': config.token },
			signal: AbortSignal.timeout(PLEX_REQUEST_TIMEOUT_MS)
		});
	} catch {
		throw new PlexAuthApiError('Failed to get server identity');
	}
	if (!response.ok) {
		throw new PlexAuthApiError('Failed to get server identity', response.status);
	}
	try {
		const result = PlexServerIdentitySchema.safeParse(await response.json());
		if (!result.success) throw new PlexAuthApiError('Invalid server identity response');
		return result.data.MediaContainer.machineIdentifier;
	} catch (error) {
		if (error instanceof PlexAuthApiError) throw error;
		throw new PlexAuthApiError('Invalid server identity response');
	}
}

async function fetchManagedAccounts(config: PlexConfig): Promise<ManagedAccount[] | null> {
	try {
		const response = await fetch(`${config.serverUrl}/accounts`, {
			headers: { ...PLEX_SERVER_HEADERS, 'X-Plex-Token': config.token },
			signal: AbortSignal.timeout(PLEX_REQUEST_TIMEOUT_MS)
		});
		if (!response.ok) return null;
		const parsed = PmsAccountsSchema.safeParse(await response.json());
		return parsed.success ? parsed.data.MediaContainer.Account : null;
	} catch {
		return null;
	}
}

export interface PlexAccountInfo {
	accountId: number;
	plexId: number;
	username: string;
	thumb: string | null;
	isOwner: boolean;
}

function assertIdentitySet(owner: PlexAccountInfo, identities: CorrelatedSharedIdentity[]): void {
	const plexIds = new Set<number>([owner.plexId]);
	const accountIds = new Set<number>([owner.accountId]);
	for (const identity of identities) {
		if (
			identity.accountId === 1 ||
			plexIds.has(identity.plexId) ||
			accountIds.has(identity.accountId)
		) {
			throw new Error('Plex identity conflict');
		}
		plexIds.add(identity.plexId);
		accountIds.add(identity.accountId);
	}
}

function persistCompleteSnapshot(
	owner: PlexAccountInfo,
	identities: CorrelatedSharedIdentity[],
	proof: IdentityProof
): boolean {
	assertIdentitySet(owner, identities);
	return db.transaction((tx) => {
		const storedEpoch = tx
			.select({ value: appSettings.value })
			.from(appSettings)
			.where(eq(appSettings.key, AppSettingsKey.PLEX_AUTHORITY_EPOCH))
			.limit(1)
			.all();
		const storedMachine = tx
			.select({ value: appSettings.value })
			.from(appSettings)
			.where(eq(appSettings.key, AppSettingsKey.SERVER_MACHINE_ID))
			.limit(1)
			.all();
		const storedDiscriminator = tx
			.select({ value: appSettings.value })
			.from(appSettings)
			.where(eq(appSettings.key, AppSettingsKey.PLEX_AUTHORITY_DISCRIMINATOR))
			.limit(1)
			.all();
		if (
			storedEpoch[0]?.value !== proof.authorityEpoch ||
			storedMachine[0]?.value !== proof.machineIdentifier ||
			storedDiscriminator[0]?.value !== proof.configFingerprint ||
			!/^[a-f0-9]{64}$/.test(storedDiscriminator[0]?.value ?? '')
		) {
			return false;
		}

		const allIdentities = [
			owner,
			...identities.map((identity) => ({ ...identity, isOwner: false }))
		];
		for (const identity of allIdentities) {
			const byPlex = tx.select().from(users).where(eq(users.plexId, identity.plexId)).all();
			const byAccount = tx
				.select()
				.from(users)
				.where(eq(users.accountId, identity.accountId))
				.all();
			const mappingsByAccount = tx
				.select()
				.from(plexAccounts)
				.where(eq(plexAccounts.accountId, identity.accountId))
				.all();
			const mappingsByPlex = tx
				.select()
				.from(plexAccounts)
				.where(eq(plexAccounts.plexId, identity.plexId))
				.all();
			if (
				byPlex.length > 1 ||
				byAccount.length > 1 ||
				(byPlex[0] && byPlex[0].accountId !== null && byPlex[0].accountId !== identity.accountId) ||
				byAccount.some((user) => user.plexId !== identity.plexId) ||
				mappingsByAccount.some((mapping) => mapping.plexId !== identity.plexId) ||
				mappingsByPlex.some((mapping) => mapping.accountId !== identity.accountId)
			) {
				throw new Error('Plex identity conflict');
			}
		}

		const confirmedAt = new Date(proof.confirmedAt);
		for (const identity of allIdentities) {
			const existing = tx.select().from(users).where(eq(users.plexId, identity.plexId)).get();
			if (existing) {
				tx.update(users)
					.set({
						accountId: identity.accountId,
						username: identity.username,
						thumb: identity.thumb,
						isAdmin: identity.isOwner ? true : existing.isAdmin
					})
					.where(eq(users.id, existing.id))
					.run();
			} else {
				tx.insert(users)
					.values({
						plexId: identity.plexId,
						accountId: identity.accountId,
						username: identity.username,
						thumb: identity.thumb,
						isAdmin: identity.isOwner
					})
					.run();
			}
			tx.insert(plexAccounts)
				.values({ ...identity, updatedAt: confirmedAt })
				.onConflictDoUpdate({
					target: plexAccounts.accountId,
					set: {
						plexId: identity.plexId,
						username: identity.username,
						thumb: identity.thumb,
						isOwner: identity.isOwner,
						updatedAt: confirmedAt
					}
				})
				.run();
		}

		const activeAccountIds = allIdentities.map((identity) => identity.accountId);
		tx.delete(plexAccounts).where(notInArray(plexAccounts.accountId, activeAccountIds)).run();
		tx.insert(appSettings)
			.values({
				key: AppSettingsKey.PLEX_IDENTITY_PROOF,
				value: JSON.stringify(proof),
				updatedAt: confirmedAt
			})
			.onConflictDoUpdate({
				target: appSettings.key,
				set: { value: JSON.stringify(proof), updatedAt: confirmedAt }
			})
			.run();
		tx.insert(appSettings)
			.values({
				key: AppSettingsKey.SERVER_MACHINE_ID,
				value: proof.machineIdentifier,
				updatedAt: confirmedAt
			})
			.onConflictDoUpdate({
				target: appSettings.key,
				set: { value: proof.machineIdentifier, updatedAt: confirmedAt }
			})
			.run();
		return true;
	});
}

async function readCurrentProof(): Promise<IdentityProof | null> {
	const value = await getAppSetting(AppSettingsKey.PLEX_IDENTITY_PROOF);
	if (!value) return null;
	try {
		const parsed = IdentityProofSchema.safeParse(JSON.parse(value));
		return parsed.success ? parsed.data : null;
	} catch {
		return null;
	}
}

async function isProofCurrent(proof: IdentityProof): Promise<boolean> {
	if (Date.now() - proof.confirmedAt >= PLEX_ACCOUNT_FRESHNESS_MS) return false;
	const snapshot = await readAuthoritySnapshot();
	if (
		!hasCurrentAuthorityDiscriminator(snapshot) ||
		!isCanonicalPositiveAuthorityEpoch(snapshot.authorityEpoch) ||
		snapshot.configFingerprint !== proof.configFingerprint ||
		snapshot.authorityEpoch !== proof.authorityEpoch
	) {
		return false;
	}
	const cachedMachine = await getAppSetting(AppSettingsKey.SERVER_MACHINE_ID);
	return cachedMachine === proof.machineIdentifier;
}

export async function runPlexAccountReconciliation(): Promise<number> {
	const beforeObservation = await readAuthoritySnapshot();
	const beforeConfig = beforeObservation.config;
	if (
		!beforeConfig.serverUrl ||
		!beforeConfig.token ||
		!isCanonicalPositiveAuthorityEpoch(beforeObservation.authorityEpoch) ||
		!hasCurrentAuthorityDiscriminator(beforeObservation)
	) {
		throw new PlexAuthApiError('Plex authority is not configured. Finish onboarding first.');
	}

	const machineIdentifier = await getServerMachineIdentifier(beforeConfig);
	await setCachedServerMachineId(machineIdentifier);
	const captured = await readAuthoritySnapshot();
	const capturedAuthorityEpoch = captured.authorityEpoch;
	const config = captured.config;
	if (
		!isCanonicalPositiveAuthorityEpoch(capturedAuthorityEpoch) ||
		!hasCurrentAuthorityDiscriminator(captured) ||
		captured.configFingerprint !== beforeObservation.configFingerprint
	) {
		logger.warn(
			'Plex authority changed during sync; discarded stale identity work.',
			'PlexAccountsSync'
		);
		return 0;
	}

	const [ownerData, shared, managed, ownerResource] = await Promise.all([
		getPlexUserInfo(config.token, { signal: AbortSignal.timeout(PLEX_REQUEST_TIMEOUT_MS) }),
		fetchCurrentSharedAccounts(machineIdentifier, config.token),
		fetchManagedAccounts(config),
		verifyOwnedServerResource(machineIdentifier, config.token)
	]);
	if (shared.status !== 'complete' || managed === null || !ownerResource) {
		logger.warn(
			'Plex identity sources are incomplete; retained the prior identity snapshot.',
			'PlexAccountsSync'
		);
		return 0;
	}

	const managedById = new Map(managed.map((account) => [account.id, account]));
	if (
		managedById.size !== managed.length ||
		shared.identities.some((identity) => !managedById.has(identity.plexId))
	) {
		logger.warn(
			'Plex identity sources could not be correlated; retained the prior identity snapshot.',
			'PlexAccountsSync'
		);
		return 0;
	}
	const correlatedIdentities: CorrelatedSharedIdentity[] = shared.identities.map((identity) => ({
		...identity,
		accountId: managedById.get(identity.plexId)!.id
	}));

	const current = await readAuthoritySnapshot();
	const currentMachineIdentifier = await getServerMachineIdentifier(current.config);
	const cachedMachineIdentifier = await getAppSetting(AppSettingsKey.SERVER_MACHINE_ID);
	if (
		!hasCurrentAuthorityDiscriminator(current) ||
		!isCanonicalPositiveAuthorityEpoch(current.authorityEpoch) ||
		current.configFingerprint !== captured.configFingerprint ||
		current.authorityEpoch !== capturedAuthorityEpoch ||
		cachedMachineIdentifier !== machineIdentifier ||
		currentMachineIdentifier !== machineIdentifier
	) {
		logger.warn(
			'Plex authority changed during sync; discarded stale identity work.',
			'PlexAccountsSync'
		);
		return 0;
	}

	const owner: PlexAccountInfo = {
		accountId: 1,
		plexId: ownerData.id,
		username: ownerData.username,
		thumb: ownerData.thumb ?? null,
		isOwner: true
	};
	const proof: IdentityProof = {
		protocol: 'three-proof-v1',
		fingerprintProtocol: 'plex-config-fingerprint-v1',
		authorityEpoch: capturedAuthorityEpoch,
		machineIdentifier,
		configFingerprint: captured.configFingerprint,
		confirmedAt: Date.now()
	};
	const persisted = await persistCompleteSnapshot(owner, correlatedIdentities, proof);
	if (!persisted) {
		logger.warn(
			'Plex authority changed while applying sync; discarded stale identity work.',
			'PlexAccountsSync'
		);
		return 0;
	}
	return 1 + correlatedIdentities.length;
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
	return new Map(
		results.map((account) => [account.accountId, { ...account, isOwner: account.isOwner ?? false }])
	);
}

export interface UserLookupResult {
	userId: number;
	username: string;
	accountId: number;
}

export async function hasFreshPlexAccountMapping(userId: number): Promise<boolean> {
	const rows = await db
		.select({
			userId: users.id,
			userAccountId: users.accountId,
			userPlexId: users.plexId,
			mappingAccountId: plexAccounts.accountId,
			mappingPlexId: plexAccounts.plexId,
			updatedAt: plexAccounts.updatedAt
		})
		.from(users)
		.innerJoin(
			plexAccounts,
			and(eq(users.accountId, plexAccounts.accountId), eq(users.plexId, plexAccounts.plexId))
		)
		.where(eq(users.id, userId));
	if (rows.length !== 1 || !rows[0]?.updatedAt) return false;
	const proof = await readCurrentProof();
	return (
		proof !== null &&
		Math.floor(rows[0].updatedAt.getTime() / 1000) === Math.floor(proof.confirmedAt / 1000) &&
		(await isProofCurrent(proof))
	);
}

export async function findUserByUsername(
	username: string,
	options: { createIfMissing?: boolean } = {}
): Promise<UserLookupResult | null> {
	const normalized = username.trim();
	if (!normalized) return null;
	const mappings = await db
		.select()
		.from(plexAccounts)
		.where(sql`LOWER(${plexAccounts.username}) = LOWER(${normalized})`);
	if (mappings.length !== 1) return null;
	const mapping = mappings[0];
	if (!mapping?.updatedAt || Date.now() - mapping.updatedAt.getTime() >= PLEX_ACCOUNT_FRESHNESS_MS)
		return null;
	const globalUsers = await db.select().from(users).where(eq(users.plexId, mapping.plexId));
	if (globalUsers.length > 1) return null;
	const accountUsers = await db.select().from(users).where(eq(users.accountId, mapping.accountId));
	const user = globalUsers[0];
	if (user) {
		if (
			user.accountId !== mapping.accountId ||
			accountUsers.some((candidate) => candidate.id !== user.id) ||
			!(await hasFreshPlexAccountMapping(user.id))
		)
			return null;
		return { userId: user.id, username: user.username, accountId: mapping.accountId };
	}
	if (!options.createIfMissing || accountUsers.length !== 0) return null;
	const proof = await readCurrentProof();
	if (
		!proof ||
		Math.floor(mapping.updatedAt.getTime() / 1000) !== Math.floor(proof.confirmedAt / 1000) ||
		!(await isProofCurrent(proof))
	) {
		return null;
	}
	const inserted = await db
		.insert(users)
		.values({
			plexId: mapping.plexId,
			accountId: mapping.accountId,
			username: mapping.username,
			thumb: mapping.thumb,
			isAdmin: false
		})
		.returning({ id: users.id });
	return inserted[0]
		? { userId: inserted[0].id, username: mapping.username, accountId: mapping.accountId }
		: null;
}
