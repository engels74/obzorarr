import {
	clearCachedServerMachineId,
	getApiConfigWithSources,
	getCachedServerMachineId,
	setCachedServerMachineId
} from '$lib/server/admin/settings.service';
import {
	PLEX_CLIENT_ID,
	PLEX_PRODUCT,
	PLEX_VERSION,
	PlexServerIdentitySchema
} from '$lib/server/auth/types';
import { logger } from '$lib/server/logging';
import { classifyConnectionError } from '$lib/server/security/error-sanitizer';

const PLEX_SERVER_HEADERS = {
	Accept: 'application/json',
	'X-Plex-Client-Identifier': PLEX_CLIENT_ID,
	'X-Plex-Product': PLEX_PRODUCT,
	'X-Plex-Version': PLEX_VERSION
} as const;

const CONNECTION_TIMEOUT_MS = 10000;

export interface ServerIdentity {
	machineIdentifier: string;
	friendlyName: string | null;
}

export interface FetchServerIdentityResult {
	identity: ServerIdentity | null;
	errorReason: string | null;
}

export async function fetchServerIdentity(
	serverUrl: string,
	token: string
): Promise<FetchServerIdentityResult> {
	if (!serverUrl || !token) {
		return { identity: null, errorReason: 'Plex server URL or token is not configured' };
	}

	const normalizedUrl = serverUrl.replace(/\/+$/, '');
	const endpoint = `${normalizedUrl}/identity`;

	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), CONNECTION_TIMEOUT_MS);

	try {
		const response = await fetch(endpoint, {
			headers: {
				...PLEX_SERVER_HEADERS,
				'X-Plex-Token': token
			},
			signal: controller.signal
		});

		if (response.status === 401) {
			logger.debug('Server identity fetch failed: 401 (bad token)', 'ServerIdentity');
			return {
				identity: null,
				errorReason:
					'Authentication failed - the PLEX_TOKEN may be invalid or no longer authorized for this server'
			};
		}

		if (!response.ok) {
			logger.debug(
				`Server identity fetch failed: ${response.status} ${response.statusText}`,
				'ServerIdentity'
			);
			return {
				identity: null,
				errorReason: `Server returned ${response.status} ${response.statusText}`
			};
		}

		const data = await response.json();
		const parsed = PlexServerIdentitySchema.safeParse(data);

		if (!parsed.success) {
			logger.debug('Server identity fetch failed: invalid response shape', 'ServerIdentity');
			return {
				identity: null,
				errorReason: 'The server did not return a valid Plex identity response'
			};
		}

		const { machineIdentifier, friendlyName } = parsed.data.MediaContainer;
		return {
			identity: { machineIdentifier, friendlyName: friendlyName ?? null },
			errorReason: null
		};
	} catch (err) {
		if (err instanceof Error) {
			const reason = classifyConnectionError(err);
			logger.debug(`Server identity fetch failed: ${reason}`, 'ServerIdentity');
			return { identity: null, errorReason: reason };
		}

		logger.debug('Server identity fetch failed: unknown error', 'ServerIdentity');
		return { identity: null, errorReason: 'Connection failed' };
	} finally {
		// Keep the timer armed until after response.json() + parsing complete so
		// CONNECTION_TIMEOUT_MS caps the whole /identity call, not just the
		// initial fetch resolving its headers.
		clearTimeout(timeoutId);
	}
}

export interface ConfiguredMachineIdResult {
	machineId: string | null;
	source: 'cache' | 'fresh' | 'unavailable';
	errorReason: string | null;
}

export async function getConfiguredServerMachineId(): Promise<ConfiguredMachineIdResult> {
	const cached = await getCachedServerMachineId();
	if (cached) {
		return { machineId: cached, source: 'cache', errorReason: null };
	}

	return refreshConfiguredServerMachineId();
}

export async function refreshConfiguredServerMachineId(): Promise<ConfiguredMachineIdResult> {
	const config = await getApiConfigWithSources();
	const serverUrl = config.plex.serverUrl.value;
	const token = config.plex.token.value;

	const { identity, errorReason } = await fetchServerIdentity(serverUrl, token);

	if (identity) {
		await setCachedServerMachineId(identity.machineIdentifier);
		return { machineId: identity.machineIdentifier, source: 'fresh', errorReason: null };
	}

	return { machineId: null, source: 'unavailable', errorReason };
}

export async function invalidateConfiguredServerMachineIdCache(): Promise<void> {
	await clearCachedServerMachineId();
}
