import {
	getCsrfConfigWithSource,
	isCsrfWarningDismissed
} from '$lib/server/admin/settings.service';
import { getOwnerWrappedHrefIfData, getUserFullProfile } from '$lib/server/admin/users.service';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	const currentYear = new Date().getFullYear();
	// Owner Wrapped href is null when the admin has no plays this year, so the
	// dashboard renders no "My Wrapped" link to hover-preload (no recurring 404,
	// ISSUE-001) and we don't lazily mint share state for a 0-play admin.
	const [csrfConfig, csrfWarningDismissed, profile, wrappedHref] = await Promise.all([
		getCsrfConfigWithSource(),
		isCsrfWarningDismissed(),
		getUserFullProfile(locals.user!.id),
		getOwnerWrappedHrefIfData(locals.user!.id, currentYear)
	]);

	const showCsrfWarning = csrfConfig.origin.source === 'default' && !csrfWarningDismissed;

	return {
		adminUser: {
			id: locals.user!.id,
			username: locals.user!.username,
			isAdmin: locals.user!.isAdmin,
			thumb: profile?.thumb ?? null
		},
		currentYear,
		wrappedHref,
		csrfWarning: {
			show: showCsrfWarning,
			dismissed: csrfWarningDismissed
		}
	};
};
