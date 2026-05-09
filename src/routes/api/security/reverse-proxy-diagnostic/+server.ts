import { json } from '@sveltejs/kit';
import { checkRateLimit } from '$lib/server/ratelimit';
import { createReverseProxyDiagnostic } from '$lib/server/security/reverse-proxy-diagnostic';
import type { RequestHandler } from './$types';

const RATE_LIMIT = {
	name: 'reverseProxyDiagnostic',
	windowMs: 60_000,
	maxRequests: 12
};

const MAX_BROWSER_ORIGIN_LENGTH = 2048;
const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' };

export const GET: RequestHandler = async ({ getClientAddress, locals, request, url }) => {
	if (!locals.user) {
		return json({ message: 'Unauthorized' }, { status: 401, headers: NO_STORE_HEADERS });
	}

	if (!locals.user.isAdmin) {
		return json({ message: 'Admin access required' }, { status: 403, headers: NO_STORE_HEADERS });
	}

	const browserOrigin = url.searchParams.get('browserOrigin');
	if (browserOrigin && browserOrigin.length > MAX_BROWSER_ORIGIN_LENGTH) {
		return json(
			{ message: 'browserOrigin is too long' },
			{ status: 400, headers: NO_STORE_HEADERS }
		);
	}

	const sourceAddress = getClientAddress();
	const rateLimit = checkRateLimit(`${locals.user.id}:${sourceAddress}`, RATE_LIMIT);
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
		sourceAddress
	});

	return json(diagnostic, {
		headers: {
			'Cache-Control': 'no-store',
			'X-RateLimit-Remaining': String(rateLimit.remaining),
			'X-RateLimit-Reset': String(rateLimit.resetTime)
		}
	});
};
