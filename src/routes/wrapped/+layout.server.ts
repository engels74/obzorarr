import { getWrappedTheme } from '$lib/server/admin/settings.service';
import { getAvailableYears } from '$lib/server/admin/users.service';
import { getSyncStatus } from '$lib/server/sync/live-sync';
import type { LayoutServerLoad } from './$types';

const LOOKUP_LIVE_SYNC_COOKIE = 'lookup_live_sync';

export const load: LayoutServerLoad = async ({ cookies }) => {
	const lookupSyncTriggered = cookies.get(LOOKUP_LIVE_SYNC_COOKIE) === '1';
	if (lookupSyncTriggered) {
		cookies.delete(LOOKUP_LIVE_SYNC_COOKIE, { path: '/wrapped' });
	}

	const [wrappedTheme, syncStatus, availableYears] = await Promise.all([
		getWrappedTheme(),
		getSyncStatus(),
		getAvailableYears()
	]);

	return {
		wrappedTheme,
		syncStatus,
		availableYears,
		lookupSyncTriggered
	};
};
