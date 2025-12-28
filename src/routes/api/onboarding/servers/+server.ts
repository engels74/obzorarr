import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSessionPlexToken } from '$lib/server/auth/session';
import {
	getPlexResources,
	filterServerResources,
	selectBestConnection,
	generatePlexDirectUrl
} from '$lib/server/auth/membership';
import { logger } from '$lib/server/logging';
import {
	PlexServerIdentitySchema,
	PLEX_CLIENT_ID,
	PLEX_PRODUCT,
	PLEX_VERSION
} from '$lib/server/auth/types';

const PLEX_SERVER_HEADERS = {
	Accept: 'application/json',
	'X-Plex-Client-Identifier': PLEX_CLIENT_ID,
	'X-Plex-Product': PLEX_PRODUCT,
	'X-Plex-Version': PLEX_VERSION
} as const;

interface FetchMachineIdResult {
	machineIdentifier?: string;
	error?: {
		type: 'timeout' | 'ssl' | 'network' | 'http' | 'parse' | 'unknown';
		message: string;
		statusCode?: number;
	};
}

async function fetchMachineIdentifier(
	connectionUri: string,
	accessToken: string,
	serverName?: string
): Promise<FetchMachineIdResult> {
	const normalizedUrl = connectionUri.replace(/\/+$/, '');
	const endpoint = `${normalizedUrl}/identity`;
	const logPrefix = serverName ? `[${serverName}]` : '';

	logger.debug(`${logPrefix} Fetching machineIdentifier from: ${endpoint}`, 'Onboarding');

	try {
		const response = await fetch(endpoint, {
			headers: {
				...PLEX_SERVER_HEADERS,
				'X-Plex-Token': accessToken
			},
			signal: AbortSignal.timeout(5000)
		});

		if (!response.ok) {
			const msg = `HTTP ${response.status} ${response.statusText}`;
			logger.debug(`${logPrefix} Identity fetch failed: ${msg}`, 'Onboarding');
			return { error: { type: 'http', message: msg, statusCode: response.status } };
		}

		const data = await response.json();
		const result = PlexServerIdentitySchema.safeParse(data);

		if (!result.success) {
			logger.debug(`${logPrefix} Invalid identity response: ${result.error.message}`, 'Onboarding');
			return { error: { type: 'parse', message: 'Invalid response schema' } };
		}

		const machineIdentifier = result.data.MediaContainer.machineIdentifier;
		logger.debug(`${logPrefix} Got machineIdentifier: ${machineIdentifier}`, 'Onboarding');
		return { machineIdentifier };
	} catch (err) {
		const errMsg = err instanceof Error ? err.message : String(err);

		if (err instanceof Error) {
			if (err.name === 'AbortError' || err.name === 'TimeoutError') {
				logger.debug(`${logPrefix} Timeout: ${endpoint}`, 'Onboarding');
				return { error: { type: 'timeout', message: 'Connection timed out (5s)' } };
			}
			if (errMsg.includes('certificate') || errMsg.includes('SSL') || errMsg.includes('TLS')) {
				logger.debug(`${logPrefix} SSL error: ${errMsg}`, 'Onboarding');
				return { error: { type: 'ssl', message: errMsg } };
			}
			if (
				errMsg.includes('ENOTFOUND') ||
				errMsg.includes('ECONNREFUSED') ||
				errMsg.includes('ETIMEDOUT')
			) {
				logger.debug(`${logPrefix} Network error: ${errMsg}`, 'Onboarding');
				return { error: { type: 'network', message: errMsg } };
			}
		}

		logger.debug(`${logPrefix} Unknown error: ${errMsg}`, 'Onboarding');
		return { error: { type: 'unknown', message: errMsg } };
	}
}

export const GET: RequestHandler = async ({ cookies, locals }) => {
	if (!locals.user) {
		error(401, 'Authentication required');
	}

	const sessionId = cookies.get('session');
	if (!sessionId) {
		error(401, 'No session found');
	}

	try {
		const plexToken = await getSessionPlexToken(sessionId);
		if (!plexToken) {
			error(401, 'Session expired or invalid');
		}

		const resources = await getPlexResources(plexToken);
		const servers = filterServerResources(resources);

		const formattedServers = await Promise.all(
			servers.map(async (server) => {
				const mappedConnections =
					server.connections?.map((conn) => ({
						uri: conn.uri,
						local: conn.local ?? false,
						relay: conn.relay ?? false
					})) ?? [];

				const hasPlexDirectConnection = mappedConnections.some((conn) =>
					conn.uri.includes('.plex.direct')
				);

				let machineIdentifier: string | undefined;

				if (!hasPlexDirectConnection && server.accessToken) {
					const candidates = [
						...(server.connections?.filter(
							(c) => !c.local && !c.relay && !c.uri.includes('.plex.direct')
						) ?? []),
						...(server.connections?.filter((c) => c.local && !c.relay) ?? [])
					];

					for (const conn of candidates) {
						const result = await fetchMachineIdentifier(
							conn.uri,
							server.accessToken,
							server.name
						);
						if (result.machineIdentifier) {
							machineIdentifier = result.machineIdentifier;
							break;
						}
					}

					if (!machineIdentifier && candidates.length > 0) {
						logger.debug(
							`Failed to fetch machineIdentifier for ${server.name} after ${candidates.length} attempt(s)`,
							'Onboarding'
						);
					}
				} else if (!hasPlexDirectConnection && !server.accessToken) {
					logger.debug(
						`No accessToken for ${server.name}, cannot fetch machineIdentifier`,
						'Onboarding'
					);
				}

				if (!hasPlexDirectConnection && machineIdentifier) {
					const generatedUrl = generatePlexDirectUrl(server, machineIdentifier);
					if (generatedUrl) {
						mappedConnections.unshift({
							uri: generatedUrl,
							local: false,
							relay: false
						});
					}
				}

				let bestConnectionUrl = selectBestConnection(server);
				if (bestConnectionUrl && !bestConnectionUrl.includes('.plex.direct')) {
					const generatedUrl = generatePlexDirectUrl(server, machineIdentifier);
					if (generatedUrl) {
						bestConnectionUrl = generatedUrl;
					}
				}

				return {
					name: server.name,
					clientIdentifier: server.clientIdentifier,
					owned: server.owned,
					accessToken: server.accessToken,
					bestConnectionUrl,
					publicAddress: server.publicAddress,
					connections: mappedConnections
				};
			})
		);

		logger.debug(
			`Found ${formattedServers.length} servers for user ${locals.user.username}`,
			'Onboarding'
		);

		return json({
			servers: formattedServers
		});
	} catch (err) {
		logger.error(
			`Failed to fetch servers: ${err instanceof Error ? err.message : String(err)}`,
			'Onboarding'
		);

		if (err instanceof Error && 'code' in err) {
			const authErr = err as { code: string };
			if (authErr.code === 'PLEX_API_ERROR') {
				error(502, 'Unable to connect to Plex. Please try again.');
			}
		}

		error(500, 'Failed to fetch servers');
	}
};
