import { z } from 'zod';
import {
	PLEX_CLIENT_ID,
	PLEX_PRODUCT,
	PLEX_VERSION,
	PlexResourcesResponseSchema
} from '$lib/server/auth/types';

export const PLEX_ACCEPTED_SHARED_SERVERS_URL =
	'https://clients.plex.tv/api/v2/shared_servers/owned/accepted';
export const PLEX_RESOURCES_URL = 'https://plex.tv/api/v2/resources?includeHttps=1&includeRelay=1';
export const PLEX_ACCOUNTS_FETCH_TIMEOUT_MS = 10_000;
/**
 * Observed first-party contract (Plex Web, verified against the live account):
 * this endpoint returns the complete accepted-share collection as one top-level
 * JSON array and normally sends no pagination headers. Pagination/count headers
 * are treated only as contrary evidence and must agree with the array.
 */
export const PLEX_ACCEPTED_SHARES_RESPONSE_MODE = 'unpaged-array' as const;

const InvitedSchema = z
	.object({
		id: z.number().int(),
		username: z.string().min(1),
		title: z.string().nullish(),
		thumb: z.string().nullish(),
		home: z.boolean().optional(),
		restricted: z.boolean().optional()
	})
	.passthrough();

export const PlexAcceptedSharedServerSchema = z
	.object({
		id: z.number().int(),
		machineIdentifier: z.string(),
		accepted: z.boolean(),
		deletedAt: z.string().nullable().optional(),
		leftAt: z.string().nullable().optional(),
		invitedId: z.number().int(),
		invited: InvitedSchema,
		owned: z.boolean().optional(),
		libraries: z.unknown().optional(),
		sharingSettings: z.unknown().optional()
	})
	.passthrough();

export type CurrentSharedIdentity = {
	plexId: number;
	username: string;
	thumb: string | null;
};

export type CurrentSharedAccountsResult =
	| { status: 'complete'; identities: CurrentSharedIdentity[] }
	| { status: 'partial'; identities: CurrentSharedIdentity[] }
	| { status: 'failed'; identities: CurrentSharedIdentity[] };

export async function verifyOwnedServerResource(
	machineIdentifier: string,
	token: string,
	fetchImpl: typeof fetch = fetch
): Promise<boolean> {
	try {
		const response = await fetchImpl(PLEX_RESOURCES_URL, {
			method: 'GET',
			headers: {
				Accept: 'application/json',
				'X-Plex-Client-Identifier': PLEX_CLIENT_ID,
				'X-Plex-Product': PLEX_PRODUCT,
				'X-Plex-Version': PLEX_VERSION,
				'X-Plex-Token': token
			},
			signal: AbortSignal.timeout(PLEX_ACCOUNTS_FETCH_TIMEOUT_MS)
		});
		if (!response.ok) return false;
		const parsed = PlexResourcesResponseSchema.safeParse(await response.json());
		return (
			parsed.success &&
			parsed.data.some(
				(resource) =>
					resource.clientIdentifier === machineIdentifier &&
					resource.owned === true &&
					(resource.provides?.split(',').some((provide) => provide.trim() === 'server') ||
						resource.product === 'Plex Media Server')
			)
		);
	} catch {
		return false;
	}
}

export async function fetchCurrentSharedAccounts(
	machineIdentifier: string,
	token: string,
	fetchImpl: typeof fetch = fetch
): Promise<CurrentSharedAccountsResult> {
	let response: Response;
	try {
		response = await fetchImpl(PLEX_ACCEPTED_SHARED_SERVERS_URL, {
			method: 'GET',
			headers: {
				Accept: 'application/json',
				'X-Plex-Client-Identifier': PLEX_CLIENT_ID,
				'X-Plex-Product': PLEX_PRODUCT,
				'X-Plex-Version': PLEX_VERSION,
				'X-Plex-Token': token
			},
			signal: AbortSignal.timeout(PLEX_ACCOUNTS_FETCH_TIMEOUT_MS)
		});
	} catch {
		return { status: 'failed', identities: [] };
	}

	if (!response.ok) {
		return { status: 'failed', identities: [] };
	}

	let data: unknown;
	try {
		data = await response.json();
	} catch {
		return { status: 'failed', identities: [] };
	}
	if (!Array.isArray(data)) {
		return { status: 'failed', identities: [] };
	}
	const link = response.headers?.get('link') ?? null;
	const contentRange = response.headers?.get('content-range') ?? null;
	const declaredTotal = response.headers?.get('x-plex-container-total-size') ?? null;
	const declaredStart = response.headers?.get('x-plex-container-start') ?? null;
	const declaredSize = response.headers?.get('x-plex-container-size') ?? null;
	const hasPaginationMetadata =
		link !== null ||
		contentRange !== null ||
		declaredTotal !== null ||
		declaredStart !== null ||
		declaredSize !== null;
	if (hasPaginationMetadata) {
		const rangeMatch = contentRange?.match(/^(?:items\s+)?(\d+)-(\d+)\/(\d+)$/i) ?? null;
		const totalText = declaredTotal ?? rangeMatch?.[3] ?? null;
		const totalIsValid = totalText !== null && /^\d+$/.test(totalText);
		const startIsValid = declaredStart === null || declaredStart === '0';
		const sizeIsValid = declaredSize === null || Number(declaredSize) === data.length;
		const rangeIsValid =
			contentRange === null ||
			(rangeMatch !== null &&
				Number(rangeMatch[1]) === 0 &&
				Number(rangeMatch[2]) + 1 === data.length);
		if (
			link !== null ||
			!totalIsValid ||
			Number(totalText) !== data.length ||
			!startIsValid ||
			!sizeIsValid ||
			!rangeIsValid
		) {
			return { status: 'partial', identities: [] };
		}
	}

	const identities: CurrentSharedIdentity[] = [];
	let partial = false;
	for (const entry of data) {
		const parsed = PlexAcceptedSharedServerSchema.safeParse(entry);
		if (!parsed.success) {
			partial = true;
			continue;
		}
		const share = parsed.data;
		if (
			share.accepted !== true ||
			share.machineIdentifier !== machineIdentifier ||
			share.deletedAt != null ||
			share.leftAt != null
		) {
			continue;
		}
		if (share.invitedId !== share.invited.id) {
			partial = true;
			continue;
		}
		identities.push({
			plexId: share.invited.id,
			username: share.invited.username,
			thumb: share.invited.thumb ?? null
		});
	}

	if (new Set(identities.map((identity) => identity.plexId)).size !== identities.length) {
		partial = true;
	}
	return { status: partial ? 'partial' : 'complete', identities };
}
