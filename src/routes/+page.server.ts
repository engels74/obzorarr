import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * Landing Page Server
 *
 * Redirects authenticated users to appropriate dashboard.
 */

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) {
		redirect(303, locals.user.isAdmin ? '/admin' : '/dashboard');
	}
	return {};
};
