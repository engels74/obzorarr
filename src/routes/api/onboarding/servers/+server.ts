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

				if (!hasPlexDirectConnection) {
					const generatedUrl = generatePlexDirectUrl(server);
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
					const generatedUrl = generatePlexDirectUrl(server);
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
