import { redirect } from '@sveltejs/kit';
import { invalidateSession } from '$lib/server/auth/session';
import { logger } from '$lib/server/logging';
import type { Actions } from './$types';

const COOKIE_OPTIONS = {
	path: '/'
};

export const actions: Actions = {
	default: async ({ cookies }) => {
		const sessionId = cookies.get('session');

		if (sessionId) {
			try {
				await invalidateSession(sessionId);
			} catch (err) {
				logger.error('Error invalidating session', 'Logout', { error: String(err) });
			}
		}

		cookies.delete('session', COOKIE_OPTIONS);

		redirect(303, '/');
	}
};
