import type { Handle } from '@sveltejs/kit';
import { logger } from '$lib/server/logging';
import { isBlockedPath, isBlockedUserAgent } from './request-filter-patterns';
import { applySecurityHeaders } from './security-headers';

export const requestFilterHandle: Handle = async ({ event, resolve }) => {
	const path = event.url.pathname;
	const userAgent = event.request.headers.get('user-agent') ?? '';
	const ip = event.getClientAddress();

	if (isBlockedPath(path)) {
		logger.debug(`Blocked scanner probe: ${path}`, 'Security', { ip });
		return applySecurityHeaders(
			new Response(JSON.stringify({ error: 'Not Found' }), {
				status: 404,
				headers: { 'Content-Type': 'application/json' }
			}),
			event.request
		);
	}

	if (isBlockedUserAgent(userAgent)) {
		logger.debug(`Blocked suspicious user-agent: ${userAgent}`, 'Security', { ip });
		return applySecurityHeaders(
			new Response(JSON.stringify({ error: 'Forbidden' }), {
				status: 403,
				headers: { 'Content-Type': 'application/json' }
			}),
			event.request
		);
	}

	return resolve(event);
};
