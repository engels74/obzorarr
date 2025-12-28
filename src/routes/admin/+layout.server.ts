import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	return {
		adminUser: {
			id: locals.user!.id,
			username: locals.user!.username,
			isAdmin: locals.user!.isAdmin
		},
		currentYear: new Date().getFullYear()
	};
};
