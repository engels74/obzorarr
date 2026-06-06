import { getApiConfigWithSources } from '$lib/server/admin/settings.service';
import { logger } from '$lib/server/logging';
import {
	fingerprintPlexIdentifier,
	formatPlexConnectionDiagnostic,
	formatPlexResourceDiagnostic,
	formatPlexUrlDiagnostic
} from '$lib/server/plex/diagnostics';
import { refreshConfiguredServerMachineId } from '$lib/server/plex/server-identity.service';
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

/**
 * Delay (ms) before retrying /identity after a transient failure. Exported as a
 * mutable wrapper so tests can shrink the wait without resorting to fake timers
 * (bun:test does not currently mock setTimeout — see bun.sh/docs/test/mocks).
 */
export const identityRetry = { delayMs: 250 };

const PLEX_TV_HEADERS = {
	Accept: 'application/json',
	'X-Plex-Client-Identifier': PLEX_CLIENT_ID,
	'X-Plex-Product': PLEX_PRODUCT,
	'X-Plex-Version': PLEX_VERSION
} as const;

function normalizeUrl(url: string): string {
	try {
		const parsed = new URL(url);
		if (parsed.port === '80' || parsed.port === '443') {
			parsed.port = '';
		}
		return parsed.origin.toLowerCase();
	} catch {
		return url.toLowerCase().replace(/\/+$/, '');
	}
}

export function extractPlexDirectMachineId(url: string): string | undefined {
	try {
		const parsed = new URL(url);
		const host = parsed.hostname.toLowerCase();

		if (!host.endsWith('.plex.direct')) {
			return undefined;
		}

		// Plex .plex.direct hostnames encode the server machine id as
		// {ip}.{machineId}.plex.direct.
		const parts = host.split('.');

		if (parts.length < 4) {
			return undefined;
		}

		const machineId = parts[parts.length - 3];

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

		if (!host.endsWith('.plex.direct')) {
			return undefined;
		}

		const parts = host.split('.');

		if (parts.length < 4) {
			return undefined;
		}

		// Plex encodes IPv4 octets with dashes in the first .plex.direct label.
		const ipPart = parts[0];
		if (!ipPart) {
			return undefined;
		}

		const ipSegments = ipPart.split('-');

		if (ipSegments.length !== 4) {
			return undefined;
		}

		for (const segment of ipSegments) {
			const num = parseInt(segment, 10);
			if (Number.isNaN(num) || num < 0 || num > 255 || segment !== num.toString()) {
				return undefined;
			}
		}

		const ip = ipSegments.join('.');

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
		const connectionIp = conn.address.toLowerCase();
		const matchesIp = connectionIp === configuredIp.toLowerCase();

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
	// .plex.direct IP labels can vary, so compare stable machine ids before origins.
	const machineId1 = extractPlexDirectMachineId(url1);
	const machineId2 = extractPlexDirectMachineId(url2);

	if (machineId1 && machineId2) {
		try {
			const parsed1 = new URL(url1);
			const parsed2 = new URL(url2);
			return machineId1 === machineId2 && parsed1.port === parsed2.port;
		} catch {
			return machineId1 === machineId2;
		}
	}

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
				`Matched server by /identity machineIdentifier hash=${fingerprintPlexIdentifier(
					configuredMachineIdFromIdentity
				)} serverHash=${fingerprintPlexIdentifier(serverByConfiguredId.clientIdentifier)}`,
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
				`Matched server by plex.direct machine hash=${fingerprintPlexIdentifier(
					configuredMachineId
				)} serverHash=${fingerprintPlexIdentifier(serverByMachineId.clientIdentifier)}`,
				'Membership'
			);
			return serverByMachineId;
		}

		// Strategy 2: For .plex.direct URLs, try matching by embedded IP address
		// This handles cases where the machineId in the URL differs from clientIdentifier
		const serverByIp = servers.find((s) => matchesByIpAndPort(configuredUrl, s.connections));
		if (serverByIp) {
			logger.debug(
				`Matched server by IP/port from plex.direct diagnostic=${formatPlexUrlDiagnostic(
					configuredUrl,
					'default'
				)} serverHash=${fingerprintPlexIdentifier(serverByIp.clientIdentifier)}`,
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
				`Matched server by plain host/port diagnostic=${formatPlexUrlDiagnostic(
					configuredUrl,
					'default'
				)} serverHash=${fingerprintPlexIdentifier(serverByPlainHost.clientIdentifier)}`,
				'Membership'
			);
			return serverByPlainHost;
		}
	}

	return servers.find((server) => {
		if (server.connections) {
			return server.connections.some((conn) => urlsMatch(conn.uri, configuredUrl));
		}
		return false;
	});
}

