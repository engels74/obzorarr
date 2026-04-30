import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import { createSessionFromPlexToken } from '$lib/server/auth/login-completion';
import { NotServerMemberError, PlexAuthApiError } from '$lib/server/auth/types';
import { logger } from '$lib/server/logging';
import type { RequestHandler } from './$types';

const CallbackRequestSchema = z.object({
	authToken: z.string().min(1, 'Auth token is required')
});

export const POST: RequestHandler = async ({ request, cookies }) => {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		error(400, { message: 'Invalid JSON body' });
	}

	const parseResult = CallbackRequestSchema.safeParse(body);
	if (!parseResult.success) {
		error(400, {
			message: 'Invalid request: authToken is required'
		});
	}

	const { authToken } = parseResult.data;

	try {
		return json(await createSessionFromPlexToken(authToken, cookies));
	} catch (err) {
		if (err instanceof NotServerMemberError) {
			error(403, {
				message: err.message
			});
		}

		if (err instanceof PlexAuthApiError) {
			logger.error('Plex OAuth callback failed', 'Auth', {
				statusCode: err.statusCode,
				endpoint: err.endpoint
			});

			if (err.statusCode === 401) {
				error(401, {
					message: 'Invalid or expired auth token. Please try again.'
				});
			}

			error(502, {
				message: 'Unable to connect to Plex. Please try again.'
			});
		}

		logger.error('Unexpected error in OAuth callback', 'Auth', {
			errorType: err instanceof Error ? err.name : typeof err
		});
		error(500, {
			message: 'An unexpected error occurred.'
		});
	}
};
