import { getApiConfigWithSources } from '$lib/server/admin/settings.service';
import { logger } from '$lib/server/logging';
import { getConfiguredServerMachineId } from '$lib/server/plex/server-identity.service';
import {
	type MembershipResult,
	NotServerMemberError,
	PLEX_CLIENT_ID,
	PLEX_PRODUCT,
	PLEX_VERSION,
	PlexAuthApiError,
	type PlexResource,
	PlexResourcesResponseSchema
} from './types';

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
			if (Number.isNaN(num) || num < 0 || num > 255 || segment !== num.toString()) {
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
			// .plex.direct URLs are always https:, so the implicit default port is 443.
			matchesPort = conn.port === 443;
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
	const endpoint = `${PLEX_TV_URL}/api/v2/resources?includeHttps=1`;

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

function matchesPlainHost(configuredUrl: string, server: PlexResource): boolean {
	let configuredHost: string;
	let configuredPort: string;
	let configuredProtocol: string;
	try {
		const parsed = new URL(configuredUrl);
		configuredHost = parsed.hostname.toLowerCase();
		// .plex.direct URLs are handled by matchesByIpAndPort/machineId strategies.
		if (configuredHost.endsWith('.plex.direct')) {
			return false;
		}
		configuredPort = parsed.port;
		configuredProtocol = parsed.protocol;
	} catch {
		return false;
	}

	const portsMatch = (connPort: number): boolean => {
		if (configuredPort === '') {
			if (configuredProtocol === 'https:') return connPort === 443;
			if (configuredProtocol === 'http:') return connPort === 80;
			return connPort === 32400;
		}
		return connPort.toString() === configuredPort;
	};

	// Direct address/port match against advertised connections.
	if (
		server.connections?.some(
			(conn) => conn.address.toLowerCase() === configuredHost && portsMatch(conn.port)
		)
	) {
		return true;
	}

	// Match against the IP embedded in .plex.direct URIs (Plex often advertises only those).
	if (server.connections) {
		for (const conn of server.connections) {
			if (!conn.uri.includes('.plex.direct')) continue;
			const extracted = extractPlexDirectIpAndPort(conn.uri);
			if (!extracted) continue;
			if (extracted.ip.toLowerCase() === configuredHost && portsMatch(conn.port)) {
				return true;
			}
		}
	}

	// Match against server.publicAddress when any advertised connection uses the configured port.
	if (
		server.publicAddress &&
		server.publicAddress.toLowerCase() === configuredHost &&
		server.connections?.some((c) => portsMatch(c.port))
	) {
		return true;
	}

	return false;
}

function findConfiguredServer(
	servers: PlexResource[],
	configuredUrl: string,
	configuredMachineIdFromIdentity?: string
): PlexResource | undefined {
	// Strategy 0: Match by machineIdentifier fetched from GET {PLEX_SERVER_URL}/identity.
	// This works for any reachable URL form — IP, hostname, .plex.direct, reverse proxy.
	if (configuredMachineIdFromIdentity) {
		const serverByConfiguredId = servers.find(
			(s) => s.clientIdentifier.toLowerCase() === configuredMachineIdFromIdentity.toLowerCase()
		);
		if (serverByConfiguredId) {
			logger.debug(
				`Matched server by /identity machineIdentifier: ${configuredMachineIdFromIdentity} -> ${serverByConfiguredId.name}`,
				'Membership'
			);
			return serverByConfiguredId;
		}
	}

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
	} else {
		// Strategy 3: For plain-host URLs (e.g. http://192.168.1.34:32400), match against
		// connection address/port, IPs embedded in .plex.direct URIs, or publicAddress.
		const serverByPlainHost = servers.find((s) => matchesPlainHost(configuredUrl, s));
		if (serverByPlainHost) {
			logger.debug(
				`Matched server by plain host/port: ${configuredUrl} -> ${serverByPlainHost.name}`,
				'Membership'
			);
			return serverByPlainHost;
		}
	}

	// Strategy 4: Fall back to connection URI matching
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

	// Ask the configured server for its own machineIdentifier via /identity.
	// Works for any URL form (IP, hostname, proxied, docker-dns) provided the
	// server is reachable from obzorarr with the configured PLEX_TOKEN.
	const identityResult = await getConfiguredServerMachineId();
	const configuredMachineIdFromIdentity = identityResult.machineId ?? undefined;
	logger.debug(
		`Configured server machineIdentifier: ${identityResult.machineId ?? 'null'} (source: ${
			identityResult.source
		}${identityResult.errorReason ? `, reason: ${identityResult.errorReason}` : ''})`,
		'Membership'
	);

	// Reachability gate: if /identity failed, the configured server is unreachable
	// or the PLEX_TOKEN is no longer valid. Don't admit membership via URL-only
	// matches (e.g. a .plex.direct hostname that still appears in /resources) —
	// onboarding must not proceed into a state where every subsequent Plex call
	// fails with the same issue. This preserves iter-1/2 hostname matching for
	// the intended case where /identity succeeded but /resources omits the server.
	if (!configuredMachineIdFromIdentity) {
		logger.debug('Configured server unreachable; skipping URL-based matching', 'Membership');
		return {
			isMember: false,
			isOwner: false,
			reason: 'not_reachable',
			...(identityResult.errorReason ? { identityErrorReason: identityResult.errorReason } : {})
		};
	}

	// Find the configured server
	const configuredServer = findConfiguredServer(
		servers,
		configuredUrl,
		configuredMachineIdFromIdentity
	);

	if (!configuredServer) {
		logger.debug('No matching server found for configured URL', 'Membership');
		return {
			isMember: false,
			isOwner: false,
			reason: 'not_in_resources',
			configuredMachineId: configuredMachineIdFromIdentity
		};
	}

	logger.debug(
		`Matched server: ${configuredServer.name} | isOwner: ${configuredServer.owned}`,
		'Membership'
	);

	const result: MembershipResult = {
		isMember: true,
		isOwner: configuredServer.owned,
		serverName: configuredServer.name
	};

	if (!configuredServer.owned) {
		result.reason = 'not_owner';
	}

	if (configuredMachineIdFromIdentity) {
		result.configuredMachineId = configuredMachineIdFromIdentity;
	}

	return result;
}

