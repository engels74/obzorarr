import type { LayoutServerLoad } from './$types';
import { getWrappedTheme } from '$lib/server/admin/settings.service';
import { getSyncStatus } from '$lib/server/sync/live-sync';

/**
 * Wrapped Layout Server Load
 *
 * Loads the wrapped theme and sync status for all /wrapped/* routes.
 * This overrides the UI theme from the root layout.
 */

export const load: LayoutServerLoad = async () => {
	const [wrappedTheme, syncStatus] = await Promise.all([getWrappedTheme(), getSyncStatus()]);

	return {
		wrappedTheme,
		syncStatus
	};
};
