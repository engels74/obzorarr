import type { Handle } from '@sveltejs/kit';
import { logger } from '$lib/server/logging';
import { isProxiedHttps } from './proxy-handle';
import { isBlockedPath, isBlockedUserAgent } from './request-filter-patterns';
import { applySecurityHeaders } from './security-headers';

export const requestFilterHandle: Handle = async ({ event, resolve }) => {
	const path = event.url.pathname;
	const userAgent = event.request.headers.get('user-agent') ?? '';
	const ip = event.getClientAddress();

	if (isBlockedPath(path)) {
		logger.debug(`Blocked scanner probe: ${path}`, 'Security', { ip });
		// requestFilterHandle runs before proxyHandle, so event.url.protocol is
		// still the pre-rewrite value. Consult isProxiedHttps so HSTS is applied
		// on proxied HTTPS connections, matching what securityHeadersHandle would
		// have done for non-early-return responses.
		return applySecurityHeaders(
			new Response(JSON.stringify({ error: 'Not Found' }), {
				status: 404,
				headers: { 'Content-Type': 'application/json' }
			}),
			await isProxiedHttps(event)
		);
	}

	if (isBlockedUserAgent(userAgent)) {
		logger.debug(`Blocked suspicious user-agent: ${userAgent}`, 'Security', { ip });
		return applySecurityHeaders(
			new Response(JSON.stringify({ error: 'Forbidden' }), {
				status: 403,
				headers: { 'Content-Type': 'application/json' }
			}),
			await isProxiedHttps(event)
		);
	}

	return resolve(event);
};
