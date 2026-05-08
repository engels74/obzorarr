import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import { completePlexPinLogin } from '$lib/server/auth/login-completion';
import {
	appendPinStateToForwardUrl,
	createPinTransaction,
	parsePinForwardUrl
} from '$lib/server/auth/pin-transactions';
import { buildPlexOAuthUrl, requestPin } from '$lib/server/auth/plex-oauth';
import { NotServerMemberError, PinExpiredError, PlexAuthApiError } from '$lib/server/auth/types';
import { logger } from '$lib/server/logging';
import { OnboardingClaimRequiredError } from '$lib/server/onboarding';
import type { RequestHandler } from './$types';

const PollRequestSchema = z.object({
	pinId: z.number().int().positive()
});

export const GET: RequestHandler = async ({ cookies, url }) => {
	try {
		const redirectUrl = url.searchParams.get('redirectUrl') ?? `${url.origin}/auth/plex/redirect`;
		parsePinForwardUrl(redirectUrl, url);

		const pin = await requestPin();
		const state = await createPinTransaction(pin.id, cookies);
		const forwardUrl = appendPinStateToForwardUrl(redirectUrl, url, state);
		const pinInfo = {
			pinId: pin.id,
			code: pin.code,
			authUrl: buildPlexOAuthUrl(pin.code, forwardUrl),
			expiresAt: pin.expiresAt ?? new Date(Date.now() + 15 * 60 * 1000).toISOString()
		};

		return json(pinInfo);
	} catch (err) {
		if (
			err instanceof TypeError ||
			(err instanceof Error && err.message.includes('redirect URL'))
		) {
			error(400, {
				message: 'Invalid redirect URL'
			});
		}

		if (err instanceof PlexAuthApiError) {
			logger.error('Plex OAuth PIN request failed', 'Auth', {
				statusCode: err.statusCode,
				endpoint: err.endpoint
			});
			error(502, {
				message: 'Unable to connect to Plex. Please try again.'
			});
		}

		logger.error('Unexpected error in PIN request', 'Auth', {
			errorType: err instanceof Error ? err.name : typeof err
		});
		error(500, {
			message: 'An unexpected error occurred.'
		});
	}
};

export const POST: RequestHandler = async ({ request, cookies, url }) => {
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
		return json(await completePlexPinLogin(pinId, cookies, { requestUrl: url }));
	} catch (err) {
		if (err instanceof PinExpiredError) {
			error(401, {
				message: err.message
			});
		}

		if (err instanceof PlexAuthApiError) {
			logger.error('Plex OAuth PIN poll failed', 'Auth', {
				statusCode: err.statusCode,
				endpoint: err.endpoint
			});
			error(502, {
				message: 'Unable to connect to Plex. Please try again.'
			});
		}

		if (err instanceof NotServerMemberError) {
			error(403, {
				message: err.message
			});
		}

		if (err instanceof OnboardingClaimRequiredError) {
			error(403, {
				message: err.message
			});
		}

		logger.error('Unexpected error in PIN poll', 'Auth', {
			errorType: err instanceof Error ? err.name : typeof err
		});
		error(500, {
			message: 'An unexpected error occurred.'
		});
	}
};
