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

async function fetchMachineIdentifier(
	connectionUri: string,
	accessToken: string
): Promise<string | undefined> {
	try {
		const normalizedUrl = connectionUri.replace(/\/+$/, '');
		const response = await fetch(`${normalizedUrl}/identity`, {
			headers: {
				...PLEX_SERVER_HEADERS,
				'X-Plex-Token': accessToken
			},
			signal: AbortSignal.timeout(5000)
		});

		if (!response.ok) return undefined;

		const data = await response.json();
		const result = PlexServerIdentitySchema.safeParse(data);
		return result.success ? result.data.MediaContainer.machineIdentifier : undefined;
	} catch {
		return undefined;
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

				if (!hasPlexDirectConnection && server.publicAddress && server.accessToken) {
					const publicConnection = server.connections?.find(
						(c) => !c.local && !c.relay && !c.uri.includes('.plex.direct')
					);
					if (publicConnection) {
						machineIdentifier = await fetchMachineIdentifier(
							publicConnection.uri,
							server.accessToken
						);
						logger.debug(
							`Fetched machineIdentifier for ${server.name}: ${machineIdentifier ?? 'unavailable'}`,
							'Onboarding'
						);
					}
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
