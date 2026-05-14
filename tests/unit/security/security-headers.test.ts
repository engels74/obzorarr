import { describe, expect, it } from 'bun:test';
import { applySecurityHeaders } from '$lib/server/security/security-headers';

describe('applySecurityHeaders HSTS gate', () => {
	function freshResponse() {
		return new Response('ok');
	}

	it('always sets the non-HSTS headers regardless of protocol', () => {
		const httpResponse = applySecurityHeaders(freshResponse(), false);
		expect(httpResponse.headers.get('X-Frame-Options')).toBe('DENY');
		expect(httpResponse.headers.get('X-Content-Type-Options')).toBe('nosniff');
		expect(httpResponse.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
		expect(httpResponse.headers.get('Permissions-Policy')).toBe(
			'camera=(), microphone=(), geolocation=()'
		);
	});

	it('omits Strict-Transport-Security when isHttps is false', () => {
		// Mirrors the dogfood ISSUE-015 repro: a request that arrives over plain
		// HTTP (TRUST_PROXY=false → event.url.protocol stays 'http:') must not
		// teach the browser to upgrade — a forwarded HSTS hint on an HTTP-only
		// deployment locks every browser that ever loaded the page into a
		// permanent HTTPS upgrade for the lifetime of max-age.
		const response = applySecurityHeaders(freshResponse(), false);
		expect(response.headers.get('Strict-Transport-Security')).toBeNull();
	});

	it('sets Strict-Transport-Security when isHttps is true', () => {
		const response = applySecurityHeaders(freshResponse(), true);
		expect(response.headers.get('Strict-Transport-Security')).toBe(
			'max-age=31536000; includeSubDomains'
		);
	});
});
