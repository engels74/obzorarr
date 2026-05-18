import {
	getAppSettingsUpdatedAt,
	getUITheme,
	getWrappedLogoMode,
	getWrappedTheme,
	ThemePresets,
	UI_THEME_SETTINGS_KEYS,
	WRAPPED_LOGO_MODE_SETTINGS_KEYS,
	WRAPPED_THEME_SETTINGS_KEYS,
	WrappedLogoMode
} from '$lib/server/admin/settings.service';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const [
		uiTheme,
		wrappedTheme,
		wrappedLogoMode,
		uiThemeUpdatedAt,
		wrappedThemeUpdatedAt,
		wrappedLogoModeUpdatedAt
	] = await Promise.all([
		getUITheme(),
		getWrappedTheme(),
		getWrappedLogoMode(),
		getAppSettingsUpdatedAt(UI_THEME_SETTINGS_KEYS),
		getAppSettingsUpdatedAt(WRAPPED_THEME_SETTINGS_KEYS),
		getAppSettingsUpdatedAt(WRAPPED_LOGO_MODE_SETTINGS_KEYS)
	]);

	return {
		uiTheme,
		wrappedTheme,
		wrappedLogoMode,
		uiThemeVersion: uiThemeUpdatedAt?.toISOString() ?? new Date(0).toISOString(),
		wrappedThemeVersion: wrappedThemeUpdatedAt?.toISOString() ?? new Date(0).toISOString(),
		wrappedLogoModeVersion: wrappedLogoModeUpdatedAt?.toISOString() ?? new Date(0).toISOString(),
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
