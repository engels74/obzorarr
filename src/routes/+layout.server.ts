import type { LayoutServerLoad } from './$types';
import { getUITheme } from '$lib/server/admin/settings.service';

/**
 * Root Layout Server Load
 *
 * Loads global app data for all pages:
 * - UI theme for dashboard/admin pages
 *
 * Note: Wrapped pages override this with their own theme via nested layout.
 */

export const load: LayoutServerLoad = async () => {
	const uiTheme = await getUITheme();

	return {
		uiTheme
	};
};
