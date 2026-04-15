import type { Cookies } from '@sveltejs/kit';
import { logger } from '$lib/server/logging';
import { invalidateSession } from './session';

const COOKIE_OPTIONS = {
	path: '/'
};

export async function logout(cookies: Cookies): Promise<void> {
	const sessionId = cookies.get('session');

	if (sessionId) {
		try {
			await invalidateSession(sessionId);
		} catch (err) {
			logger.error('Error invalidating session', 'Logout', { error: String(err) });
		}
	}

	cookies.delete('session', COOKIE_OPTIONS);
}
