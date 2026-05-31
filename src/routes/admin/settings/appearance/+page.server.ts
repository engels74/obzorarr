import { fail } from '@sveltejs/kit';
import { zod4 } from 'sveltekit-superforms/adapters';
import { setMessage, superValidate } from 'sveltekit-superforms/server';
import { z } from 'zod';
import {
	inlineOccCheck,
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
	type WrappedLogoModeType
} from '$lib/server/admin/settings.service';
import { requireAdminActions } from '$lib/server/auth/guards';
import { wrappedLogoOptions } from '$lib/sharing/options';
import type { Actions, PageServerLoad } from './$types';

/**
 * OCC strategy: INLINE `settingsVersion` (Superforms). Migrated from the
 * top-level `z.enum` + `externalOccCheck` shape to match privacy's canonical
 * pattern (ISSUE-015): each form carries an inline `settingsVersion`, the
 * action advances it from the freshly-written row on success, and the client
 * binds it back so a second consecutive save in the same page load isn't
 * false-409'd. The shared enum stays co-located with its consuming schema.
 */
const ThemeEnum = z.enum(['modern-minimal', 'supabase', 'doom-64', 'amber-minimal', 'soviet-red']);
const WrappedLogoModeEnum = z.enum(['always_show', 'always_hide', 'user_choice']);

/**
 * OCC strategy: INLINE `settingsVersion`. Parent schema for the UI theme form.
 * Same two-stage OCC as privacy (Zod min(1) rejects blank, then `inlineOccCheck`
 * catches stale submissions against `UI_THEME_SETTINGS_KEYS`).
 */
const UIThemeSchema = z.object({
	uiTheme: ThemeEnum,
	settingsVersion: z.string().min(1, 'Missing settings version (reload the page)')
});

/**
 * OCC strategy: INLINE `settingsVersion`. Parent schema for the Wrapped theme
 * form (OCC against `WRAPPED_THEME_SETTINGS_KEYS`).
 */
const WrappedThemeSchema = z.object({
	wrappedTheme: ThemeEnum,
	settingsVersion: z.string().min(1, 'Missing settings version (reload the page)')
});

/**
 * OCC strategy: INLINE `settingsVersion`. Parent schema for the Wrapped logo
 * visibility form (OCC against `WRAPPED_LOGO_MODE_SETTINGS_KEYS`).
 */
const WrappedLogoModeSchema = z.object({
	logoMode: WrappedLogoModeEnum,
	settingsVersion: z.string().min(1, 'Missing settings version (reload the page)')
});

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

	const uiThemeForm = await superValidate(
		{ uiTheme, settingsVersion: settingsVersionISO(uiThemeUpdatedAt) },
		zod4(UIThemeSchema),
		{ id: 'uiTheme' }
	);

	const wrappedThemeForm = await superValidate(
		{ wrappedTheme, settingsVersion: settingsVersionISO(wrappedThemeUpdatedAt) },
		zod4(WrappedThemeSchema),
		{ id: 'wrappedTheme' }
	);

	const wrappedLogoModeForm = await superValidate(
		{ logoMode: wrappedLogoMode, settingsVersion: settingsVersionISO(wrappedLogoModeUpdatedAt) },
		zod4(WrappedLogoModeSchema),
		{ id: 'wrappedLogoMode' }
	);

	return {
		uiThemeForm,
		wrappedThemeForm,
		wrappedLogoModeForm,
		themeOptions: Object.entries(ThemePresets).map(([key, value]) => ({
			value,
			label: key
				.replace(/_/g, ' ')
				.toLowerCase()
				.replace(/\b\w/g, (c) => c.toUpperCase())
		})),
		// Shared copy so settings (appearance) and onboarding (privacy) read identically.
		wrappedLogoOptions
	};
};

