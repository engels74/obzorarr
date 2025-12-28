import { json, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { invalidateSession } from '$lib/server/auth/session';

const COOKIE_OPTIONS = {
	path: '/'
};

export const POST: RequestHandler = async ({ cookies }) => {
	const sessionId = cookies.get('session');

	if (sessionId) {
		try {
			await invalidateSession(sessionId);
		} catch (err) {
			// Log error but don't fail - the cookie will be deleted anyway
			console.error('Error invalidating session:', err);
		}
	}

	cookies.delete('session', COOKIE_OPTIONS);

	return json({
		success: true,
		message: 'Logged out successfully'
	});
};

export const GET: RequestHandler = async ({ cookies }) => {
	const sessionId = cookies.get('session');

	if (sessionId) {
		try {
			await invalidateSession(sessionId);
		} catch (err) {
			console.error('Error invalidating session:', err);
		}
	}

	cookies.delete('session', COOKIE_OPTIONS);

	redirect(303, '/');
};
