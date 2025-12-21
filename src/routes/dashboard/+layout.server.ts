import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

/**
 * User Dashboard Layout Server
 *
 * Provides authentication and user data for the dashboard.
 * Redirects admins to the admin panel.
 */

export const load: LayoutServerLoad = async ({ locals }) => {
	// Redirect unauthenticated users to login
	if (!locals.user) {
		redirect(303, '/');
	}

	// Redirect admins to admin panel
	if (locals.user.isAdmin) {
		redirect(303, '/admin');
	}

	return {
		user: {
			id: locals.user.id,
			username: locals.user.username
		},
		currentYear: new Date().getFullYear()
	};
};
