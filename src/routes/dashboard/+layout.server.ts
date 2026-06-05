import { redirect } from '@sveltejs/kit';
import { isSafeReturnPath } from '$lib/client/plex-login';
import { getUserFullProfile } from '$lib/server/admin/users.service';
import { getOwnerWrappedHref } from '$lib/server/sharing/service';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	if (!locals.user) {
		// DF-020: preserve the intended destination so the login page can redirect
		// back after authentication.  Mirror the isSafeReturnPath guard used in
		// hooks.server.ts to prevent open-redirect abuse.
		const requestedPath = url.pathname;
		const location = isSafeReturnPath(requestedPath)
			? `/?returnTo=${encodeURIComponent(requestedPath)}`
			: '/';
		redirect(303, location);
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
