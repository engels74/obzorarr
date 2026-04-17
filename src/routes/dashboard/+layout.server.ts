import { redirect } from '@sveltejs/kit';
import { getUserFullProfile } from '$lib/server/admin/users.service';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	if (!locals.user) {
		redirect(303, '/');
	}

	if (locals.user.isAdmin) {
		redirect(303, '/admin');
	}

	const profile = await getUserFullProfile(locals.user.id);

	return {
		user: {
			id: locals.user.id,
			username: locals.user.username,
			thumb: profile?.thumb ?? null
		},
		currentYear: new Date().getFullYear()
	};
};
