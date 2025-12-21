import type { Handle, HandleServerError } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { validateSession } from '$lib/server/auth/session';
import { isDevBypassEnabled, getOrCreateDevSession } from '$lib/server/auth/dev-bypass';
import { SESSION_DURATION_MS } from '$lib/server/auth/types';
import { logger } from '$lib/server/logging';

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
					'🔓 DEV_BYPASS_AUTH is enabled - using simulated admin user (dev-admin)',
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
 * Runs authentication first, then authorization.
 */
export const handle = sequence(authHandle, authorizationHandle);
