import type { Handle } from '@sveltejs/kit';
import { checkRateLimit, RATE_LIMIT_CONFIGS, type RateLimitConfig } from '$lib/server/ratelimit';

function getConfigForPath(path: string): RateLimitConfig {
	if (path.startsWith('/_app/') || path.startsWith('/favicon')) {
		return { windowMs: 60_000, maxRequests: 1000 };
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

	const response = await resolve(event);
	const headers = new Headers(response.headers);
	headers.set('X-RateLimit-Remaining', String(result.remaining));
	headers.set('X-RateLimit-Reset', String(result.resetTime));

	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers
	});
};