export async function requireServerMembership(userToken: string): Promise<MembershipResult> {
	const membership = await verifyServerMembership(userToken);

	if (!membership.isMember) {
		throw new NotServerMemberError(messageForMembershipFailure(membership));
	}

	return membership;
}

export function messageForMembershipFailure(membership: MembershipResult): string {
	switch (membership.reason) {
		case 'not_reachable': {
			const detail = membership.identityErrorReason ? ` (${membership.identityErrorReason})` : '';
			return `Obzorarr could not reach or authenticate with the configured Plex server${detail}. Check that PLEX_SERVER_URL and PLEX_TOKEN are correct and the server is online.`;
		}
		case 'not_in_resources':
			return 'The configured Plex server is not listed under your Plex.tv account. Please sign in with the server owner account.';
		default:
			return 'You are not a member of this Plex server.';
	}
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

	// Priority 1: Find public .plex.direct URL (best for external access)
	const publicPlexDirect = connections.find(
		(c) => c.uri.includes('.plex.direct') && !c.local && !c.relay
	);
	if (publicPlexDirect) {
		logger.debug(`Selected public .plex.direct connection: ${publicPlexDirect.uri}`, 'Membership');
		return publicPlexDirect.uri;
	}

	// Priority 2: Find local .plex.direct URL (for same-network access)
	const localPlexDirect = connections.find(
		(c) => c.uri.includes('.plex.direct') && c.local && !c.relay
	);
	if (localPlexDirect) {
		logger.debug(`Selected local .plex.direct connection: ${localPlexDirect.uri}`, 'Membership');
		return localPlexDirect.uri;
	}

	// Priority 3: Find public (non-local, non-relay) connection
	const publicConnection = connections.find((c) => !c.local && !c.relay);
	if (publicConnection) {
		logger.debug(`Selected public connection: ${publicConnection.uri}`, 'Membership');
		return publicConnection.uri;
	}

	// Priority 4: Find local (non-relay) connection as fallback
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

export function generatePlexDirectUrl(
	server: PlexResource,
	machineIdentifier?: string
): string | undefined {
	if (!server.publicAddress) {
		return undefined;
	}

	// Strategy 1: Use provided machineIdentifier
	let machineId: string | undefined = machineIdentifier;

	// Strategy 2: Extract from existing plex.direct connection (fallback)
	if (!machineId && server.connections) {
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
