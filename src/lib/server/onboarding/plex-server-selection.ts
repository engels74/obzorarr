import { error } from '@sveltejs/kit';
import { filterServerResources, getPlexResources } from '$lib/server/auth/membership';
import { getSessionPlexToken } from '$lib/server/auth/session';
import type { PlexResource } from '$lib/server/auth/types';

export interface ResolveOwnedServerTokenOptions {
	sessionId: string | undefined;
	clientIdentifier: string;
}

export async function resolveOwnedServerToken({
	sessionId,
	clientIdentifier
}: ResolveOwnedServerTokenOptions): Promise<string> {
	if (!sessionId) {
		error(401, 'No session found');
	}

	const plexToken = await getSessionPlexToken(sessionId);
	if (!plexToken) {
		error(401, 'Session expired or invalid');
	}

	const resources = await getPlexResources(plexToken);
	const server = findOwnedServerByClientIdentifier(resources, clientIdentifier);
	if (!server?.accessToken) {
		error(400, 'Selected server is unavailable or not owned by this Plex account');
	}

	return server.accessToken;
}

function findOwnedServerByClientIdentifier(
	resources: PlexResource[],
	clientIdentifier: string
): PlexResource | undefined {
	return filterServerResources(resources).find(
		(server) => server.owned && server.clientIdentifier === clientIdentifier
	);
}
