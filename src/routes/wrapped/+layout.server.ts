import type { LayoutServerLoad } from './$types';
import { getWrappedTheme } from '$lib/server/admin/settings.service';

/**
 * Wrapped Layout Server Load
 *
 * Loads the wrapped theme for all /wrapped/* routes.
 * This overrides the UI theme from the root layout.
 */

export const load: LayoutServerLoad = async () => {
	const wrappedTheme = await getWrappedTheme();

	return {
		wrappedTheme
	};
};
