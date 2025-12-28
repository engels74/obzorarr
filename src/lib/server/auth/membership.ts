import {
	PlexResourcesResponseSchema,
	PlexAuthApiError,
	NotServerMemberError,
	PLEX_CLIENT_ID,
	PLEX_PRODUCT,
	PLEX_VERSION,
	type PlexResource,
	type MembershipResult
} from './types';
import { logger } from '$lib/server/logging';
import { getApiConfigWithSources } from '$lib/server/admin/settings.service';

const PLEX_TV_URL = 'https://plex.tv';

const PLEX_TV_HEADERS = {
	Accept: 'application/json',
	'X-Plex-Client-Identifier': PLEX_CLIENT_ID,
	'X-Plex-Product': PLEX_PRODUCT,
	'X-Plex-Version': PLEX_VERSION
} as const;

function normalizeUrl(url: string): string {
	try {
		const parsed = new URL(url);
		// Remove default ports
		if (parsed.port === '80' || parsed.port === '443') {
			parsed.port = '';
		}
		// Return normalized form without trailing slash
		return parsed.origin.toLowerCase();
	} catch {
		// If URL parsing fails, do basic normalization
		return url.toLowerCase().replace(/\/+$/, '');
	}
}

export function extractPlexDirectMachineId(url: string): string | undefined {
	try {
		const parsed = new URL(url);
		const host = parsed.hostname.toLowerCase();

		// Check if this is a .plex.direct domain
		if (!host.endsWith('.plex.direct')) {
			return undefined;
		}

		// Split by dots: [ip-part, machineId, 'plex', 'direct']
		const parts = host.split('.');

		// Need at least 4 parts: ip.machineId.plex.direct
		if (parts.length < 4) {
			return undefined;
		}

		// Machine ID is the second-to-last before 'plex.direct'
		// Format: {ip}.{machineId}.plex.direct
		const machineId = parts[parts.length - 3];

		// Machine ID should be a 32-character hex string
		if (machineId && /^[a-f0-9]{32}$/i.test(machineId)) {
			return machineId.toLowerCase();
		}

		return undefined;
	} catch {
		return undefined;
	}
}

export function extractPlexDirectIpAndPort(url: string): { ip: string; port: string } | undefined {
	try {
		const parsed = new URL(url);
		const host = parsed.hostname.toLowerCase();

		// Check if this is a .plex.direct domain
		if (!host.endsWith('.plex.direct')) {
			return undefined;
		}

		// Split by dots: [ip-part, machineId, 'plex', 'direct']
		const parts = host.split('.');

		// Need at least 4 parts: ip.machineId.plex.direct
		if (parts.length < 4) {
			return undefined;
		}

		// IP part is the first segment (everything before the machineId)
		const ipPart = parts[0];
		if (!ipPart) {
			return undefined;
		}

		// Validate that ipPart looks like an IPv4 address with dashes
		// Format: digits separated by exactly 3 dashes (e.g., 89-150-152-18)
		const ipSegments = ipPart.split('-');

		// IPv4 has exactly 4 octets
		if (ipSegments.length !== 4) {
			return undefined;
		}

		// Validate each segment is a valid octet (0-255)
		for (const segment of ipSegments) {
			const num = parseInt(segment, 10);
			if (isNaN(num) || num < 0 || num > 255 || segment !== num.toString()) {
				return undefined;
			}
		}

		// Convert dashes to dots to get the actual IP
		const ip = ipSegments.join('.');

		// Get port (default to empty string if not specified)
		const port = parsed.port || '';

		return { ip, port };
	} catch {
		return undefined;
	}
}

function matchesByIpAndPort(
	plexDirectUrl: string,
	connections: Array<{ address: string; port: number }> | undefined
): boolean {
	if (!connections || connections.length === 0) {
		return false;
	}

	const extracted = extractPlexDirectIpAndPort(plexDirectUrl);
	if (!extracted) {
		return false;
	}

	const { ip: configuredIp, port: configuredPort } = extracted;

	return connections.some((conn) => {
		// Compare IP addresses (case-insensitive for safety)
		const connectionIp = conn.address.toLowerCase();
		const matchesIp = connectionIp === configuredIp.toLowerCase();

		// Compare ports - handle default ports and string/number conversion
		let matchesPort = false;
		if (configuredPort === '') {
			// No port in configured URL - match typical Plex defaults
			matchesPort = conn.port === 32400 || conn.port === 443;
		} else {
			matchesPort = conn.port.toString() === configuredPort;
		}

		return matchesIp && matchesPort;
	});
}

