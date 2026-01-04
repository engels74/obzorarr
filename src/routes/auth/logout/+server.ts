import { json } from '@sveltejs/kit';
import { invalidateSession } from '$lib/server/auth/session';
import { logger } from '$lib/server/logging';
import type { RequestHandler } from './$types';

const COOKIE_OPTIONS = {
	path: '/'
};

export const POST: RequestHandler = async ({ cookies }) => {
	const sessionId = cookies.get('session');

	if (sessionId) {
		try {
			await invalidateSession(sessionId);
		} catch (err) {
			logger.error('Error invalidating session', 'Logout', { error: String(err) });
		}
	}

	cookies.delete('session', COOKIE_OPTIONS);

	return json({
		success: true,
		message: 'Logged out successfully'
	});
};
