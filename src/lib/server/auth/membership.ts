import { env } from '$env/dynamic/private';
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

/**
 * Server Membership Verification Module
 *
 * Verifies that a user is a member of the configured Plex server
 * and determines if they are the server owner (admin).
 *
 * Implements Requirements 1.2, 1.3, 1.4, 1.5:
 * - Verify user is a member of configured Plex server
 * - Grant admin privileges if server owner
 * - Grant member privileges if server member but not owner
 * - Deny access if not a member of configured Plex server
 */

// =============================================================================
// Constants
// =============================================================================

/**
 * Plex.tv API base URL
 */
const PLEX_TV_URL = 'https://plex.tv';

/**
 * Headers for Plex.tv API requests
 */
const PLEX_TV_HEADERS = {
	Accept: 'application/json',
	'X-Plex-Client-Identifier': PLEX_CLIENT_ID,
	'X-Plex-Product': PLEX_PRODUCT,
	'X-Plex-Version': PLEX_VERSION
} as const;

// =============================================================================
// Server URL Normalization
// =============================================================================

/**
 * Normalize a URL for comparison
 *
 * Removes trailing slashes and normalizes protocol/host.
 *
 * @param url - URL to normalize
 * @returns Normalized URL string
 */
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

/**
 * Extract the machine identifier from a .plex.direct URL
 *
 * .plex.direct URLs follow the pattern:
 * https://{IP-with-dashes}.{machineIdentifier}.plex.direct:{port}
 *
 * The machine identifier is a 32-character hex string that uniquely
 * identifies a Plex server and never changes, unlike the IP portion.
 *
 * @param url - URL to extract from
 * @returns Machine identifier if URL is a .plex.direct URL, undefined otherwise
 */
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

/**
 * Extract the IP address and port from a .plex.direct URL
 *
 * .plex.direct URLs follow the pattern:
 * https://{IP-with-dashes}.{machineIdentifier}.plex.direct:{port}
 *
 * The IP portion uses dashes instead of dots (e.g., 89-150-152-18 for 89.150.152.18)
 *
 * @param url - URL to extract from
 * @returns Object with ip and port if URL is a valid .plex.direct URL, undefined otherwise
 */
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

/**
 * Check if a .plex.direct URL matches a server's connection by IP and port
 *
 * Compares the IP address embedded in the .plex.direct URL against
 * the address in each of the server's connection URIs. This is useful
 * when the machineId embedded in the URL doesn't match the server's
 * clientIdentifier.
 *
 * @param plexDirectUrl - The configured .plex.direct URL
 * @param connections - Array of connection objects from the server resource
 * @returns True if any connection matches by IP and port
 */
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

/**
 * Check if two URLs point to the same server
 *
 * For .plex.direct domains, compares the machine identifier portion
 * since the IP portion can vary based on network conditions.
 * For other domains, compares origin exactly.
 *
 * @param url1 - First URL
 * @param url2 - Second URL
 * @returns True if URLs point to the same server
 */
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

// =============================================================================
// Resource Fetching
// =============================================================================

/**
 * Get all Plex resources (servers) the user has access to
 *
 * @param authToken - User's Plex auth token
 * @returns Array of Plex resources
 * @throws PlexAuthApiError on network or API errors
 */
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

/**
 * Filter resources to only include Plex Media Servers
 *
 * @param resources - All Plex resources
 * @returns Only server resources
 */
export function filterServerResources(resources: PlexResource[]): PlexResource[] {
	return resources.filter(
		(resource) => resource.provides?.includes('server') || resource.product === 'Plex Media Server'
	);
}

// =============================================================================
// Membership Verification
// =============================================================================

/**
 * Find the configured server in the user's accessible servers
 *
 * Matches servers using multiple strategies:
 * 1. For .plex.direct URLs: Extract machine ID and match against clientIdentifier
 * 2. For .plex.direct URLs: Extract embedded IP and match against connection addresses
 * 3. Fall back to comparing connection URIs against PLEX_SERVER_URL
 *
 * @param servers - Array of server resources
 * @returns The matching server resource, or undefined if not found
 */
function findConfiguredServer(servers: PlexResource[]): PlexResource | undefined {
	const configuredUrl = env.PLEX_SERVER_URL ?? '';

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

/**
 * Verify if a user is a member of the configured Plex server
 *
 * Uses the user's auth token to query their accessible servers
 * and checks if the configured server is among them.
 *
 * @param userToken - The user's Plex auth token
 * @returns Membership result with isMember, isOwner, and serverName
 * @throws PlexAuthApiError on network or API errors
 *
 * @example
 * ```typescript
 * const membership = await verifyServerMembership(authToken);
 * if (!membership.isMember) {
 *   throw new NotServerMemberError();
 * }
 * const isAdmin = membership.isOwner;
 * ```
 */
export async function verifyServerMembership(userToken: string): Promise<MembershipResult> {
	// Get all resources the user has access to
	const resources = await getPlexResources(userToken);

	// Filter to only server resources
	const servers = filterServerResources(resources);

	// Debug logging to help diagnose membership issues
	logger.debug(`Configured PLEX_SERVER_URL: ${env.PLEX_SERVER_URL ?? ''}`, 'Membership');
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
	const configuredServer = findConfiguredServer(servers);

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

/**
 * Verify server membership and throw if not a member
 *
 * Convenience function that throws NotServerMemberError if
 * the user is not a member of the configured server.
 *
 * @param userToken - The user's Plex auth token
 * @returns Membership result (only if user is a member)
 * @throws NotServerMemberError if user is not a server member
 * @throws PlexAuthApiError on network or API errors
 *
 * @example
 * ```typescript
 * const membership = await requireServerMembership(authToken);
 * // User is guaranteed to be a member at this point
 * const isAdmin = membership.isOwner;
 * ```
 */
export async function requireServerMembership(userToken: string): Promise<MembershipResult> {
	const membership = await verifyServerMembership(userToken);

	if (!membership.isMember) {
		throw new NotServerMemberError();
	}

	return membership;
}

/**
 * Determine the user's role based on membership
 *
 * Pure function for property testing.
 *
 * @param isOwner - Whether the user owns the server
 * @returns Object with isAdmin flag
 */
export function determineRole(isOwner: boolean): { isAdmin: boolean } {
	return { isAdmin: isOwner };
}
