import { error, json } from '@sveltejs/kit';
import { checkRateLimit } from '$lib/server/ratelimit';
import { createReverseProxyDiagnostic } from '$lib/server/security/reverse-proxy-diagnostic';
import type { RequestHandler } from './$types';

const RATE_LIMIT = {
	name: 'reverseProxyDiagnostic',
	windowMs: 60_000,
	maxRequests: 12
};

const MAX_BROWSER_ORIGIN_LENGTH = 2048;

export const GET: RequestHandler = async ({ getClientAddress, locals, request, url }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	if (!locals.user.isAdmin) {
		throw error(403, 'Admin access required');
	}

	const browserOrigin = url.searchParams.get('browserOrigin');
	if (browserOrigin && browserOrigin.length > MAX_BROWSER_ORIGIN_LENGTH) {
		throw error(400, 'browserOrigin is too long');
	}

	const rateLimit = checkRateLimit(`${locals.user.id}:${getClientAddress()}`, RATE_LIMIT);
	if (!rateLimit.allowed) {
		return json(
			{ error: 'Too many diagnostic requests' },
			{
				status: 429,
				headers: {
					'Cache-Control': 'no-store',
					'Retry-After': String(rateLimit.retryAfter ?? 60),
					'X-RateLimit-Remaining': '0',
					'X-RateLimit-Reset': String(rateLimit.resetTime)
				}
			}
		);
	}

	const diagnostic = await createReverseProxyDiagnostic({
		request,
		rawAppUrl: request.url,
		effectiveAppUrl: url,
		browserOrigin,
		sourceAddress: getClientAddress()
	});

	return json(diagnostic, {
		headers: {
			'Cache-Control': 'no-store',
			'X-RateLimit-Remaining': String(rateLimit.remaining),
			'X-RateLimit-Reset': String(rateLimit.resetTime)
		}
	});
};
