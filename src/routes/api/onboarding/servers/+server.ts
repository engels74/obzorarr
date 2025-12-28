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
				// Filter connections for cleaner UX:
				// 1. Public plex.direct URLs (recommended for external access)
				// 2. Local HTTP URLs (for same-network users)
				// Exclude: local plex.direct URLs (confusing Docker IPs with long hashes)
				const filteredConnections =
					server.connections?.flatMap((conn) => {
						const isPlexDirect = conn.uri.includes('.plex.direct');
						const isLocal = conn.local ?? false;
						const isRelay = conn.relay ?? false;

						// Keep public plex.direct URL (best for external access)
						if (isPlexDirect && !isLocal && !isRelay) {
							return [{ uri: conn.uri, local: false, relay: false }];
						}

						// For local connections, construct HTTP URL from address/port
						// (skip plex.direct local URLs as they're confusing Docker IPs)
						if (isLocal && !isRelay) {
							const httpUri = `http://${conn.address}:${conn.port}`;
							return [{ uri: httpUri, local: true, relay: false }];
						}

						return [];
					}) ?? [];

				const hasPublicPlexDirect = filteredConnections.some(
					(conn) => conn.uri.includes('.plex.direct') && !conn.local
				);

				if (!hasPublicPlexDirect) {
					const generatedUrl = generatePlexDirectUrl(server);
					if (generatedUrl) {
						filteredConnections.unshift({
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
					connections: filteredConnections
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
