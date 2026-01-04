import { getWrappedTheme } from '$lib/server/admin/settings.service';
import { getAvailableYears } from '$lib/server/admin/users.service';
import { getSyncStatus } from '$lib/server/sync/live-sync';
import type { LayoutServerLoad } from './$types';

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
