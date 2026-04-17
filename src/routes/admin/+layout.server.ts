import {
	getCsrfConfigWithSource,
	isCsrfWarningDismissed
} from '$lib/server/admin/settings.service';
import { getUserFullProfile } from '$lib/server/admin/users.service';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	const [csrfConfig, csrfWarningDismissed, profile] = await Promise.all([
		getCsrfConfigWithSource(),
		isCsrfWarningDismissed(),
		getUserFullProfile(locals.user!.id)
	]);

	const showCsrfWarning = csrfConfig.origin.source === 'default' && !csrfWarningDismissed;

	return {
		adminUser: {
			id: locals.user!.id,
			username: locals.user!.username,
			isAdmin: locals.user!.isAdmin,
			thumb: profile?.thumb ?? null
		},
		currentYear: new Date().getFullYear(),
		csrfWarning: {
			show: showCsrfWarning,
			dismissed: csrfWarningDismissed
		}
	};
};
