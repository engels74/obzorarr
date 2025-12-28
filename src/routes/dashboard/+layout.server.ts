import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	if (!locals.user) {
		redirect(303, '/');
	}

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
