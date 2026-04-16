import { error, type Handle } from '@sveltejs/kit';
import { checkRateLimit, RATE_LIMIT_CONFIGS, type RateLimitConfig } from '$lib/server/ratelimit';

function getConfigForPath(path: string): RateLimitConfig {
	if (path === '/auth/plex') {
		return RATE_LIMIT_CONFIGS.authPoll;
	}

	if (path === '/auth/plex/redirect') {
		return RATE_LIMIT_CONFIGS.authRedirect;
	}

	if (path === '/auth/logout' || path === '/auth/plex/callback') {
		return RATE_LIMIT_CONFIGS.default;
	}

	if (path.startsWith('/auth/')) {
		return RATE_LIMIT_CONFIGS.auth;
	}

	if (path.startsWith('/api/')) {
		return RATE_LIMIT_CONFIGS.api;
	}

	return RATE_LIMIT_CONFIGS.default;
}

export const rateLimitHandle: Handle = async ({ event, resolve }) => {
	const path = event.url.pathname;

	if (path.startsWith('/_app/') || path.startsWith('/favicon')) {
		return resolve(event);
	}

	const ip = event.getClientAddress();
	const config = getConfigForPath(path);
	const result = checkRateLimit(ip, config);

	if (!result.allowed) {
		const isApiRequest =
			path.startsWith('/api/') ||
			(path.startsWith('/auth/') && path !== '/auth/plex/redirect') ||
			event.request.headers.get('accept')?.includes('application/json') ||
			event.request.headers.get('content-type')?.includes('application/json');

		if (isApiRequest) {
			return new Response(JSON.stringify({ error: 'Too many requests' }), {
				status: 429,
				headers: {
					'Content-Type': 'application/json',
					'Retry-After': String(result.retryAfter ?? 60),
					'X-RateLimit-Remaining': '0',
					'X-RateLimit-Reset': String(result.resetTime)
				}
			});
		}

		error(429, 'Too many requests');
	}

	const response = await resolve(event);

	response.headers.set('X-RateLimit-Remaining', String(result.remaining));
	response.headers.set('X-RateLimit-Reset', String(result.resetTime));

	return response;
};
