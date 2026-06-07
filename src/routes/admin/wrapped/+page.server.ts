import { getAvailableYears } from '$lib/server/admin/users.service';
import { getOwnerWrappedHref } from '$lib/server/sharing/service';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const availableYears = await getAvailableYears();
	const currentYear = new Date().getFullYear();

	const yearParam = url.searchParams.get('year');
	const parsedYear = yearParam ? parseInt(yearParam, 10) : Number.NaN;
	const year =
		Number.isInteger(parsedYear) && parsedYear >= 2000 && parsedYear <= 2100
			? parsedYear
			: currentYear;

	const wrappedHref = await getOwnerWrappedHref(locals.user!.id, year);

	return {
		adminUser: {
			id: locals.user!.id,
			username: locals.user!.username
		},
		year,
		availableYears,
		wrappedHref
	};
};
