import type { Handle, HandleServerError } from '@sveltejs/kit';
import { redirect, isRedirect } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { dev } from '$app/environment';
import { validateSession } from '$lib/server/auth/session';
import { isDevBypassEnabled, getOrCreateDevSession } from '$lib/server/auth/dev-bypass';
import { SESSION_DURATION_MS } from '$lib/server/auth/types';
import { logger } from '$lib/server/logging';
import { requiresOnboarding, getOnboardingStep } from '$lib/server/onboarding';
import { env } from '$env/dynamic/private';
import { requestFilterHandle, rateLimitHandle, csrfHandle } from '$lib/server/security';

const securityHeadersHandle: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);

	response.headers.set('X-Frame-Options', 'DENY');
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

	const isHttps =
		event.url.protocol === 'https:' ||
		event.request.headers.get('x-forwarded-proto')?.includes('https');
	if (isHttps) {
		response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
	}

	return response;
};

const proxyHandle: Handle = async ({ event, resolve }) => {
	const proto = event.request.headers.get('x-forwarded-proto');
	const host = event.request.headers.get('x-forwarded-host');

	if (proto && host) {
		const forwardedUrl = new URL(event.url);
		forwardedUrl.protocol = proto.includes('https') ? 'https:' : 'http:';
		forwardedUrl.host = host;

		Object.defineProperty(event, 'url', {
			value: forwardedUrl,
			writable: true,
			configurable: true
		});
	}

	return resolve(event);
};

const COOKIE_DELETE_OPTIONS = {
	path: '/'
};

const COOKIE_OPTIONS = {
	path: '/',
	httpOnly: true,
	secure: !dev,
	sameSite: 'lax' as const,
	maxAge: Math.floor(SESSION_DURATION_MS / 1000)
};

let devBypassLogged = false;

const authHandle: Handle = async ({ event, resolve }) => {
	// Check for dev bypass mode (development only)
	if (isDevBypassEnabled()) {
		// Get or create dev session
		const devSessionId = await getOrCreateDevSession();

		// Set cookie if not already set
		const existingSessionId = event.cookies.get('session');
		if (existingSessionId !== devSessionId) {
			event.cookies.set('session', devSessionId, COOKIE_OPTIONS);
		}

		// Validate the dev session
		const session = await validateSession(devSessionId);

		if (session) {
			event.locals.user = {
				id: session.userId,
				plexId: session.plexId,
				username: session.username,
				isAdmin: session.isAdmin
			};

			// Log dev bypass activation once per server instance
			if (!devBypassLogged) {
				logger.warn(
					`🔓 DEV_BYPASS_AUTH is enabled - using simulated user (${session.username})`,
					'DevBypass'
				);
				devBypassLogged = true;
			}

			return resolve(event);
		}
	}

	// Normal authentication flow
	const sessionId = event.cookies.get('session');

	if (sessionId) {
		// Validate session
		const session = await validateSession(sessionId);

		if (session) {
			// Populate locals with user info
			event.locals.user = {
				id: session.userId,
				plexId: session.plexId,
				username: session.username,
				isAdmin: session.isAdmin
			};
		} else {
			// Clear invalid/expired session cookie
			event.cookies.delete('session', COOKIE_DELETE_OPTIONS);
		}
	}

	return resolve(event);
};

const onboardingHandle: Handle = async ({ event, resolve }) => {
	// Skip if dev bypass is enabled for onboarding
	if (isDevBypassEnabled() && env.DEV_BYPASS_ONBOARDING === 'true') {
		return resolve(event);
	}

	// Paths that should skip onboarding check
	const skipPaths = ['/_app', '/favicon', '/auth', '/api/onboarding', '/api/sync', '/onboarding'];

	// Skip check for excluded paths
	if (skipPaths.some((p) => event.url.pathname.startsWith(p))) {
		return resolve(event);
	}

	// Check if onboarding is required
	try {
		const needsOnboarding = await requiresOnboarding();

		if (needsOnboarding) {
			const currentStep = await getOnboardingStep();
			redirect(303, `/onboarding/${currentStep}`);
		}
	} catch (error) {
		// Re-throw redirects - they are expected behavior, not errors
		if (isRedirect(error)) {
			throw error;
		}

		// Log actual errors but don't block the request
		// This prevents onboarding check failures from breaking the app
		const errorMessage = error instanceof Error ? error.message : String(error);
		logger.error(`Onboarding check failed: ${errorMessage}`, 'OnboardingHandle');
	}

	return resolve(event);
};

const authorizationHandle: Handle = async ({ event, resolve }) => {
	// Check if this is an admin route
	if (event.url.pathname.startsWith('/admin')) {
		// Require authentication
		if (!event.locals.user) {
			redirect(303, '/');
		}

		// Require admin privileges
		if (!event.locals.user.isAdmin) {
			redirect(303, '/');
		}
	}

	return resolve(event);
};

export const handleError: HandleServerError = async ({ error, event }) => {
	// Log the full error for debugging
	logger.error(`Unexpected error: ${error}`, 'ErrorHandler', {
		path: event.url.pathname,
		method: event.request.method
	});

	// Return sanitized error message to client
	return {
		message: 'An unexpected error occurred'
	};
};

export const handle = sequence(
	requestFilterHandle,
	rateLimitHandle,
	proxyHandle,
	csrfHandle,
	securityHeadersHandle,
	authHandle,
	onboardingHandle,
	authorizationHandle
);
