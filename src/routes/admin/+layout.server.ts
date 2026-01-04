import {
	getCsrfConfigWithSource,
	isCsrfWarningDismissed
} from '$lib/server/admin/settings.service';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	const [csrfConfig, csrfWarningDismissed] = await Promise.all([
		getCsrfConfigWithSource(),
		isCsrfWarningDismissed()
	]);

	const showCsrfWarning = csrfConfig.origin.source === 'default' && !csrfWarningDismissed;

	return {
		adminUser: {
			id: locals.user!.id,
			username: locals.user!.username,
			isAdmin: locals.user!.isAdmin
		},
		currentYear: new Date().getFullYear(),
		csrfWarning: {
			show: showCsrfWarning,
			dismissed: csrfWarningDismissed
		}
	};
};
