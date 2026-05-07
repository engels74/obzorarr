import { redirect } from '@sveltejs/kit';
import { getUserFullProfile } from '$lib/server/admin/users.service';
import { getOwnerWrappedHref } from '$lib/server/sharing/service';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	if (!locals.user) {
		redirect(303, '/');
	}

	if (locals.user.isAdmin) {
		redirect(303, '/admin');
	}

	const currentYear = new Date().getFullYear();
	const [profile, wrappedHref] = await Promise.all([
		getUserFullProfile(locals.user.id),
		getOwnerWrappedHref(locals.user.id, currentYear)
	]);

	return {
		user: {
			id: locals.user.id,
			username: locals.user.username,
			thumb: profile?.thumb ?? null
		},
		currentYear,
		wrappedHref
	};
};