function urlsMatch(url1: string, url2: string): boolean {
	// First, try extracting machine IDs for .plex.direct domains
	const machineId1 = extractPlexDirectMachineId(url1);
	const machineId2 = extractPlexDirectMachineId(url2);

	// If both are .plex.direct URLs with valid machine IDs, compare machine IDs and ports
	if (machineId1 && machineId2) {
		try {
			const parsed1 = new URL(url1);
			const parsed2 = new URL(url2);
			return machineId1 === machineId2 && parsed1.port === parsed2.port;
		} catch {
			return machineId1 === machineId2;
		}
	}

	// Fall back to exact origin comparison
	return normalizeUrl(url1) === normalizeUrl(url2);
}

export async function getPlexResources(authToken: string): Promise<PlexResource[]> {
	const endpoint = `${PLEX_TV_URL}/api/v2/resources`;

	try {
		const response = await fetch(endpoint, {
			method: 'GET',
			headers: {
				...PLEX_TV_HEADERS,
				'X-Plex-Token': authToken
			}
		});

		if (!response.ok) {
			throw new PlexAuthApiError(
				`Failed to get resources: ${response.status} ${response.statusText}`,
				response.status,
				endpoint
			);
		}

		const data = await response.json();
		const result = PlexResourcesResponseSchema.safeParse(data);

		if (!result.success) {
			throw new PlexAuthApiError(
				`Invalid resources response: ${result.error.message}`,
				undefined,
				endpoint,
				result.error
			);
		}

		return result.data;
	} catch (error) {
		if (error instanceof PlexAuthApiError) {
			throw error;
		}

		throw new PlexAuthApiError(
			`Failed to get resources: ${error instanceof Error ? error.message : 'Unknown error'}`,
			undefined,
			endpoint,
			error
		);
	}
}

export function filterServerResources(resources: PlexResource[]): PlexResource[] {
	return resources.filter(
		(resource) => resource.provides?.includes('server') || resource.product === 'Plex Media Server'
	);
}

function findConfiguredServer(
	servers: PlexResource[],
	configuredUrl: string
): PlexResource | undefined {
	// Strategy 1: For .plex.direct URLs, try matching by machine ID (most reliable when IDs match)
	const configuredMachineId = extractPlexDirectMachineId(configuredUrl);

	if (configuredMachineId) {
		const serverByMachineId = servers.find(
			(s) => s.clientIdentifier.toLowerCase() === configuredMachineId
		);
		if (serverByMachineId) {
			logger.debug(
				`Matched server by machineId: ${configuredMachineId} -> ${serverByMachineId.name}`,
				'Membership'
			);
			return serverByMachineId;
		}

		// Strategy 2: For .plex.direct URLs, try matching by embedded IP address
		// This handles cases where the machineId in the URL differs from clientIdentifier
		const serverByIp = servers.find((s) => matchesByIpAndPort(configuredUrl, s.connections));
		if (serverByIp) {
			const extracted = extractPlexDirectIpAndPort(configuredUrl);
			logger.debug(
				`Matched server by IP address from .plex.direct URL: ${extracted?.ip} -> ${serverByIp.name}`,
				'Membership'
			);
			return serverByIp;
		}
	}

	// Strategy 3: Fall back to connection URI matching
	return servers.find((server) => {
		if (server.connections) {
			return server.connections.some((conn) => urlsMatch(conn.uri, configuredUrl));
		}
		return false;
	});
}

export async function verifyServerMembership(userToken: string): Promise<MembershipResult> {
	// Get all resources the user has access to
	const resources = await getPlexResources(userToken);

	// Filter to only server resources
	const servers = filterServerResources(resources);

	// Get configured server URL from merged config (database takes priority over env)
	const apiConfig = await getApiConfigWithSources();
	const configuredUrl = apiConfig.plex.serverUrl.value;

	// Debug logging to help diagnose membership issues
	logger.debug(
		`Configured PLEX_SERVER_URL: ${configuredUrl} (source: ${apiConfig.plex.serverUrl.source})`,
		'Membership'
	);
	logger.debug(`Found ${servers.length} server(s) accessible to user`, 'Membership');

	for (const server of servers) {
		logger.debug(
			`Server: ${server.name} | clientIdentifier: ${server.clientIdentifier} | owned: ${server.owned}`,
			'Membership'
		);
		if (server.connections) {
			for (const conn of server.connections) {
				logger.debug(
					`  - Connection URI: ${conn.uri} | local: ${conn.local} | relay: ${conn.relay}`,
					'Membership'
				);
			}
		}
	}

	// Find the configured server
	const configuredServer = findConfiguredServer(servers, configuredUrl);

	if (!configuredServer) {
		logger.debug('No matching server found for configured URL', 'Membership');
		return {
			isMember: false,
			isOwner: false
		};
	}

	logger.debug(
		`Matched server: ${configuredServer.name} | isOwner: ${configuredServer.owned}`,
		'Membership'
	);

	return {
		isMember: true,
		isOwner: configuredServer.owned,
		serverName: configuredServer.name
	};
}

