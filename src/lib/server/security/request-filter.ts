import type { Handle } from '@sveltejs/kit';
import { logger } from '$lib/server/logging';
import { isBlockedPath, isBlockedUserAgent } from './request-filter-patterns';

export const requestFilterHandle: Handle = async ({ event, resolve }) => {
	const path = event.url.pathname;
	const userAgent = event.request.headers.get('user-agent') ?? '';
	const ip = event.getClientAddress();

	if (isBlockedPath(path)) {
		logger.debug(`Blocked scanner probe: ${path}`, 'Security', { ip });
		return new Response('Not Found', { status: 404 });
	}

	if (isBlockedUserAgent(userAgent)) {
		logger.debug(`Blocked suspicious user-agent: ${userAgent}`, 'Security', { ip });
		return new Response('Forbidden', { status: 403 });
	}

	return resolve(event);
};
