import { createHash } from 'node:crypto';
import type { ConfigSource } from '$lib/server/admin/settings.service';

export type PlexUrlCategory =
	| 'https'
	| 'http'
	| 'plex.direct'
	| 'localhost'
	| 'private-ip'
	| 'docker/private-range'
	| 'public-domain'
	| 'public-ip'
	| 'invalid';

export interface PlexUrlDiagnostic {
	source: ConfigSource;
	scheme: 'https' | 'http' | 'other' | 'invalid';
	category: PlexUrlCategory;
	port: string;
	hostHash?: string;
	machineHash?: string;
	hasCredentials: boolean;
	hasPath: boolean;
	hasQuery: boolean;
	hasFragment: boolean;
}

interface PlexConnectionDiagnosticInput {
	uri: string;
	local?: boolean;
	relay?: boolean;
}

interface PlexResourceDiagnosticInput {
	clientIdentifier: string;
	owned: boolean;
	connections?: PlexConnectionDiagnosticInput[];
}

function shortFingerprint(value: string | null | undefined): string | undefined {
	if (!value) return undefined;
	return createHash('sha256').update(value).digest('hex').slice(0, 12);
}

function parseIpv4(hostname: string): number[] | null {
	const parts = hostname.split('.');
	if (parts.length !== 4) return null;

	const octets: number[] = [];
	for (const part of parts) {
		if (!/^\d{1,3}$/.test(part)) return null;
		const value = Number(part);
		if (!Number.isInteger(value) || value < 0 || value > 255) return null;
		octets.push(value);
	}
	return octets;
}

function isIpv6Literal(hostname: string): boolean {
	return hostname.includes(':');
}

function isPlexDirect(hostname: string): boolean {
	return hostname.toLowerCase().endsWith('.plex.direct');
}

function extractPlexDirectMachineId(hostname: string): string | undefined {
	const parts = hostname.toLowerCase().split('.');
	const machineId = parts.length >= 4 ? parts[parts.length - 3] : undefined;
	return machineId && /^[a-f0-9]{32}$/i.test(machineId) ? machineId : undefined;
}

function categoryForHost(hostname: string): PlexUrlCategory {
	const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');

	if (isPlexDirect(host)) return 'plex.direct';
	if (host === 'localhost' || host === '::1') return 'localhost';

	const ipv4 = parseIpv4(host);
	if (ipv4) {
		const [a, b] = ipv4;
		if (a === 127) return 'localhost';
		if (a === 172 && b !== undefined && b >= 16 && b <= 31) return 'docker/private-range';
		if (a === 10 || (a === 192 && b === 168) || (a === 169 && b === 254)) return 'private-ip';
		return 'public-ip';
	}

	if (isIpv6Literal(host)) {
		if (host.startsWith('fc') || host.startsWith('fd') || /^fe[89ab]/i.test(host)) {
			return 'private-ip';
		}
		return 'public-ip';
	}

	if (host.endsWith('.local') || host.endsWith('.lan') || !host.includes('.')) {
		return 'docker/private-range';
	}

	return 'public-domain';
}

function defaultPortForProtocol(protocol: string): string {
	if (protocol === 'https:') return '443';
	if (protocol === 'http:') return '80';
	return 'none';
}

export function describePlexUrl(rawUrl: string, source: ConfigSource): PlexUrlDiagnostic {
	try {
		const parsed = new URL(rawUrl);
		const scheme =
			parsed.protocol === 'https:' ? 'https' : parsed.protocol === 'http:' ? 'http' : 'other';
		const category = categoryForHost(parsed.hostname);
		return {
			source,
			scheme,
			category,
			port: parsed.port || defaultPortForProtocol(parsed.protocol),
			hostHash: shortFingerprint(parsed.hostname.toLowerCase()),
			machineHash: shortFingerprint(extractPlexDirectMachineId(parsed.hostname)),
			hasCredentials: Boolean(parsed.username || parsed.password),
			hasPath: parsed.pathname !== '/' && parsed.pathname !== '',
			hasQuery: Boolean(parsed.search),
			hasFragment: Boolean(parsed.hash)
		};
	} catch {
		return {
			source,
			scheme: 'invalid',
			category: 'invalid',
			port: 'none',
			hasCredentials: false,
			hasPath: false,
			hasQuery: false,
			hasFragment: false
		};
	}
}

export function formatPlexUrlDiagnostic(rawUrl: string, source: ConfigSource): string {
	const diagnostic = describePlexUrl(rawUrl, source);
	const parts = [
		`source=${diagnostic.source}`,
		`scheme=${diagnostic.scheme}`,
		`category=${diagnostic.category}`,
		`port=${diagnostic.port}`,
		`hostHash=${diagnostic.hostHash ?? 'none'}`
	];

	if (diagnostic.machineHash) parts.push(`machineHash=${diagnostic.machineHash}`);
	if (diagnostic.hasCredentials) parts.push('credentials=present');
	if (diagnostic.hasPath) parts.push('path=present');
	if (diagnostic.hasQuery) parts.push('query=present');
	if (diagnostic.hasFragment) parts.push('fragment=present');

	return parts.join(' ');
}

export function fingerprintPlexIdentifier(value: string | null | undefined): string {
	return shortFingerprint(value) ?? 'none';
}

export function formatPlexConnectionDiagnostic(
	connection: PlexConnectionDiagnosticInput,
	source: ConfigSource = 'default'
): string {
	return [
		formatPlexUrlDiagnostic(connection.uri, source),
		`local=${connection.local === true}`,
		`relay=${connection.relay === true}`
	].join(' ');
}

export function formatPlexResourceDiagnostic(
	server: PlexResourceDiagnosticInput,
	index: number
): string {
	return [
		`serverIndex=${index}`,
		`serverHash=${fingerprintPlexIdentifier(server.clientIdentifier)}`,
		`owned=${server.owned}`,
		`connections=${server.connections?.length ?? 0}`
	].join(' ');
}
