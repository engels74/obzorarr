import type { Handle } from '@sveltejs/kit';
import { getTrustProxyConfigWithSource } from '$lib/server/admin/settings.service';
import { logger } from '$lib/server/logging';

let proxyStartupLogged = false;

// Take the rightmost (last-hop) value from a comma-separated forwarded header.
// Returns null if no usable value is present.
function lastHopValue(headerValue: string | null): string | null {
	if (!headerValue) return null;
	const parts = headerValue.split(',');
	const last = parts[parts.length - 1]?.trim();
	return last && last.length > 0 ? last : null;
}

function isValidForwardedProto(value: string): value is 'http' | 'https' {
	return value === 'http' || value === 'https';
}

// Reject CR/LF (response-splitting / header-injection defense), whitespace,
// and URL delimiter characters that would confuse new URL() into parsing a
// different host than intended.  Specifically:
//   @  — userinfo delimiter: "trusted@evil.com" → hostname is evil.com
//   /  — path delimiter: "evil.com/path" passes through to pathname
//   ?  — query delimiter: "evil.com?x=1" passes through to search
//   #  — fragment delimiter: "evil.com#foo" passes through to hash
// IPv6 literals like "[::1]:8443" are NOT rejected because they contain no
// delimiter characters from the banned set.
function isSafeForwardedHost(value: string): boolean {
	return value.length > 0 && !/[\r\n\s@/?#]/.test(value);
}

// NOTE: this handler does NOT touch event.getClientAddress(); the production
// adapter (svelte-adapter-bun) resolves the client IP independently. Operators
// who need IP trust must configure their adapter / runtime separately.
export const proxyHandle: Handle = async ({ event, resolve }) => {
	const config = await getTrustProxyConfigWithSource();
	const trustProxy = config.trustProxy.value === 'true';

	if (!proxyStartupLogged && trustProxy) {
		proxyStartupLogged = true;
		const sourceLabel = config.trustProxy.source === 'env' ? 'environment' : 'database';
		logger.warn(
			`Trusting reverse-proxy x-forwarded-* headers (source: ${sourceLabel}). ` +
				'The upstream proxy MUST strip inbound x-forwarded-* headers from clients ' +
				'or attackers can poison event.url.host / event.url.protocol.',
			'Proxy'
		);
	}

	if (!trustProxy) {
		return resolve(event);
	}

	const protoCandidate = lastHopValue(event.request.headers.get('x-forwarded-proto'));
	const hostCandidate = lastHopValue(event.request.headers.get('x-forwarded-host'));

	const safeProto =
		protoCandidate && isValidForwardedProto(protoCandidate.toLowerCase())
			? (protoCandidate.toLowerCase() as 'http' | 'https')
			: null;
	const safeHost = hostCandidate && isSafeForwardedHost(hostCandidate) ? hostCandidate : null;

	if (!safeProto || !safeHost) {
		return resolve(event);
	}

	// Parse the forwarded host through URL to validate syntax and split
	// hostname/port cleanly. Setting URL.host directly preserves the existing
	// port when the new value omits one — not what we want for a public URL.
	let parsedHost: URL;
	try {
		parsedHost = new URL(`${safeProto}://${safeHost}/`);
	} catch {
		return resolve(event);
	}

	const forwardedUrl = new URL(event.url);
	forwardedUrl.protocol = parsedHost.protocol;
	forwardedUrl.hostname = parsedHost.hostname;
	forwardedUrl.port = parsedHost.port;

	Object.defineProperty(event, 'url', {
		value: forwardedUrl,
		writable: true,
		configurable: true
	});

	return resolve(event);
};

// Test-only: reset the one-shot startup-log flag so tests can re-exercise it.
export function _resetProxyStartupLogged(): void {
	proxyStartupLogged = false;
}
