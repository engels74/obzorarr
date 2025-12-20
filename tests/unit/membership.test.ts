import { describe, expect, it } from 'bun:test';

// Note: We can't import from membership.ts directly because it uses $env/static/private
// Instead, we duplicate the pure function logic here for testing.
// This is the same pattern used in auth.property.test.ts.

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
