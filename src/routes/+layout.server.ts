import { getUITheme } from '$lib/server/admin/settings.service';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async () => {
	const uiTheme = await getUITheme();

	return {
		uiTheme
	};
};
