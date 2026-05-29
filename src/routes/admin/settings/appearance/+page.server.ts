import { fail } from '@sveltejs/kit';
import { z } from 'zod';
import {
	externalOccCheck,
	OCC_CONFLICT_CODE,
	OCC_CONFLICT_MESSAGE,
	settingsVersionISO
} from '$lib/server/admin/occ-helpers';
import {
	getAppSettingsUpdatedAt,
	getUITheme,
	getWrappedLogoMode,
	getWrappedTheme,
	setUITheme,
	setWrappedLogoMode,
	setWrappedTheme,
	ThemePresets,
	type ThemePresetType,
	UI_THEME_SETTINGS_KEYS,
	WRAPPED_LOGO_MODE_SETTINGS_KEYS,
	WRAPPED_THEME_SETTINGS_KEYS,
	WrappedLogoMode,
	type WrappedLogoModeType
} from '$lib/server/admin/settings.service';
import { requireAdminActions } from '$lib/server/auth/guards';
import type { Actions, PageServerLoad } from './$types';

/**
 * OCC strategy: EXTERNAL for both theme schemas + the logo-mode schema.
 * Top-level `z.enum` schemas; the action validates `settingsVersion` from
 * formData against the current row BEFORE `safeParse`. Mirrors the
 * monolith's three z.enum actions verbatim — see v3 plan §A5 Table D2.
 */
const ThemeSchema = z.enum([
	'modern-minimal',
	'supabase',
	'doom-64',
	'amber-minimal',
	'soviet-red'
]);
/**
 * OCC strategy: EXTERNAL. Same shape as `ThemeSchema` — top-level z.enum,
 * validated via `externalOccCheck` against `WRAPPED_LOGO_MODE_SETTINGS_KEYS`
 * before `safeParse` so the conflict response carries the magic
 * `OCC_CONFLICT_CODE` sentinel + the current settingsVersion.
 */
const WrappedLogoModeSchema = z.enum(['always_show', 'always_hide', 'user_choice']);

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
		uiThemeVersion: settingsVersionISO(uiThemeUpdatedAt),
		wrappedThemeVersion: settingsVersionISO(wrappedThemeUpdatedAt),
		wrappedLogoModeVersion: settingsVersionISO(wrappedLogoModeUpdatedAt),
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

export const actions: Actions = requireAdminActions({
	updateUITheme: async ({ request }) => {
		const formData = await request.formData();

		const occ = await externalOccCheck(
			formData.get('settingsVersion')?.toString() ?? '',
			UI_THEME_SETTINGS_KEYS
		);
		if (occ.status === 'conflict') {
			return fail(409, {
				error: OCC_CONFLICT_MESSAGE,
				code: OCC_CONFLICT_CODE,
				settingsVersion: occ.current
			});
		}

		const parsed = ThemeSchema.safeParse(formData.get('theme'));
		if (!parsed.success) return fail(400, { error: 'Invalid theme selection' });

		try {
			await setUITheme(parsed.data as ThemePresetType);
			return { success: true, message: 'UI theme updated' };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to update UI theme';
			return fail(500, { error: message });
		}
	},

	updateWrappedTheme: async ({ request }) => {
		const formData = await request.formData();

		const occ = await externalOccCheck(
			formData.get('settingsVersion')?.toString() ?? '',
			WRAPPED_THEME_SETTINGS_KEYS
		);
		if (occ.status === 'conflict') {
			return fail(409, {
				error: OCC_CONFLICT_MESSAGE,
				code: OCC_CONFLICT_CODE,
				settingsVersion: occ.current
			});
		}

		const parsed = ThemeSchema.safeParse(formData.get('wrappedTheme') ?? formData.get('theme'));
		if (!parsed.success) return fail(400, { error: 'Invalid theme selection' });

		try {
			await setWrappedTheme(parsed.data as ThemePresetType);
			return { success: true, message: 'Wrapped theme updated' };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to update wrapped theme';
			return fail(500, { error: message });
		}
	},

	updateWrappedLogoMode: async ({ request }) => {
		const formData = await request.formData();

		const occ = await externalOccCheck(
			formData.get('settingsVersion')?.toString() ?? '',
			WRAPPED_LOGO_MODE_SETTINGS_KEYS
		);
		if (occ.status === 'conflict') {
			return fail(409, {
				error: OCC_CONFLICT_MESSAGE,
				code: OCC_CONFLICT_CODE,
				settingsVersion: occ.current
			});
		}

		const parsed = WrappedLogoModeSchema.safeParse(formData.get('logoMode'));
		if (!parsed.success) return fail(400, { error: 'Invalid logo mode' });

		try {
			await setWrappedLogoMode(parsed.data as WrappedLogoModeType);
			return { success: true, message: 'Logo visibility mode updated' };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to update mode';
			return fail(500, { error: message });
		}
	}
});
