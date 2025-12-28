import { describe, expect, it } from 'bun:test';

// Note: We can't import from membership.ts directly because it uses $env/static/private
// Instead, we duplicate the pure function logic here for testing.
// This is the same pattern used in auth.property.test.ts.

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
function extractPlexDirectIpAndPort(url: string): { ip: string; port: string } | undefined {
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
function extractPlexDirectMachineId(url: string): string | undefined {
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
 * Unit tests for Plex .plex.direct URL Parsing
 *
 * Tests the extractPlexDirectMachineId function which extracts
 * the machine identifier from Plex's secure relay URLs.
 *
 * .plex.direct URL format:
 * https://{IP-with-dashes}.{machineIdentifier}.plex.direct:{port}
 */
describe('extractPlexDirectMachineId', () => {
	// Valid .plex.direct URLs
	describe('valid .plex.direct URLs', () => {
		it('extracts machine ID from standard .plex.direct URL', () => {
			const url = 'https://10-0-2-123.93b10b279ff8456686414add109854cd.plex.direct:32400';
			expect(extractPlexDirectMachineId(url)).toBe('93b10b279ff8456686414add109854cd');
		});

		it('extracts machine ID with different IP format', () => {
			const url = 'https://192-168-1-100.a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4.plex.direct:32400';
			expect(extractPlexDirectMachineId(url)).toBe('a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4');
		});

		it('handles uppercase machine ID', () => {
			const url = 'https://10-0-0-1.ABCDEF1234567890ABCDEF1234567890.plex.direct:32400';
			// Should normalize to lowercase
			expect(extractPlexDirectMachineId(url)).toBe('abcdef1234567890abcdef1234567890');
		});

		it('extracts machine ID from HTTP URL (non-standard but possible)', () => {
			const url = 'http://10-0-2-123.93b10b279ff8456686414add109854cd.plex.direct:32400';
			expect(extractPlexDirectMachineId(url)).toBe('93b10b279ff8456686414add109854cd');
		});

		it('extracts machine ID with different port', () => {
			const url = 'https://10-0-2-123.93b10b279ff8456686414add109854cd.plex.direct:8443';
			expect(extractPlexDirectMachineId(url)).toBe('93b10b279ff8456686414add109854cd');
		});

		it('handles mixed case hostname', () => {
			const url = 'https://10-0-2-123.93B10B279FF8456686414ADD109854CD.Plex.Direct:32400';
			expect(extractPlexDirectMachineId(url)).toBe('93b10b279ff8456686414add109854cd');
		});
	});

	// Non-.plex.direct URLs
	describe('non-.plex.direct URLs', () => {
		it('returns undefined for localhost URL', () => {
			expect(extractPlexDirectMachineId('http://localhost:32400')).toBeUndefined();
		});

		it('returns undefined for local IP URL', () => {
			expect(extractPlexDirectMachineId('http://192.168.1.100:32400')).toBeUndefined();
		});

		it('returns undefined for custom domain', () => {
			expect(extractPlexDirectMachineId('https://plex.example.com:32400')).toBeUndefined();
		});

		it('returns undefined for plain plex.direct without subdomain', () => {
			expect(extractPlexDirectMachineId('https://plex.direct:32400')).toBeUndefined();
		});
	});

	// Invalid .plex.direct formats
	describe('invalid .plex.direct formats', () => {
		it('returns undefined for short machine ID (not 32 chars)', () => {
			const url = 'https://10-0-2-123.abc123.plex.direct:32400';
			expect(extractPlexDirectMachineId(url)).toBeUndefined();
		});

		it('returns undefined for machine ID with invalid characters', () => {
			const url = 'https://10-0-2-123.ghijklmnopqrstuvwxyz123456789012.plex.direct:32400';
			expect(extractPlexDirectMachineId(url)).toBeUndefined();
		});

		it('returns undefined for too few subdomain parts', () => {
			const url = 'https://93b10b279ff8456686414add109854cd.plex.direct:32400';
			expect(extractPlexDirectMachineId(url)).toBeUndefined();
		});

		it('returns undefined for invalid URL', () => {
			expect(extractPlexDirectMachineId('not-a-url')).toBeUndefined();
		});

		it('returns undefined for empty string', () => {
			expect(extractPlexDirectMachineId('')).toBeUndefined();
		});
	});
});

/**
 * Tests for URL matching behavior with .plex.direct URLs
 *
 * These tests verify that the urlsMatch function correctly handles
 * .plex.direct URLs by comparing machine identifiers instead of
 * requiring exact URL matches.
 *
 * Note: urlsMatch is a private function, so we test it indirectly
 * through the behavior of extractPlexDirectMachineId and document
 * the expected matching logic.
 */
describe('.plex.direct URL Matching Logic', () => {
	describe('same server detection', () => {
		it('same machine ID with different IPs should match', () => {
			// Both URLs have the same machine ID: 93b10b279ff8456686414add109854cd
			const url1 = 'https://10-0-2-123.93b10b279ff8456686414add109854cd.plex.direct:32400';
			const url2 = 'https://192-168-1-100.93b10b279ff8456686414add109854cd.plex.direct:32400';

			const id1 = extractPlexDirectMachineId(url1);
			const id2 = extractPlexDirectMachineId(url2);

			expect(id1).toBe(id2);
		});
	});

	describe('different server detection', () => {
		it('different machine IDs should not match', () => {
			const url1 = 'https://10-0-2-123.93b10b279ff8456686414add109854cd.plex.direct:32400';
			const url2 = 'https://10-0-2-123.aaaabbbbccccddddeeeeffff00001111.plex.direct:32400';

			const id1 = extractPlexDirectMachineId(url1);
			const id2 = extractPlexDirectMachineId(url2);

			expect(id1).not.toBe(id2);
		});
	});

	describe('port sensitivity', () => {
		it('same machine ID but different ports should be detectable', () => {
			const url1 = 'https://10-0-2-123.93b10b279ff8456686414add109854cd.plex.direct:32400';
			const url2 = 'https://10-0-2-123.93b10b279ff8456686414add109854cd.plex.direct:8443';

			const id1 = extractPlexDirectMachineId(url1);
			const id2 = extractPlexDirectMachineId(url2);

			// Machine IDs are the same, but urlsMatch should check ports separately
			expect(id1).toBe(id2);
		});
	});
});

/**
 * Unit tests for extractPlexDirectIpAndPort
 *
 * Tests the extraction of IP address and port from .plex.direct URLs.
 * This is used for matching servers when the machineId doesn't match clientIdentifier.
 */
describe('extractPlexDirectIpAndPort', () => {
	describe('valid .plex.direct URLs', () => {
		it('extracts IP and port from standard .plex.direct URL', () => {
			const url = 'https://89-150-152-18.241d8bc0ff5b413799df831a83ba172d.plex.direct:32400';
			const result = extractPlexDirectIpAndPort(url);
			expect(result).toEqual({ ip: '89.150.152.18', port: '32400' });
		});

		it('extracts IP and port with different IP format', () => {
			const url = 'https://192-168-1-100.a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4.plex.direct:32400';
			const result = extractPlexDirectIpAndPort(url);
			expect(result).toEqual({ ip: '192.168.1.100', port: '32400' });
		});

		it('handles non-standard port', () => {
			const url = 'https://10-0-2-123.93b10b279ff8456686414add109854cd.plex.direct:8443';
			const result = extractPlexDirectIpAndPort(url);
			expect(result).toEqual({ ip: '10.0.2.123', port: '8443' });
		});

		it('handles HTTP protocol', () => {
			const url = 'http://10-0-2-123.93b10b279ff8456686414add109854cd.plex.direct:32400';
			const result = extractPlexDirectIpAndPort(url);
			expect(result).toEqual({ ip: '10.0.2.123', port: '32400' });
		});

		it('handles URL without explicit port', () => {
			const url = 'https://10-0-2-123.93b10b279ff8456686414add109854cd.plex.direct';
			const result = extractPlexDirectIpAndPort(url);
			expect(result).toEqual({ ip: '10.0.2.123', port: '' });
		});

		it('handles zero octet', () => {
			const url = 'https://0-0-0-0.93b10b279ff8456686414add109854cd.plex.direct:32400';
			const result = extractPlexDirectIpAndPort(url);
			expect(result).toEqual({ ip: '0.0.0.0', port: '32400' });
		});

		it('handles 255 octet', () => {
			const url = 'https://255-255-255-255.93b10b279ff8456686414add109854cd.plex.direct:32400';
			const result = extractPlexDirectIpAndPort(url);
			expect(result).toEqual({ ip: '255.255.255.255', port: '32400' });
		});
	});

	describe('invalid inputs', () => {
		it('returns undefined for non-.plex.direct URLs', () => {
			expect(extractPlexDirectIpAndPort('http://localhost:32400')).toBeUndefined();
			expect(extractPlexDirectIpAndPort('http://192.168.1.100:32400')).toBeUndefined();
			expect(extractPlexDirectIpAndPort('https://plex.example.com:32400')).toBeUndefined();
		});

		it('returns undefined for invalid IP format (too few octets)', () => {
			const url = 'https://10-0-2.93b10b279ff8456686414add109854cd.plex.direct:32400';
			expect(extractPlexDirectIpAndPort(url)).toBeUndefined();
		});

		it('returns undefined for invalid IP format (too many octets)', () => {
			const url = 'https://10-0-2-123-45.93b10b279ff8456686414add109854cd.plex.direct:32400';
			expect(extractPlexDirectIpAndPort(url)).toBeUndefined();
		});

		it('returns undefined for invalid octet values (> 255)', () => {
			const url = 'https://10-0-256-123.93b10b279ff8456686414add109854cd.plex.direct:32400';
			expect(extractPlexDirectIpAndPort(url)).toBeUndefined();
		});

		it('returns undefined for negative octet values', () => {
			const url = 'https://10-0--1-123.93b10b279ff8456686414add109854cd.plex.direct:32400';
			expect(extractPlexDirectIpAndPort(url)).toBeUndefined();
		});

		it('returns undefined for non-numeric octets', () => {
			const url = 'https://10-abc-2-123.93b10b279ff8456686414add109854cd.plex.direct:32400';
			expect(extractPlexDirectIpAndPort(url)).toBeUndefined();
		});

		it('returns undefined for leading zeros in octets', () => {
			// Leading zeros are invalid (e.g., 010 !== 10)
			const url = 'https://010-0-2-123.93b10b279ff8456686414add109854cd.plex.direct:32400';
			expect(extractPlexDirectIpAndPort(url)).toBeUndefined();
		});

		it('returns undefined for empty string', () => {
			expect(extractPlexDirectIpAndPort('')).toBeUndefined();
		});

		it('returns undefined for invalid URL', () => {
			expect(extractPlexDirectIpAndPort('not-a-url')).toBeUndefined();
		});

		it('returns undefined for too few subdomain parts', () => {
			const url = 'https://93b10b279ff8456686414add109854cd.plex.direct:32400';
			expect(extractPlexDirectIpAndPort(url)).toBeUndefined();
		});
	});
});

/**
 * Tests for IP and Port Matching scenario from bug report
 *
 * Verifies that the IP extraction correctly handles the real-world
 * scenario where a .plex.direct URL needs to match against connection URIs.
 */
describe('IP and Port Matching for .plex.direct URLs', () => {
	it('matches .plex.direct URL to connection by IP and port', () => {
		// Simulates the real-world scenario from the bug report
		const plexDirectUrl =
			'https://89-150-152-18.241d8bc0ff5b413799df831a83ba172d.plex.direct:32400';

		const extracted = extractPlexDirectIpAndPort(plexDirectUrl);
		expect(extracted).toEqual({ ip: '89.150.152.18', port: '32400' });

		// This IP should match one of the connections
		const connections = [
			{ address: '172.26.0.2', port: 32400, uri: 'http://172.26.0.2:32400' },
			{ address: '172.20.0.2', port: 32400, uri: 'http://172.20.0.2:32400' },
			{ address: '89.150.152.18', port: 32400, uri: 'http://89.150.152.18:32400' }
		];

		// The extracted IP should match the third connection
		const matchingConnection = connections.find(
			(conn) => conn.address === extracted?.ip && conn.port.toString() === extracted?.port
		);
		expect(matchingConnection).toBeDefined();
		expect(matchingConnection?.address).toBe('89.150.152.18');
	});

	it('does not match when IP differs', () => {
		const plexDirectUrl =
			'https://89-150-152-18.241d8bc0ff5b413799df831a83ba172d.plex.direct:32400';

		const extracted = extractPlexDirectIpAndPort(plexDirectUrl);

		const connections = [
			{ address: '172.26.0.2', port: 32400, uri: 'http://172.26.0.2:32400' },
			{ address: '172.20.0.2', port: 32400, uri: 'http://172.20.0.2:32400' }
			// Note: 89.150.152.18 is not in the connections
		];

		const matchingConnection = connections.find(
			(conn) => conn.address === extracted?.ip && conn.port.toString() === extracted?.port
		);
		expect(matchingConnection).toBeUndefined();
	});

	it('does not match when port differs', () => {
		const plexDirectUrl =
			'https://89-150-152-18.241d8bc0ff5b413799df831a83ba172d.plex.direct:32400';

		const extracted = extractPlexDirectIpAndPort(plexDirectUrl);

		const connections = [
			{ address: '89.150.152.18', port: 8443, uri: 'http://89.150.152.18:8443' }
		];

		const matchingConnection = connections.find(
			(conn) => conn.address === extracted?.ip && conn.port.toString() === extracted?.port
		);
		expect(matchingConnection).toBeUndefined();
	});
});

/**
 * Generate a plex.direct URL using the machineIdentifier from existing connections.
 * This duplicates the logic from membership.ts for testing.
 */
interface PlexConnection {
	uri: string;
	local?: boolean;
	relay?: boolean;
	port: number;
}

interface PlexResourceLike {
	publicAddress?: string;
	connections?: PlexConnection[];
}

function generatePlexDirectUrl(
	server: PlexResourceLike,
	machineIdentifier?: string
): string | undefined {
	if (!server.publicAddress) {
		return undefined;
	}

	let machineId: string | undefined = machineIdentifier;

	if (!machineId && server.connections) {
		const plexDirectConn = server.connections.find((c) => c.uri.includes('.plex.direct'));
		if (plexDirectConn) {
			machineId = extractPlexDirectMachineId(plexDirectConn.uri);
		}
	}

	if (!machineId) {
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

	return `https://${ipWithDashes}.${machineId}.plex.direct:${port}`;
}

describe('generatePlexDirectUrl', () => {
	describe('with provided machineIdentifier', () => {
		it('uses provided machineIdentifier over extracting from connections', () => {
			const server: PlexResourceLike = {
				publicAddress: '89.150.152.18',
				connections: [
					{ uri: 'http://89.150.152.18:32400', local: false, relay: false, port: 32400 }
				]
			};

			const result = generatePlexDirectUrl(server, 'abcdef1234567890abcdef1234567890');
			expect(result).toBe(
				'https://89-150-152-18.abcdef1234567890abcdef1234567890.plex.direct:32400'
			);
		});

		it('uses provided machineIdentifier when no plex.direct connection exists', () => {
			const server: PlexResourceLike = {
				publicAddress: '192.168.1.100',
				connections: [
					{ uri: 'http://192.168.1.100:32400', local: true, relay: false, port: 32400 },
					{ uri: 'http://10.0.0.1:32400', local: false, relay: false, port: 8443 }
				]
			};

			const result = generatePlexDirectUrl(server, '241d8bc0ff5b413799df831a83ba172d');
			expect(result).toBe(
				'https://192-168-1-100.241d8bc0ff5b413799df831a83ba172d.plex.direct:8443'
			);
		});

		it('uses provided machineIdentifier even when connections is empty', () => {
			const server: PlexResourceLike = {
				publicAddress: '10.0.0.1',
				connections: []
			};

			const result = generatePlexDirectUrl(server, 'fedcba0987654321fedcba0987654321');
			expect(result).toBe(
				'https://10-0-0-1.fedcba0987654321fedcba0987654321.plex.direct:32400'
			);
		});
	});

	describe('valid generation', () => {
		it('generates URL with 32-char machineId from existing plex.direct connection', () => {
			const server: PlexResourceLike = {
				publicAddress: '89.150.152.18',
				connections: [
					{
						uri: 'https://10-0-2-123.93b10b279ff8456686414add109854cd.plex.direct:32400',
						local: false,
						relay: false,
						port: 32400
					}
				]
			};

			const result = generatePlexDirectUrl(server);
			expect(result).toBe(
				'https://89-150-152-18.93b10b279ff8456686414add109854cd.plex.direct:32400'
			);
		});

		it('uses port from non-local non-relay connection', () => {
			const server: PlexResourceLike = {
				publicAddress: '192.168.1.100',
				connections: [
					{
						uri: 'https://10-0-2-123.a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4.plex.direct:8443',
						local: false,
						relay: false,
						port: 8443
					}
				]
			};

			const result = generatePlexDirectUrl(server);
			expect(result).toBe(
				'https://192-168-1-100.a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4.plex.direct:8443'
			);
		});

		it('extracts machineId from any plex.direct connection', () => {
			const server: PlexResourceLike = {
				publicAddress: '10.0.0.1',
				connections: [
					{ uri: 'http://192.168.1.100:32400', local: true, relay: false, port: 32400 },
					{
						uri: 'https://64-71-188-222.abcdef1234567890abcdef1234567890.plex.direct:32403',
						local: false,
						relay: false,
						port: 32403
					}
				]
			};

			const result = generatePlexDirectUrl(server);
			expect(result).toBe(
				'https://10-0-0-1.abcdef1234567890abcdef1234567890.plex.direct:32403'
			);
		});
	});

	describe('returns undefined', () => {
		it('returns undefined when no publicAddress', () => {
			const server: PlexResourceLike = {
				connections: [
					{
						uri: 'https://10-0-2-123.93b10b279ff8456686414add109854cd.plex.direct:32400',
						local: false,
						relay: false,
						port: 32400
					}
				]
			};

			expect(generatePlexDirectUrl(server)).toBeUndefined();
		});

		it('returns undefined when no plex.direct connection exists', () => {
			const server: PlexResourceLike = {
				publicAddress: '89.150.152.18',
				connections: [
					{ uri: 'http://192.168.1.100:32400', local: true, relay: false, port: 32400 },
					{ uri: 'http://89.150.152.18:32400', local: false, relay: false, port: 32400 }
				]
			};

			expect(generatePlexDirectUrl(server)).toBeUndefined();
		});

		it('returns undefined when connections array is empty', () => {
			const server: PlexResourceLike = {
				publicAddress: '89.150.152.18',
				connections: []
			};

			expect(generatePlexDirectUrl(server)).toBeUndefined();
		});

		it('returns undefined when connections is undefined', () => {
			const server: PlexResourceLike = {
				publicAddress: '89.150.152.18'
			};

			expect(generatePlexDirectUrl(server)).toBeUndefined();
		});

		it('returns undefined when plex.direct URL has invalid machineId', () => {
			const server: PlexResourceLike = {
				publicAddress: '89.150.152.18',
				connections: [
					{
						// machineId is too short (not 32 chars)
						uri: 'https://10-0-2-123.abc123.plex.direct:32400',
						local: false,
						relay: false,
						port: 32400
					}
				]
			};

			expect(generatePlexDirectUrl(server)).toBeUndefined();
		});
	});
});
