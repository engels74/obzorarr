/**
 * GET /api/onboarding/servers
 *
 * Fetches user's accessible Plex servers after authentication.
 * Used during onboarding when no ENV vars are configured.
 *
 * Requires authenticated user (from session cookie).
 */

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
	// Require authenticated user
	if (!locals.user) {
		error(401, 'Authentication required');
	}

	// Get session ID from cookie
	const sessionId = cookies.get('session');
	if (!sessionId) {
		error(401, 'No session found');
	}

	try {
		// Get Plex token from session
		const plexToken = await getSessionPlexToken(sessionId);
		if (!plexToken) {
			error(401, 'Session expired or invalid');
		}

		// Fetch user's resources from Plex
		const resources = await getPlexResources(plexToken);

		// Filter to only include Plex Media Servers
		const servers = filterServerResources(resources);

		// Format response with needed fields including best connection URL
		const formattedServers = servers.map((server) => {
			// Calculate best connection URL with priority: .plex.direct > public IP > local IP
			let bestConnectionUrl = selectBestConnection(server);

			// If no .plex.direct URL found in connections, try to generate one
			if (bestConnectionUrl && !bestConnectionUrl.includes('.plex.direct')) {
				const generatedUrl = generatePlexDirectUrl(server);
				if (generatedUrl) {
					bestConnectionUrl = generatedUrl;
				}
			}

			// Map connections and potentially add generated .plex.direct connection
			const mappedConnections =
				server.connections?.map((conn) => ({
					uri: conn.uri,
					local: conn.local ?? false,
					relay: conn.relay ?? false
				})) ?? [];

			// Check if any connection already has .plex.direct
			const hasPlexDirectConnection = mappedConnections.some((conn) =>
				conn.uri.includes('.plex.direct')
			);

			// If no .plex.direct connection exists, generate and add one to the list
			if (!hasPlexDirectConnection) {
				const generatedUrl = generatePlexDirectUrl(server);
				if (generatedUrl) {
					// Add the generated SSL connection at the beginning (highest priority)
					mappedConnections.unshift({
						uri: generatedUrl,
						local: false,
						relay: false
					});
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
		});

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

		// Handle specific error types
		if (err instanceof Error && 'code' in err) {
			const authErr = err as { code: string };
			if (authErr.code === 'PLEX_API_ERROR') {
				error(502, 'Unable to connect to Plex. Please try again.');
			}
		}

		error(500, 'Failed to fetch servers');
	}
};
