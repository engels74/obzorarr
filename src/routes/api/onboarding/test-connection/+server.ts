import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import {
	PLEX_CLIENT_ID,
	PLEX_PRODUCT,
	PLEX_VERSION,
	PlexServerIdentitySchema
} from '$lib/server/auth/types';
import { logger } from '$lib/server/logging';
import { sanitizeConnectionError } from '$lib/server/security/error-sanitizer';

const PLEX_SERVER_HEADERS = {
	Accept: 'application/json',
	'X-Plex-Client-Identifier': PLEX_CLIENT_ID,
	'X-Plex-Product': PLEX_PRODUCT,
	'X-Plex-Version': PLEX_VERSION
} as const;

const TestConnectionSchema = z.object({
	url: z.string().url('Invalid URL format'),
	accessToken: z.string().min(1, 'Access token is required')
});

const CONNECTION_TIMEOUT_MS = 10000;

export const POST: RequestHandler = async ({ request, locals }) => {
	// Require authenticated admin user
	if (!locals.user) {
		error(401, 'Authentication required');
	}

	if (!locals.user.isAdmin) {
		error(403, 'Only server owners can configure Obzorarr');
	}

	try {
		// Parse and validate request body
		const body = await request.json();
		const parseResult = TestConnectionSchema.safeParse(body);

		if (!parseResult.success) {
			const errorMessage = parseResult.error.issues[0]?.message ?? 'Invalid request';
			return json({ success: false, error: errorMessage });
		}

		const { url, accessToken } = parseResult.data;

		// Normalize URL - remove trailing slash
		const normalizedUrl = url.replace(/\/+$/, '');
		const endpoint = `${normalizedUrl}/identity`;

		logger.debug(`Testing connection to: ${endpoint}`, 'Onboarding');

		// Create abort controller for timeout
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), CONNECTION_TIMEOUT_MS);

		try {
			const response = await fetch(endpoint, {
				headers: {
					...PLEX_SERVER_HEADERS,
					'X-Plex-Token': accessToken
				},
				signal: controller.signal
			});

			clearTimeout(timeoutId);

			// Check for authentication errors
			if (response.status === 401) {
				logger.debug('Connection test failed: Authentication failed', 'Onboarding');
				return json({
					success: false,
					error: 'Authentication failed - the access token may be invalid'
				});
			}

			if (!response.ok) {
				logger.debug(
					`Connection test failed: ${response.status} ${response.statusText}`,
					'Onboarding'
				);
				return json({
					success: false,
					error: `Server returned error: ${response.status} ${response.statusText}`
				});
			}

			// Parse and validate response
			const data = await response.json();
			const identityResult = PlexServerIdentitySchema.safeParse(data);

			if (!identityResult.success) {
				logger.debug('Connection test failed: Not a valid Plex server response', 'Onboarding');
				return json({
					success: false,
					error: 'This does not appear to be a Plex Media Server'
				});
			}

			const { machineIdentifier, friendlyName } = identityResult.data.MediaContainer;
			const serverName = friendlyName || 'Plex Media Server';

			logger.info(`Connection test successful: ${serverName} (${machineIdentifier})`, 'Onboarding');

			return json({
				success: true,
				serverName,
				machineIdentifier
			});
		} catch (fetchError) {
			clearTimeout(timeoutId);

			// Handle specific error types
			if (fetchError instanceof Error) {
				// Timeout error
				if (fetchError.name === 'AbortError') {
					logger.debug('Connection test failed: Timeout', 'Onboarding');
					return json({
						success: false,
						error: 'Connection timed out - the server may be unreachable'
					});
				}

				// SSL/TLS errors
				if (
					fetchError.message.includes('certificate') ||
					fetchError.message.includes('SSL') ||
					fetchError.message.includes('TLS')
				) {
					logger.debug(`Connection test failed: SSL error - ${fetchError.message}`, 'Onboarding');
					return json({
						success: false,
						error: 'SSL certificate error - check your reverse proxy configuration'
					});
				}

				// DNS/Network errors
				if (
					fetchError.message.includes('ENOTFOUND') ||
					fetchError.message.includes('ECONNREFUSED') ||
					fetchError.message.includes('getaddrinfo')
				) {
					logger.debug(
						`Connection test failed: Network error - ${fetchError.message}`,
						'Onboarding'
					);
					return json({
						success: false,
						error: 'Could not connect to server - check the URL and ensure the server is reachable'
					});
				}

				logger.debug(`Connection test failed: ${fetchError.message}`, 'Onboarding');
				return json({
					success: false,
					error: sanitizeConnectionError(fetchError)
				});
			}

			logger.debug(`Connection test failed: Unknown error`, 'Onboarding');
			return json({
				success: false,
				error: 'Connection failed - please check the URL and try again'
			});
		}
	} catch (err) {
		// Re-throw SvelteKit errors
		if (err && typeof err === 'object' && 'status' in err) {
			throw err;
		}

		logger.error(
			`Test connection error: ${err instanceof Error ? err.message : String(err)}`,
			'Onboarding'
		);
		return json({
			success: false,
			error: 'An unexpected error occurred'
		});
	}
};
