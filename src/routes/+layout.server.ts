import type { LayoutServerLoad } from './$types';
import { getUITheme } from '$lib/server/admin/settings.service';

export const load: LayoutServerLoad = async () => {
	const uiTheme = await getUITheme();

	return {
		uiTheme
	};
};
