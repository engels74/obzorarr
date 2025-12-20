import { PLEX_SERVER_URL } from '$env/static/private';
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
 * Check if two URLs point to the same server
 *
 * Compares origin (protocol + host + port) only.
 *
 * @param url1 - First URL
 * @param url2 - Second URL
 * @returns True if URLs point to the same server
 */
function urlsMatch(url1: string, url2: string): boolean {
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
async function getPlexResources(authToken: string): Promise<PlexResource[]> {
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
function filterServerResources(resources: PlexResource[]): PlexResource[] {
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
 * Matches servers by comparing connection URIs against PLEX_SERVER_URL.
 *
 * @param servers - Array of server resources
 * @returns The matching server resource, or undefined if not found
 */
function findConfiguredServer(servers: PlexResource[]): PlexResource | undefined {
	const configuredUrl = PLEX_SERVER_URL;

	return servers.find((server) => {
		// Check if any connection URI matches the configured URL
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

	// Find the configured server
	const configuredServer = findConfiguredServer(servers);

	if (!configuredServer) {
		return {
			isMember: false,
			isOwner: false
		};
	}

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
