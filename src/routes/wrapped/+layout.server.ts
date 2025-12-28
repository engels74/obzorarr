import type { LayoutServerLoad } from './$types';
import { getWrappedTheme } from '$lib/server/admin/settings.service';
import { getSyncStatus } from '$lib/server/sync/live-sync';

export const load: LayoutServerLoad = async () => {
	const [wrappedTheme, syncStatus] = await Promise.all([getWrappedTheme(), getSyncStatus()]);

	return {
		wrappedTheme,
		syncStatus
	};
};
