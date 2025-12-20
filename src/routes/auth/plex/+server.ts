import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getPinInfo, checkPinStatus } from '$lib/server/auth/plex-oauth';
import { PlexAuthApiError, PinExpiredError } from '$lib/server/auth/types';
import { z } from 'zod';

/**
 * Plex OAuth Initiation Endpoint
 *
 * Handles the first steps of the Plex OAuth flow:
 * - GET: Request a new PIN and return info for client
 * - POST: Check PIN status for polling
 *
 * Implements Requirement 1.1:
 * - Redirect to Plex OAuth authorization endpoint
 */

// =============================================================================
// Request Schemas
// =============================================================================

const PollRequestSchema = z.object({
	pinId: z.number().int().positive()
});

// =============================================================================
// GET /auth/plex - Request new PIN
// =============================================================================

/**
 * Request a new Plex OAuth PIN
 *
 * Returns PIN information needed to initiate OAuth flow:
 * - pinId: ID to poll for status
 * - code: PIN code for display (if needed)
 * - authUrl: URL to open for user authorization
 * - expiresAt: When the PIN expires
 *
 * @example Response:
 * ```json
 * {
 *   "pinId": 123456,
 *   "code": "ABC123",
 *   "authUrl": "https://app.plex.tv/auth#?...",
 *   "expiresAt": "2024-01-01T12:00:00.000Z"
 * }
 * ```
 */
export const GET: RequestHandler = async () => {
	try {
		const pinInfo = await getPinInfo();

		return json(pinInfo);
	} catch (err) {
		if (err instanceof PlexAuthApiError) {
			console.error('Plex OAuth error:', err.message);
			error(502, {
				message: 'Unable to connect to Plex. Please try again.'
			});
		}

		console.error('Unexpected error in PIN request:', err);
		error(500, {
			message: 'An unexpected error occurred.'
		});
	}
};

// =============================================================================
// POST /auth/plex - Poll PIN status
// =============================================================================

/**
 * Poll the status of a Plex OAuth PIN
 *
 * Client should poll this endpoint to check if the user has
 * authorized the PIN. Returns either:
 * - { pending: true } if not yet authorized
 * - { authToken: "..." } if authorized
 *
 * @example Request:
 * ```json
 * { "pinId": 123456 }
 * ```
 *
 * @example Response (pending):
 * ```json
 * { "pending": true }
 * ```
 *
 * @example Response (authorized):
 * ```json
 * { "authToken": "abc123..." }
 * ```
 */
export const POST: RequestHandler = async ({ request }) => {
	// Parse and validate request body
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		error(400, { message: 'Invalid JSON body' });
	}

	const parseResult = PollRequestSchema.safeParse(body);
	if (!parseResult.success) {
		error(400, {
			message: 'Invalid request: pinId is required and must be a positive integer'
		});
	}

	const { pinId } = parseResult.data;

	try {
		const pinStatus = await checkPinStatus(pinId);

		if (pinStatus.authToken) {
			return json({ authToken: pinStatus.authToken });
		}

		return json({ pending: true });
	} catch (err) {
		if (err instanceof PinExpiredError) {
			error(401, {
				message: err.message
			});
		}

		if (err instanceof PlexAuthApiError) {
			console.error('Plex OAuth error:', err.message);
			error(502, {
				message: 'Unable to connect to Plex. Please try again.'
			});
		}

		console.error('Unexpected error in PIN poll:', err);
		error(500, {
			message: 'An unexpected error occurred.'
		});
	}
};