export async function verifyServerMembership(userToken: string): Promise<MembershipResult> {
	const resources = await getPlexResources(userToken);

	const servers = filterServerResources(resources);

	const apiConfig = await getApiConfigWithSources();
	const configuredUrl = apiConfig.plex.serverUrl.value;

	logger.debug(
		`Configured PLEX_SERVER_URL diagnostic=${formatPlexUrlDiagnostic(
			configuredUrl,
			apiConfig.plex.serverUrl.source
		)}`,
		'Membership'
	);
	logger.debug(`Found ${servers.length} server(s) accessible to user`, 'Membership');

	for (const [index, server] of servers.entries()) {
		logger.debug(`Server resource: ${formatPlexResourceDiagnostic(server, index)}`, 'Membership');
		if (server.connections) {
			for (const conn of server.connections) {
				logger.debug(
					`  - Connection: ${formatPlexConnectionDiagnostic(conn, 'default')}`,
					'Membership'
				);
			}
		}
	}

	// Ask the configured server for its own machineIdentifier via /identity.
	// Works for any URL form (IP, hostname, proxied, docker-dns) provided the
	// server is reachable from obzorarr with the configured PLEX_TOKEN.
	// Always do a live probe: the SQLite-backed machineId cache has no TTL, so
	// a cache-first read could pass the reachability gate below using a stale
	// id even after the token was revoked or the server went offline (e.g.
	// during a 15-minute session revalidation that does not pre-refresh).
	let identityResult = await refreshConfiguredServerMachineId();

	// Retry once on transient failures (timeouts, connection errors, 5xx). Auth
	// failures and invalid-response shapes are NOT retried — they will not heal
	// in 250ms and warrant the louder error copy.
	if (!identityResult.machineId && isTransientIdentityError(identityResult.errorReason)) {
		logger.debug(
			`Retrying /identity after transient failure: ${identityResult.errorReason}`,
			'Membership'
		);
		await new Promise((resolve) => setTimeout(resolve, identityRetry.delayMs));
		identityResult = await refreshConfiguredServerMachineId();
	}

	const configuredMachineIdFromIdentity = identityResult.machineId ?? undefined;
	logger.debug(
		`Configured server machineIdentifier hash=${fingerprintPlexIdentifier(
			identityResult.machineId
		)} source=${identityResult.source}${
			identityResult.errorReason ? ` reason=${identityResult.errorReason}` : ''
		}`,
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
		`Matched server hash=${fingerprintPlexIdentifier(configuredServer.clientIdentifier)} isOwner=${
			configuredServer.owned
		}`,
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

export function isTransientIdentityError(errorReason: string | null | undefined): boolean {
	if (!errorReason) return false;
	const reason = errorReason.toLowerCase();

	// Auth failures and invalid response shapes are NOT transient — they will
	// not heal on a 250ms retry and the user needs the misconfiguration copy.
	if (reason.includes('authentication failed') || reason.includes('invalid plex identity')) {
		return false;
	}

	// SSL/TLS errors are misconfiguration (self-signed cert without trust,
	// expired cert, hostname mismatch, wrong scheme, reverse-proxy SSL
	// misconfig) — none of these resolve on a 250ms retry, and the user
	// needs the targeted PLEX_SERVER_URL copy, not the generic transient
	// retry message. Fall through to the non-transient branch.
	if (reason.includes('ssl') || reason.includes('tls')) return false;

	// 5xx responses, timeouts, and connection errors classify as transient.
	// classifyConnectionError surfaces these as "Connection timed out",
	// "Could not connect to server", "Connection failed".
	// sanitizeConnectionError additionally surfaces "Connection was reset"
	// (ECONNRESET), "Host unreachable" (EHOSTUNREACH), "Network unreachable"
	// (ENETUNREACH), "Connection closed unexpectedly" (EPIPE), "Unable to
	// connect to server" (lowercase ECONNREFUSED that bypasses
	// classifyConnectionError's uppercase check), and "Server not found"
	// (lowercase ENOTFOUND, same fallthrough). Server-status fallthrough
	// produces "Server returned 5xx ...".
	if (reason.includes('timed out') || reason.includes('timeout')) return true;
	if (reason.includes('could not connect')) return true;
	if (reason.includes('connection failed') || reason.includes('connection error')) return true;
	if (reason.includes('connection was reset')) return true;
	if (reason.includes('connection closed unexpectedly')) return true;
	if (reason.includes('host unreachable') || reason.includes('network unreachable')) return true;
	if (reason.includes('unable to connect to server')) return true;
	if (reason.includes('server not found')) return true;

	const serverStatusMatch = reason.match(/server returned (\d{3})/);
	if (serverStatusMatch) {
		const status = Number(serverStatusMatch[1]);
		return status >= 500 && status < 600;
	}

	return false;
}

export function messageForMembershipFailure(membership: MembershipResult): string {
	switch (membership.reason) {
		case 'not_reachable': {
			const detail = membership.identityErrorReason ? ` (${membership.identityErrorReason})` : '';
			// Auth failures will not heal on their own — frame as misconfiguration,
			// not a transient blip. The detail string already names the specific cause.
			if (
				membership.identityErrorReason &&
				membership.identityErrorReason.toLowerCase().includes('authentication failed')
			) {
				return `Could not authenticate with your Plex server${detail}. Verify PLEX_TOKEN is current and still authorized for this server, then try again.`;
			}
			// Other non-transient causes (parse failure / unexpected response shape,
			// non-401/5xx HTTP errors like 404/403) won't heal on retry either —
			// frame these as misconfiguration of PLEX_SERVER_URL rather than a blip.
			if (
				membership.identityErrorReason &&
				!isTransientIdentityError(membership.identityErrorReason)
			) {
				return `Could not reach a valid Plex server at the configured URL${detail}. Verify PLEX_SERVER_URL points to your Plex server (and not a reverse proxy or wrong port), then try again.`;
			}
			return `Temporary connection issue contacting your Plex server. Please try again${detail}. If this keeps happening, verify PLEX_SERVER_URL and PLEX_TOKEN are correct and the server is online.`;
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

	// Prefer stable Plex DNS names, then public connections, then local fallbacks.
	const publicPlexDirect = connections.find(
		(c) => c.uri.includes('.plex.direct') && !c.local && !c.relay
	);
	if (publicPlexDirect) {
		logger.debug(
			`Selected public plex.direct connection: ${formatPlexConnectionDiagnostic(publicPlexDirect)}`,
			'Membership'
		);
		return publicPlexDirect.uri;
	}

	const localPlexDirect = connections.find(
		(c) => c.uri.includes('.plex.direct') && c.local && !c.relay
	);
	if (localPlexDirect) {
		logger.debug(
			`Selected local plex.direct connection: ${formatPlexConnectionDiagnostic(localPlexDirect)}`,
			'Membership'
		);
		return localPlexDirect.uri;
	}

	const publicConnection = connections.find((c) => !c.local && !c.relay);
	if (publicConnection) {
		logger.debug(
			`Selected public connection: ${formatPlexConnectionDiagnostic(publicConnection)}`,
			'Membership'
		);
		return publicConnection.uri;
	}

	const localConnection = connections.find((c) => c.local && !c.relay);
	if (localConnection) {
		logger.debug(
			`Selected local connection: ${formatPlexConnectionDiagnostic(localConnection)}`,
			'Membership'
		);
		return localConnection.uri;
	}

	const anyConnection = connections[0];
	if (anyConnection) {
		logger.debug(
			`Selected fallback connection: ${formatPlexConnectionDiagnostic(anyConnection)}`,
			'Membership'
		);
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

	let machineId: string | undefined = machineIdentifier;

	// Fall back to an advertised plex.direct connection when Plex did not provide
	// a machineIdentifier separately.
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
	logger.debug(
		`Generated plex.direct URL diagnostic=${formatPlexUrlDiagnostic(url, 'default')}`,
		'Membership'
	);

	return url;
}

export async function verifyServerOwnership(userToken: string): Promise<OwnershipResult> {
	const resources = await getPlexResources(userToken);

	const servers = filterServerResources(resources);

	logger.debug(`Found ${servers.length} server(s) accessible to user`, 'Membership');

	for (const [index, server] of servers.entries()) {
		logger.debug(`Server resource: ${formatPlexResourceDiagnostic(server, index)}`, 'Membership');
	}

	const ownedServer = servers.find((server) => server.owned);

	if (!ownedServer) {
		logger.debug('No owned servers found for user', 'Membership');
		return {
			isOwner: false
		};
	}

	let bestConnectionUrl = selectBestConnection(ownedServer);

	// Plex can omit a direct URL while still reporting publicAddress + machine id.
	if (!bestConnectionUrl?.includes('.plex.direct')) {
		const generatedUrl = generatePlexDirectUrl(ownedServer);
		if (generatedUrl) {
			bestConnectionUrl = generatedUrl;
		}
	}

	logger.debug(
		`Found owned server hash=${fingerprintPlexIdentifier(
			ownedServer.clientIdentifier
		)} bestConnection=${bestConnectionUrl ? formatPlexUrlDiagnostic(bestConnectionUrl, 'default') : 'none'}`,
		'Membership'
	);

	return {
		isOwner: true,
		server: ownedServer,
		serverName: ownedServer.name,
		bestConnectionUrl
	};
}
