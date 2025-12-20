import type { LayoutServerLoad } from './$types';

/**
 * Admin Layout Server
 *
 * Provides admin user information to all admin pages.
 * The auth check is already handled by hooks.server.ts.
 *
 * Implements Requirements:
 * - 11.1: Admin panel dashboard
 * - 14.2: Admin panel routing
 */

export const load: LayoutServerLoad = async ({ locals }) => {
	// locals.user is guaranteed by hooks.server.ts auth check
	return {
		adminUser: {
			id: locals.user!.id,
			username: locals.user!.username,
			isAdmin: locals.user!.isAdmin
		}
	};
};
