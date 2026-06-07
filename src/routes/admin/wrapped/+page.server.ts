import { getAvailableYears } from '$lib/server/admin/users.service';
import { getOwnerWrappedHref } from '$lib/server/sharing/service';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const availableYears = await getAvailableYears();
	const currentYear = new Date().getFullYear();

	const yearParam = url.searchParams.get('year');
	const parsedYear = yearParam ? parseInt(yearParam, 10) : Number.NaN;
	const requestedYear =
		Number.isInteger(parsedYear) && parsedYear >= 2000 && parsedYear <= 2100
			? parsedYear
			: currentYear;

	// Reconcile the requested year against the DB-derived set of available years so
	// the title, <select>, and wrappedHref stay consistent (and we don't lazily mint a
	// shareSettings row for a non-available year). Mirrors the includes() guard in
	// src/routes/wrapped/[year=year]/+page.server.ts.
	const year = availableYears.includes(requestedYear)
		? requestedYear
		: availableYears.includes(currentYear)
			? currentYear
			: (availableYears[0] ?? currentYear);

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