export async function requireServerMembership(userToken: string): Promise<MembershipResult> {
	const membership = await verifyServerMembership(userToken);

	if (!membership.isMember) {
		throw new NotServerMemberError();
	}

	return membership;
}

export function determineRole(isOwner: boolean): { isAdmin: boolean } {
	return { isAdmin: isOwner };
}

export interface OwnershipResult {
	isOwner: boolean;
	server?: PlexResource;
	serverName?: string;
	bestConnectionUrl?: string;
}

export function selectBestConnection(server: PlexResource): string | undefined {
	const connections = server.connections;
	if (!connections || connections.length === 0) {
		return undefined;
	}

	// Priority 1: Find .plex.direct URL (most reliable for external access)
	const plexDirectConnection = connections.find((c) => c.uri.includes('.plex.direct') && !c.relay);
	if (plexDirectConnection) {
		logger.debug(`Selected .plex.direct connection: ${plexDirectConnection.uri}`, 'Membership');
		return plexDirectConnection.uri;
	}

	// Priority 2: Find public (non-local, non-relay) connection
	const publicConnection = connections.find((c) => !c.local && !c.relay);
	if (publicConnection) {
		logger.debug(`Selected public connection: ${publicConnection.uri}`, 'Membership');
		return publicConnection.uri;
	}

	// Priority 3: Find local (non-relay) connection as fallback
	const localConnection = connections.find((c) => c.local && !c.relay);
	if (localConnection) {
		logger.debug(`Selected local connection: ${localConnection.uri}`, 'Membership');
		return localConnection.uri;
	}

	// Last resort: use any available connection
	const anyConnection = connections[0];
	if (anyConnection) {
		logger.debug(`Selected fallback connection: ${anyConnection.uri}`, 'Membership');
		return anyConnection.uri;
	}

	return undefined;
}

export function generatePlexDirectUrl(server: PlexResource): string | undefined {
	if (!server.publicAddress) {
		return undefined;
	}

	// Extract machineId from existing plex.direct connection
	let machineId: string | undefined;
	if (server.connections) {
		const plexDirectConn = server.connections.find((c) => c.uri.includes('.plex.direct'));
		if (plexDirectConn) {
			machineId = extractPlexDirectMachineId(plexDirectConn.uri);
		}
	}

	if (!machineId) {
		logger.debug('Cannot generate plex.direct URL: no machineIdentifier available', 'Membership');
		return undefined;
	}

	const ipWithDashes = server.publicAddress.replace(/\./g, '-');

	let port = 32400;
	if (server.connections) {
		const nonLocalConnection = server.connections.find((c) => !c.local && !c.relay);
		if (nonLocalConnection) {
			port = nonLocalConnection.port;
		}
	}

	const url = `https://${ipWithDashes}.${machineId}.plex.direct:${port}`;
	logger.debug(`Generated .plex.direct URL: ${url}`, 'Membership');

	return url;
}

export async function verifyServerOwnership(userToken: string): Promise<OwnershipResult> {
	// Get all resources the user has access to
	const resources = await getPlexResources(userToken);

	// Filter to only server resources
	const servers = filterServerResources(resources);

	// Debug logging
	logger.debug(`Found ${servers.length} server(s) accessible to user`, 'Membership');

	for (const server of servers) {
		logger.debug(
			`Server: ${server.name} | clientIdentifier: ${server.clientIdentifier} | owned: ${server.owned}`,
			'Membership'
		);
	}

	// Find the first server that the user owns
	const ownedServer = servers.find((server) => server.owned);

	if (!ownedServer) {
		logger.debug('No owned servers found for user', 'Membership');
		return {
			isOwner: false
		};
	}

	// Select the best connection URL
	// Priority: .plex.direct > public IP > local IP
	let bestConnectionUrl = selectBestConnection(ownedServer);

	// If no .plex.direct URL found in connections, try to generate one
	if (!bestConnectionUrl?.includes('.plex.direct')) {
		const generatedUrl = generatePlexDirectUrl(ownedServer);
		if (generatedUrl) {
			bestConnectionUrl = generatedUrl;
		}
	}

	logger.debug(
		`Found owned server: ${ownedServer.name} | bestConnection: ${bestConnectionUrl}`,
		'Membership'
	);

	return {
		isOwner: true,
		server: ownedServer,
		serverName: ownedServer.name,
		bestConnectionUrl
	};
}
