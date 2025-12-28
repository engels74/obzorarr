import { getCachedServerName, setCachedServerName } from '$lib/server/admin/settings.service';
import { getApiConfigWithSources } from '$lib/server/admin/settings.service';
import { logger } from '$lib/server/logging';

const ROOT_ENDPOINT = '/';

export async function fetchServerNameFromPlex(): Promise<string | null> {
	try {
		const config = await getApiConfigWithSources();
		const serverUrl = config.plex.serverUrl.value;
		const token = config.plex.token.value;

		if (!serverUrl || !token) {
			logger.debug('Missing Plex server URL or token for server name fetch', 'ServerName');
			return null;
		}

		const response = await fetch(`${serverUrl}${ROOT_ENDPOINT}`, {
			headers: {
				Accept: 'application/json',
				'X-Plex-Token': token
			}
		});

		if (!response.ok) {
			logger.debug(
				`Failed to fetch server capabilities: ${response.status} ${response.statusText}`,
				'ServerName'
			);
			return null;
		}

		const data = (await response.json()) as { MediaContainer?: { friendlyName?: string } };
		const friendlyName = data?.MediaContainer?.friendlyName;

		if (friendlyName) {
			logger.debug(`Fetched server name: ${friendlyName}`, 'ServerName');
			return friendlyName;
		}

		return null;
	} catch (error) {
		logger.debug(
			`Error fetching server name: ${error instanceof Error ? error.message : 'Unknown error'}`,
			'ServerName'
		);
		return null;
	}
}

export async function getServerName(): Promise<string | null> {
	// Check cache first
	const cached = await getCachedServerName();
	if (cached) {
		return cached;
	}

	// Fetch from Plex and cache
	const fetched = await fetchServerNameFromPlex();
	if (fetched) {
		await setCachedServerName(fetched);
	}

	return fetched;
}

export async function refreshServerName(): Promise<string | null> {
	const fetched = await fetchServerNameFromPlex();
	if (fetched) {
		await setCachedServerName(fetched);
		logger.info(`Server name refreshed: ${fetched}`, 'ServerName');
	}
	return fetched;
}
