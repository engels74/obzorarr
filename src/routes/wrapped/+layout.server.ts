import type { LayoutServerLoad } from './$types';
import { getWrappedTheme } from '$lib/server/admin/settings.service';
import { getSyncStatus } from '$lib/server/sync/live-sync';
import { getAvailableYears } from '$lib/server/admin/users.service';

export const load: LayoutServerLoad = async () => {
	const [wrappedTheme, syncStatus, availableYears] = await Promise.all([
		getWrappedTheme(),
		getSyncStatus(),
		getAvailableYears()
	]);

	return {
		wrappedTheme,
		syncStatus,
		availableYears
	};
};
