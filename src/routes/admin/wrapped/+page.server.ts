import { getOwnerWrappedHref } from '$lib/server/sharing/service';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const currentYear = new Date().getFullYear();
	const wrappedHref = await getOwnerWrappedHref(locals.user!.id, currentYear);

	return {
		adminUser: {
			id: locals.user!.id,
			username: locals.user!.username
		},
		currentYear,
		wrappedHref
	};
};