export const actions: Actions = requireAdminActions({
	updateUITheme: async ({ request }) => {
		// Read FormData once (consumes the body) so we can detect an absent
		// `uiTheme` field before handing the parsed object to superValidate.
		// Without this guard a request that omits `uiTheme` (e.g. a stale client)
		// would have the required z.enum silently filled with its first member
		// ('modern-minimal') and persisted as if intentionally selected.
		const formData = await request.formData();
		if (!formData.has('uiTheme')) {
			const form = await superValidate(formData, zod4(UIThemeSchema), { id: 'uiTheme' });
			// superValidate coerces the absent required enum to its first member, so
			// `form.valid` is still true here. setMessage(..., { status: 400 }) flips
			// form.valid=false and sets form.message so the client toast reports the
			// failure (it branches on form.valid / form.message) instead of a false save.
			setMessage(form, 'Invalid theme selection', { status: 400 });
			return fail(400, { form, error: 'Invalid theme selection' });
		}
		const form = await superValidate(formData, zod4(UIThemeSchema), { id: 'uiTheme' });
		if (!form.valid) {
			if (form.errors.settingsVersion?.length) {
				return fail(409, { form, conflict: true, error: OCC_CONFLICT_MESSAGE });
			}
			return fail(400, { form, error: 'Invalid theme selection' });
		}

		if (
			(await inlineOccCheck(form.data.settingsVersion, UI_THEME_SETTINGS_KEYS)).status ===
			'conflict'
		) {
			return fail(409, { form, conflict: true, error: OCC_CONFLICT_MESSAGE });
		}

		try {
			await setUITheme(form.data.uiTheme as ThemePresetType);
			// ISSUE-015: advance the returned settingsVersion so a second consecutive
			// save in the same page load isn't false-409'd. Single-writer admin
			// setting, so reading the row back post-write is safe.
			form.data.settingsVersion = settingsVersionISO(
				await getAppSettingsUpdatedAt(UI_THEME_SETTINGS_KEYS)
			);
			return { form, success: true, message: 'UI theme updated' };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to update UI theme';
			return fail(500, { form, error: message });
		}
	},

	updateWrappedTheme: async ({ request }) => {
		// Read FormData once (consumes the body) so we can detect an absent
		// `wrappedTheme` field before handing the parsed object to superValidate.
		// Without this guard a request that omits `wrappedTheme` (e.g. a stale
		// client) would have the required z.enum silently filled with its first
		// member ('modern-minimal') and persisted as if intentionally selected.
		const formData = await request.formData();
		if (!formData.has('wrappedTheme')) {
			const form = await superValidate(formData, zod4(WrappedThemeSchema), { id: 'wrappedTheme' });
			// See updateUITheme: setMessage flips form.valid=false + sets the message
			// so the client toast reports the failure, not a false save.
			setMessage(form, 'Invalid theme selection', { status: 400 });
			return fail(400, { form, error: 'Invalid theme selection' });
		}
		const form = await superValidate(formData, zod4(WrappedThemeSchema), { id: 'wrappedTheme' });
		if (!form.valid) {
			if (form.errors.settingsVersion?.length) {
				return fail(409, { form, conflict: true, error: OCC_CONFLICT_MESSAGE });
			}
			return fail(400, { form, error: 'Invalid theme selection' });
		}

		if (
			(await inlineOccCheck(form.data.settingsVersion, WRAPPED_THEME_SETTINGS_KEYS)).status ===
			'conflict'
		) {
			return fail(409, { form, conflict: true, error: OCC_CONFLICT_MESSAGE });
		}

		try {
			await setWrappedTheme(form.data.wrappedTheme as ThemePresetType);
			// ISSUE-015: advance the returned settingsVersion (see updateUITheme).
			form.data.settingsVersion = settingsVersionISO(
				await getAppSettingsUpdatedAt(WRAPPED_THEME_SETTINGS_KEYS)
			);
			return { form, success: true, message: 'Wrapped theme updated' };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to update wrapped theme';
			return fail(500, { form, error: message });
		}
	},

	updateWrappedLogoMode: async ({ request }) => {
		// Read FormData once (consumes the body) so we can detect an absent
		// `logoMode` field before handing the parsed object to superValidate.
		// Without this guard a request that omits `logoMode` (e.g. a stale client)
		// would have the required z.enum silently filled with its first member
		// ('always_show') and persisted as if intentionally selected.
		const formData = await request.formData();
		if (!formData.has('logoMode')) {
			const form = await superValidate(formData, zod4(WrappedLogoModeSchema), {
				id: 'wrappedLogoMode'
			});
			// See updateUITheme: setMessage flips form.valid=false + sets the message
			// so the client toast reports the failure, not a false save.
			setMessage(form, 'Invalid logo mode', { status: 400 });
			return fail(400, { form, error: 'Invalid logo mode' });
		}
		const form = await superValidate(formData, zod4(WrappedLogoModeSchema), {
			id: 'wrappedLogoMode'
		});
		if (!form.valid) {
			if (form.errors.settingsVersion?.length) {
				return fail(409, { form, conflict: true, error: OCC_CONFLICT_MESSAGE });
			}
			return fail(400, { form, error: 'Invalid logo mode' });
		}

		if (
			(await inlineOccCheck(form.data.settingsVersion, WRAPPED_LOGO_MODE_SETTINGS_KEYS)).status ===
			'conflict'
		) {
			return fail(409, { form, conflict: true, error: OCC_CONFLICT_MESSAGE });
		}

		try {
			await setWrappedLogoMode(form.data.logoMode as WrappedLogoModeType);
			// ISSUE-015: advance the returned settingsVersion (see updateUITheme).
			form.data.settingsVersion = settingsVersionISO(
				await getAppSettingsUpdatedAt(WRAPPED_LOGO_MODE_SETTINGS_KEYS)
			);
			return { form, success: true, message: 'Logo visibility mode updated' };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to update mode';
			return fail(500, { form, error: message });
		}
	}
});
