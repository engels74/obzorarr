import type { Handle, HandleServerError } from '@sveltejs/kit';
import { redirect, isRedirect } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { validateSession } from '$lib/server/auth/session';
import { isDevBypassEnabled, getOrCreateDevSession } from '$lib/server/auth/dev-bypass';
import { SESSION_DURATION_MS } from '$lib/server/auth/types';
import { logger } from '$lib/server/logging';
import { requiresOnboarding, getOnboardingStep } from '$lib/server/onboarding';
import { env } from '$env/dynamic/private';

/**
 * Server Hooks
 *
 * Handles authentication and authorization for all server requests.
 *
 * Implements Requirements 1.3, 1.4, 1.5:
 * - Grant admin privileges if server owner
 * - Grant member privileges if server member but not owner
 * - Protect admin routes from non-admin users
 */

// =============================================================================
// Cookie Configuration
// =============================================================================

const COOKIE_DELETE_OPTIONS = {
	path: '/'
};

const COOKIE_OPTIONS = {
	path: '/',
	httpOnly: true,
	secure: false, // Dev mode only
	sameSite: 'lax' as const,
	maxAge: Math.floor(SESSION_DURATION_MS / 1000)
};

// =============================================================================
// Dev Bypass State
// =============================================================================

/**
 * Track if dev bypass has been logged this server instance
 * to avoid spamming the logs on every request
 */
let devBypassLogged = false;

// =============================================================================
// Authentication Handle
// =============================================================================

/**
 * Authentication middleware
 *
 * Validates the session cookie and populates event.locals.user.
 * Clears invalid/expired session cookies.
 *
 * When DEV_BYPASS_AUTH=true in development mode, automatically
 * creates an admin session without requiring Plex OAuth.
 */
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

// =============================================================================
// Onboarding Handle
// =============================================================================

/**
 * Onboarding middleware
 *
 * Redirects users to the onboarding flow if setup is not complete.
 * Skips check for:
 * - Static assets (_app, favicon)
 * - Auth routes (/auth)
 * - API routes for onboarding (/api/onboarding)
 * - Onboarding routes themselves (/onboarding)
 *
 * Can be bypassed in development with DEV_BYPASS_ONBOARDING=true
 */
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

// =============================================================================
// Authorization Handle
// =============================================================================

/**
 * Authorization middleware
 *
 * Protects admin routes from unauthorized access.
 * - Unauthenticated users are redirected to home
 * - Non-admin users are redirected to home
 */
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

// =============================================================================
// Error Handle
// =============================================================================

/**
 * Error handler
 *
 * Logs unexpected errors and returns sanitized error messages.
 * Per bun-svelte-pro.md guidelines.
 */
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

// =============================================================================
// Combined Handle
// =============================================================================

/**
 * Combined server handle
 *
 * Runs authentication first, then onboarding check, then authorization.
 */
export const handle = sequence(authHandle, onboardingHandle, authorizationHandle);
