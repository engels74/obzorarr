import type { Handle } from '@sveltejs/kit';
import { getTrustProxyConfigWithSource } from '$lib/server/admin/settings.service';
import { logger } from '$lib/server/logging';
import { buildForwardedUrl, parseForwardedProtoHost } from './forwarded-headers';

let proxyStartupLogged = false;

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

	const forwardedUrl = buildForwardedUrl(event.url, parseForwardedProtoHost(event.request.headers));
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
