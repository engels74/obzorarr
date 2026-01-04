import type { PageServerLoad } from './$types';

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
