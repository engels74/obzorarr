import { json, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { invalidateSession } from '$lib/server/auth/session';

/**
 * Logout Endpoint
 *
 * Invalidates the user's session and clears the session cookie.
 *
 * Implements Requirement 1.7:
 * - Invalidate session and clear stored tokens on logout
 */

// =============================================================================
// Cookie Configuration
// =============================================================================

const COOKIE_OPTIONS = {
	path: '/'
};

// =============================================================================
// POST /auth/logout - Logout user
// =============================================================================

/**
 * Log out the current user
 *
 * Invalidates the session in the database and clears the session cookie.
 * Returns a success response with redirect URL.
 *
 * @example Response:
 * ```json
 * {
 *   "success": true,
 *   "message": "Logged out successfully"
 * }
 * ```
 */
export const POST: RequestHandler = async ({ cookies }) => {
	// Get session ID from cookie
	const sessionId = cookies.get('session');

	// Invalidate session if present
	if (sessionId) {
		try {
			await invalidateSession(sessionId);
		} catch (err) {
			// Log error but don't fail - the cookie will be deleted anyway
			console.error('Error invalidating session:', err);
		}
	}

	// Clear the session cookie
	cookies.delete('session', COOKIE_OPTIONS);

	return json({
		success: true,
		message: 'Logged out successfully'
	});
};

// =============================================================================
// GET /auth/logout - Logout with redirect
// =============================================================================

/**
 * Log out and redirect to home
 *
 * Alternative logout method that redirects to home page.
 * Useful for simple links like <a href="/auth/logout">Logout</a>
 */
export const GET: RequestHandler = async ({ cookies }) => {
	// Get session ID from cookie
	const sessionId = cookies.get('session');

	// Invalidate session if present
	if (sessionId) {
		try {
			await invalidateSession(sessionId);
		} catch (err) {
			// Log error but don't fail
			console.error('Error invalidating session:', err);
		}
	}

	// Clear the session cookie
	cookies.delete('session', COOKIE_OPTIONS);

	// Redirect to home
	redirect(303, '/');
};
