import type { Handle } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { logger } from '$lib/server/logging';
import { getCsrfOrigin } from '$lib/server/admin/settings.service';

const STATE_CHANGING_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

// Warn once at startup if ORIGIN env is not configured (database setting checked per-request)
if (!env.ORIGIN && !dev) {
	logger.warn('ORIGIN env not configured - CSRF protection relies on database setting', 'CSRF');
}

function getOriginFromRequest(request: Request): string | null {
	const origin = request.headers.get('origin');
	if (origin) return origin;

	const referer = request.headers.get('referer');
	if (referer) {
		try {
			return new URL(referer).origin;
		} catch {
			return null;
		}
	}

	return null;
}

export const csrfHandle: Handle = async ({ event, resolve }) => {
	const method = event.request.method;

	// Skip non-state-changing methods
	if (!STATE_CHANGING_METHODS.includes(method)) {
		return resolve(event);
	}

	// Get origin from database (priority) or environment
	const expectedOrigin = await getCsrfOrigin();

	// If ORIGIN not configured anywhere, skip check (allows unconfigured dev environments)
	if (!expectedOrigin) {
		return resolve(event);
	}

	const requestOrigin = getOriginFromRequest(event.request);

	// Missing origin header on state-changing request
	if (!requestOrigin) {
		logger.warn('CSRF check failed: missing origin header', 'CSRF', {
			method,
			path: event.url.pathname
		});
		return new Response('CSRF check failed', { status: 403 });
	}

	// Compare origins (case-insensitive per URL spec)
	if (requestOrigin.toLowerCase() !== expectedOrigin.toLowerCase()) {
		logger.warn('CSRF check failed: origin mismatch', 'CSRF', {
			method,
			path: event.url.pathname,
			expected: expectedOrigin,
			received: requestOrigin
		});
		return new Response('CSRF check failed', { status: 403 });
	}

	return resolve(event);
};
