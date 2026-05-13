import type { Handle, RequestEvent } from '@sveltejs/kit';
import { getTrustProxyConfigWithSource } from '$lib/server/admin/settings.service';
import { logger } from '$lib/server/logging';
import { buildForwardedUrl, parseForwardedProtoHost } from './forwarded-headers';

let proxyStartupLogged = false;

// Resolve the effective URL for a request after honouring TRUST_PROXY and the
// forwarded headers — the same decision proxyHandle uses when it mutates
// event.url. Returns the rewritten URL or null when no rewrite should occur
// (TRUST_PROXY=false, forwarded headers missing/invalid, etc.).
//
// This is the single source of truth for "did the proxy decide this is HTTPS?"
// Handlers that run before proxyHandle in the request pipeline (such as
// requestFilterHandle and rateLimitHandle, which can short-circuit with a
// Response) must consult this rather than reading x-forwarded-proto directly
// or trusting event.url.protocol — both of those would either bypass the
// TRUST_PROXY gate or return the pre-rewrite protocol.
async function resolveForwardedUrl(event: RequestEvent): Promise<URL | null> {
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

	if (!trustProxy) return null;

	return buildForwardedUrl(event.url, parseForwardedProtoHost(event.request.headers));
}

// Decide whether the effective request protocol is HTTPS, honouring
// TRUST_PROXY exactly the same way proxyHandle does. Safe to call from
// handlers that run before proxyHandle (e.g. requestFilterHandle,
// rateLimitHandle) which need the post-proxy isHttps state to set HSTS on
// early-return responses without re-introducing a spoofable direct read of
// x-forwarded-proto.
export async function isProxiedHttps(event: RequestEvent): Promise<boolean> {
	const forwardedUrl = await resolveForwardedUrl(event);
	const effectiveUrl = forwardedUrl ?? event.url;
	return effectiveUrl.protocol === 'https:';
}

// NOTE: this handler does NOT touch event.getClientAddress(); the production
// adapter (svelte-adapter-bun) resolves the client IP independently. Operators
// who need IP trust must configure their adapter / runtime separately.
export const proxyHandle: Handle = async ({ event, resolve }) => {
	const forwardedUrl = await resolveForwardedUrl(event);
	if (!forwardedUrl) return resolve(event);

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
