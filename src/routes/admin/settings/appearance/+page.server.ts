import {
	getUITheme,
	getWrappedLogoMode,
	getWrappedTheme,
	ThemePresets,
	WrappedLogoMode
} from '$lib/server/admin/settings.service';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const [uiTheme, wrappedTheme, wrappedLogoMode] = await Promise.all([
		getUITheme(),
		getWrappedTheme(),
		getWrappedLogoMode()
	]);

	return {
		uiTheme,
		wrappedTheme,
		wrappedLogoMode,
		themeOptions: Object.entries(ThemePresets).map(([key, value]) => ({
			value,
			label: key
				.replace(/_/g, ' ')
				.toLowerCase()
				.replace(/\b\w/g, (c) => c.toUpperCase())
		})),
		wrappedLogoOptions: Object.entries(WrappedLogoMode).map(([key, value]) => ({
			value,
			label: key
				.replace(/_/g, ' ')
				.toLowerCase()
				.replace(/\b\w/g, (c) => c.toUpperCase())
		}))
	};
};
