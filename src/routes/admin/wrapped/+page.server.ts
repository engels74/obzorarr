import type { PageServerLoad } from './$types';

/**
 * Admin Wrapped Hub Server
 *
 * Provides data for the admin wrapped hub page.
 * Returns admin user info and current year for navigation.
 */

export const load: PageServerLoad = async ({ locals }) => {
	const currentYear = new Date().getFullYear();

	return {
		adminUser: {
			id: locals.user!.id,
			username: locals.user!.username
		},
		currentYear
	};
};
