import { getUITheme, getWrappedTheme } from '$lib/server/admin/settings.service';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ cookies }) => {
	const [uiTheme, wrappedTheme] = await Promise.all([getUITheme(), getWrappedTheme()]);

	cookies.set('ui_theme', uiTheme, {
		path: '/',
		httpOnly: false,
		sameSite: 'lax',
		maxAge: 60 * 60 * 24 * 365
	});
	cookies.set('wrapped_theme', wrappedTheme, {
		path: '/',
		httpOnly: false,
		sameSite: 'lax',
		maxAge: 60 * 60 * 24 * 365
	});

	return {
		uiTheme,
		wrappedTheme
	};
};
