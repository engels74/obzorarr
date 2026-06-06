import { error, json } from '@sveltejs/kit';
import {
	filterServerResources,
	generatePlexDirectUrl,
	getPlexResources,
	selectBestConnection
} from '$lib/server/auth/membership';
import { getSessionPlexToken } from '$lib/server/auth/session';
import { logger } from '$lib/server/logging';
import { OnboardingClaimRequiredError, requireActiveOnboardingClaim } from '$lib/server/onboarding';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ cookies, locals, url }) => {
	try {
		await requireActiveOnboardingClaim(cookies, { requestUrl: url });
	} catch (err) {
		if (err instanceof OnboardingClaimRequiredError) {
			error(403, err.message);
		}
		throw err;
	}
	if (!locals.user) {
		error(401, 'Authentication required');
	}
	if (!locals.user.isAdmin) {
		error(403, 'Only server owners can configure Obzorarr');
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
				// Prefer connection choices that are useful to admins: public plex.direct
				// URLs for external access, plus local HTTP URLs for same-network users.
				// Local plex.direct URLs are skipped because they expose confusing Docker
				// IP hashes rather than a stable local address.
				const filteredConnections =
					server.connections?.flatMap((conn) => {
						const isPlexDirect = conn.uri.includes('.plex.direct');
						const isLocal = conn.local ?? false;
						const isRelay = conn.relay ?? false;

						// Keep public plex.direct URL (best for external access)
						if (isPlexDirect && !isLocal && !isRelay) {
							return [{ uri: conn.uri, local: false, relay: false }];
						}

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
