import type { Handle } from '@sveltejs/kit';
import { dev } from '$app/environment';
import {
	AppSettingsKey,
	getAppSetting,
	getCsrfConfigWithSource
} from '$lib/server/admin/settings.service';
import { logger } from '$lib/server/logging';
import { isOnboardingComplete } from '$lib/server/onboarding/status';
import { applySecurityHeaders } from './security-headers';

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
			logger.warn(
				'CSRF protection not configured - no ORIGIN set in environment or database. ' +
					'State-changing requests will be rejected once onboarding is complete ' +
					'(set CSRF_ORIGIN_SKIPPED=true in app settings to explicitly opt out).',
				'CSRF'
			);
		}
	}

	// If ORIGIN not configured anywhere
	if (!expectedOrigin) {
		if (dev) return resolve(event);

		const [onboardingDone, explicitSkip] = await Promise.all([
			isOnboardingComplete(),
			getAppSetting(AppSettingsKey.CSRF_ORIGIN_SKIPPED)
		]);

		if (onboardingDone && explicitSkip !== 'true') {
			logger.warn('CSRF rejected: no origin configured and no explicit skip', 'CSRF', {
				method,
				route: event.route.id ?? '<unmatched>'
			});
			return applySecurityHeaders(
				new Response(JSON.stringify({ error: 'CSRF protection not configured' }), {
					status: 403,
					headers: { 'Content-Type': 'application/json' }
				}),
				event.request
			);
		}

		return resolve(event);
	}

	const requestOrigin = getOriginFromRequest(event.request);

	// Missing origin header on state-changing request
	if (!requestOrigin) {
		logger.warn('CSRF check failed: missing origin header', 'CSRF', {
			method,
			route: event.route.id ?? '<unmatched>'
		});
		return applySecurityHeaders(
			new Response(JSON.stringify({ error: 'CSRF check failed: missing origin header' }), {
				status: 403,
				headers: { 'Content-Type': 'application/json' }
			}),
			event.request
		);
	}

	// Compare origins (case-insensitive per URL spec)
	if (requestOrigin.toLowerCase() !== expectedOrigin.toLowerCase()) {
		logger.warn('CSRF check failed: origin mismatch', 'CSRF', {
			method,
			route: event.route.id ?? '<unmatched>',
			expected: expectedOrigin,
			received: requestOrigin
		});
		return applySecurityHeaders(
			new Response(JSON.stringify({ error: 'CSRF check failed: origin mismatch' }), {
				status: 403,
				headers: { 'Content-Type': 'application/json' }
			}),
			event.request
		);
	}

	return resolve(event);
};
