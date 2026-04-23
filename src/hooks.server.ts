import type { Handle, HandleServerError } from '@sveltejs/kit';
import { isRedirect } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { clearConflictingDbSettings } from '$lib/server/admin/settings.service';
import { getOrCreateDevSession, isDevBypassEnabled } from '$lib/server/auth/dev-bypass';
import {
	needsRevalidation,
	revalidateMembership,
	shouldRevalidateSession
} from '$lib/server/auth/revalidation';
import {
	invalidateSession,
	invalidateUserSessions,
	updateUserAndSessionAdmin,
	validateSession
} from '$lib/server/auth/session';
import { SESSION_DURATION_MS } from '$lib/server/auth/types';
import { logger } from '$lib/server/logging';
import { getOnboardingStep, requiresOnboarding } from '$lib/server/onboarding';
import {
	applySecurityHeaders,
	csrfHandle,
	proxyHandle,
	rateLimitHandle,
	requestFilterHandle
} from '$lib/server/security';

const securityHeadersHandle: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);
	return applySecurityHeaders(response, event.request);
};

function redirectResponse(event: { request: Request }, location: string): Response {
	return applySecurityHeaders(
		new Response(null, {
			status: 303,
			headers: { Location: location }
		}),
		event.request
	);
}

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
let settingsConflictsCleared = false;

const initializationHandle: Handle = async ({ event, resolve }) => {
	if (!settingsConflictsCleared) {
		settingsConflictsCleared = true;
		try {
			const clearedSettings = await clearConflictingDbSettings();
			if (clearedSettings.length > 0) {
				logger.info(
					`Auto-cleared ${clearedSettings.length} DB setting(s) due to ENV precedence: ${clearedSettings.join(', ')}`,
					'Startup'
				);
			}
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			logger.error(`Failed to clear conflicting DB settings: ${errorMessage}`, 'Startup');
		}
	}
	return resolve(event);
};

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
		const session = await validateSession(sessionId);

		if (session) {
			if (needsRevalidation(sessionId) && (await shouldRevalidateSession())) {
				const result = await revalidateMembership(sessionId, session.plexToken);

				switch (result.status) {
					case 'valid': {
						const newIsAdmin = result.membership.isOwner;
						if (newIsAdmin !== session.isAdmin) {
							await updateUserAndSessionAdmin(sessionId, session.userId, newIsAdmin);
							session.isAdmin = newIsAdmin;
						}
						break;
					}
					case 'revoked':
						logger.info(
							`Session revoked for user ${session.username}: ${result.reason}`,
							'Revalidation'
						);
						await invalidateUserSessions(session.userId);
						event.cookies.delete('session', COOKIE_DELETE_OPTIONS);
						return resolve(event);
					case 'error_grace_expired':
						logger.warn(
							`Grace period expired for user ${session.username}, invalidating session`,
							'Revalidation'
						);
						await invalidateSession(sessionId);
						event.cookies.delete('session', COOKIE_DELETE_OPTIONS);
						return resolve(event);
					case 'error_within_grace':
						break;
				}
			}

			event.locals.user = {
				id: session.userId,
				plexId: session.plexId,
				username: session.username,
				isAdmin: session.isAdmin
			};
		} else {
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
			return redirectResponse(event, `/onboarding/${currentStep}`);
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
	if (event.url.pathname.startsWith('/admin')) {
		if (!event.locals.user || !event.locals.user.isAdmin) {
			return redirectResponse(event, '/');
		}
	}

	return resolve(event);
};

export const handleError: HandleServerError = async ({ error, event }) => {
	// Log the full error for debugging
	logger.error(`Unexpected error: ${error}`, 'ErrorHandler', {
		route: event.route.id ?? '<unmatched>',
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
	initializationHandle,
	securityHeadersHandle,
	authHandle,
	onboardingHandle,
	authorizationHandle
);
