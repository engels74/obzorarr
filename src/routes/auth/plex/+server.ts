import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getPinInfo, checkPinStatus } from '$lib/server/auth/plex-oauth';
import { PlexAuthApiError, PinExpiredError } from '$lib/server/auth/types';
import { z } from 'zod';

const PollRequestSchema = z.object({
	pinId: z.number().int().positive()
});

export const GET: RequestHandler = async ({ url }) => {
	try {
		const redirectUrl = url.searchParams.get('redirectUrl') ?? undefined;
		const pinInfo = await getPinInfo(redirectUrl);

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

export const POST: RequestHandler = async ({ request }) => {
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
