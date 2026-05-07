import {
	getCsrfConfigWithSource,
	isCsrfWarningDismissed
} from '$lib/server/admin/settings.service';
import { getUserFullProfile } from '$lib/server/admin/users.service';
import { getOwnerWrappedHref } from '$lib/server/sharing/service';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	const currentYear = new Date().getFullYear();
	const [csrfConfig, csrfWarningDismissed, profile, wrappedHref] = await Promise.all([
		getCsrfConfigWithSource(),
		isCsrfWarningDismissed(),
		getUserFullProfile(locals.user!.id),
		getOwnerWrappedHref(locals.user!.id, currentYear)
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
