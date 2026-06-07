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

	// Only mint/look up the owner's share href once there's at least one year of
	// data. With no available years, `year` falls back to currentYear and calling
	// getOwnerWrappedHref would lazily INSERT a shareSettings row for a year that
	// isn't actually 'available' (getOrCreateShareSettings creates by default) —
	// the no-data case must not create share state. The card is hidden client-side
	// when wrappedHref is null.
	const wrappedHref =
		availableYears.length > 0 ? await getOwnerWrappedHref(locals.user!.id, year) : null;

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
