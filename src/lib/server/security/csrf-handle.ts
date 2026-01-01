import type { Handle } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { logger } from '$lib/server/logging';
import { getCsrfConfigWithSource } from '$lib/server/admin/settings.service';

const STATE_CHANGING_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

let startupLogged = false;

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
	const config = await getCsrfConfigWithSource();
	const expectedOrigin = config.origin.value || null;

	// One-time startup status log
	if (!startupLogged) {
		startupLogged = true;
		if (expectedOrigin) {
			const sourceLabel = config.origin.source === 'db' ? 'database' : 'environment';
			logger.info(`CSRF protection active (origin from ${sourceLabel})`, 'CSRF');
		} else if (!dev) {
			logger.warn('CSRF protection disabled - no ORIGIN configured in environment or database', 'CSRF');
		}
	}

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
