import { getCachedServerName, setCachedServerName } from '$lib/server/admin/settings.service';
import { getApiConfigWithSources } from '$lib/server/admin/settings.service';
import { logger } from '$lib/server/logging';

/**
 * Server Name Service
 *
 * Fetches and caches the Plex server's friendly name for use in
 * wrapped presentation messaging.
 *
 * @module plex/server-name
 */

// =============================================================================
// Constants
// =============================================================================

/**
 * Plex identity endpoint
 */
const IDENTITY_ENDPOINT = '/identity';

// =============================================================================
// Server Name Functions
// =============================================================================

/**
 * Fetch the server name directly from Plex API
 *
 * Makes a request to the /identity endpoint to get the server's
 * friendlyName. Does not cache the result.
 *
 * @returns The server's friendly name or null if unavailable
 */
export async function fetchServerNameFromPlex(): Promise<string | null> {
	try {
		const config = await getApiConfigWithSources();
		const serverUrl = config.plex.serverUrl.value;
		const token = config.plex.token.value;

		if (!serverUrl || !token) {
			logger.debug('Missing Plex server URL or token for server name fetch', 'ServerName');
			return null;
		}

		const response = await fetch(`${serverUrl}${IDENTITY_ENDPOINT}`, {
			headers: {
				Accept: 'application/json',
				'X-Plex-Token': token
			}
		});

		if (!response.ok) {
			logger.debug(
				`Failed to fetch server identity: ${response.status} ${response.statusText}`,
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

/**
 * Get the server name, using cache if available
 *
 * First checks the database cache, then fetches from Plex if not cached.
 * Caches the result for future calls.
 *
 * @returns The server's friendly name or null if unavailable
 */
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

/**
 * Refresh the server name from Plex
 *
 * Forces a fresh fetch from Plex API and updates the cache.
 * Use this after testing Plex connection or when the server name may have changed.
 *
 * @returns The server's friendly name or null if unavailable
 */
export async function refreshServerName(): Promise<string | null> {
	const fetched = await fetchServerNameFromPlex();
	if (fetched) {
		await setCachedServerName(fetched);
		logger.info(`Server name refreshed: ${fetched}`, 'ServerName');
	}
	return fetched;
}
