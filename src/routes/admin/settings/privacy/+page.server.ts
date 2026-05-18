import { fail } from '@sveltejs/kit';
import { zod4 } from 'sveltekit-superforms/adapters';
import { superValidate } from 'sveltekit-superforms/server';
import { z } from 'zod';
import { inlineOccCheck, OCC_CONFLICT_MESSAGE } from '$lib/server/admin/occ-helpers';
import {
	AnonymizationMode,
	type AnonymizationModeType,
	getAnonymizationMode,
	getAppSettingsUpdatedAt,
	SERVER_WRAPPED_SETTINGS_KEYS,
	setServerWrappedSettingsAtomic,
	setUserDefaultsAtomic,
	USER_DEFAULTS_SETTINGS_KEYS
} from '$lib/server/admin/settings.service';
import { requireAdminActions } from '$lib/server/auth/guards';
import {
	bulkApplyShareDefaults,
	getGlobalAllowUserControl,
	getGlobalDefaultShareMode,
	getServerWrappedShareMode
} from '$lib/server/sharing/service';
import type { Actions, PageServerLoad } from './$types';

/**
 * OCC strategy: INLINE `settingsVersion` for both forms (z.object). Each
 * nested-route owns its own schemas — the shared-module consolidation that
 * was tentatively planned during US-020 didn't materialise because the
 * six tabs settled on different shapes (Superforms vs use:enhance, z.object
 * vs z.enum, inline vs external OCC). Schema co-location with its consuming
 * action stays the cleanest layout post-US-022.
 */
const AnonymizationSchema = z.enum(['real', 'anonymous', 'hybrid']);
const ServerWrappedModeSchema = z.enum(['public', 'private-oauth']);
const ShareModeSchema = z.enum(['public', 'private-oauth', 'private-link']);
/**
 * Strict boolean for form submission + initial load. Accepts ONLY 'true' /
 * 'false' strings (form-encoded) or the boolean literals (initial load).
 *
 * Two things this schema deliberately rejects:
 *   - z.coerce.boolean() treats the literal string 'false' as truthy, silently
 *     flipping the flag to true. Catastrophic for a privacy toggle.
 *   - z.preprocess((v) => v === 'true' || v === true, z.boolean()) silently
 *     maps unexpected strings like the HTML checkbox 'on' to false, which
 *     hides accidental checkbox-vs-toggle wiring bugs. The legacy monolith
 *     used z.enum(['true', 'false']).transform(...) for this reason.
 */
const FormBooleanSchema = z
	.union([z.literal('true'), z.literal('false'), z.literal(true), z.literal(false)])
	.transform((v) => v === 'true' || v === true);

const ServerWrappedSettingsSchema = z.object({
	anonymizationMode: AnonymizationSchema,
	serverWrappedShareMode: ServerWrappedModeSchema,
	settingsVersion: z.string().min(1, 'Missing settings version (reload the page)')
});

const UserDefaultsSettingsSchema = z.object({
	defaultShareMode: ShareModeSchema,
	allowUserControl: FormBooleanSchema,
	settingsVersion: z.string().min(1, 'Missing settings version (reload the page)')
});

export const load: PageServerLoad = async () => {
	const [
		anonymizationMode,
		defaultShareMode,
		allowUserControl,
		serverWrappedShareMode,
		serverWrappedSettingsUpdatedAt,
		userDefaultsSettingsUpdatedAt
	] = await Promise.all([
		getAnonymizationMode(),
		getGlobalDefaultShareMode(),
		getGlobalAllowUserControl(),
		getServerWrappedShareMode(),
		getAppSettingsUpdatedAt(SERVER_WRAPPED_SETTINGS_KEYS),
		getAppSettingsUpdatedAt(USER_DEFAULTS_SETTINGS_KEYS)
	]);

	const serverWrappedSettingsVersion =
		serverWrappedSettingsUpdatedAt?.toISOString() ?? new Date(0).toISOString();
	const userDefaultsSettingsVersion =
		userDefaultsSettingsUpdatedAt?.toISOString() ?? new Date(0).toISOString();

	const serverWrappedForm = await superValidate(
		{
			anonymizationMode,
			serverWrappedShareMode: serverWrappedShareMode === 'public' ? 'public' : 'private-oauth',
			settingsVersion: serverWrappedSettingsVersion
		},
		zod4(ServerWrappedSettingsSchema),
		{ id: 'serverWrapped' }
	);

	const userDefaultsForm = await superValidate(
		{
			defaultShareMode,
			allowUserControl,
			settingsVersion: userDefaultsSettingsVersion
		},
		zod4(UserDefaultsSettingsSchema),
		{ id: 'userDefaults' }
	);

	return {
		anonymizationMode,
		anonymizationOptions: Object.entries(AnonymizationMode).map(([key, value]) => ({
			value,
			label: key.charAt(0).toUpperCase() + key.slice(1).toLowerCase()
		})),
		globalDefaults: {
			defaultShareMode,
			allowUserControl
		},
		serverWrappedShareMode,
		serverWrappedSettingsVersion,
		userDefaultsSettingsVersion,
		serverWrappedForm,
		userDefaultsForm
	};
};

export const actions: Actions = requireAdminActions({
	updateServerWrappedSettings: async ({ request }) => {
		const form = await superValidate(request, zod4(ServerWrappedSettingsSchema), {
			id: 'serverWrapped'
		});
		if (!form.valid) {
			if (form.errors.settingsVersion?.length) {
				return fail(409, {
					form,
					conflict: true,
					error: OCC_CONFLICT_MESSAGE
				});
			}
			return fail(400, { form, error: 'Invalid input' });
		}

		if (
			(await inlineOccCheck(form.data.settingsVersion, SERVER_WRAPPED_SETTINGS_KEYS)).status ===
			'conflict'
		) {
			return fail(409, {
				form,
				conflict: true,
				error: OCC_CONFLICT_MESSAGE
			});
		}

		try {
			const result = await setServerWrappedSettingsAtomic({
				anonymizationMode: form.data.anonymizationMode as AnonymizationModeType,
				serverWrappedShareMode: form.data.serverWrappedShareMode,
				submittedVersion: form.data.settingsVersion
			});
			if (result === 'conflict') {
				return fail(409, {
					form,
					conflict: true,
					error: OCC_CONFLICT_MESSAGE
				});
			}
			return { form, success: true, message: 'Server-wide wrapped settings updated' };
		} catch (error) {
			const message =
				error instanceof Error ? error.message : 'Failed to update server-wide wrapped settings';
			return fail(500, { form, error: message });
		}
	},

	updateUserDefaults: async ({ request }) => {
		const form = await superValidate(request, zod4(UserDefaultsSettingsSchema), {
			id: 'userDefaults'
		});
		if (!form.valid) {
			if (form.errors.settingsVersion?.length) {
				return fail(409, {
					form,
					conflict: true,
					error: OCC_CONFLICT_MESSAGE
				});
			}
			return fail(400, { form, error: 'Invalid input' });
		}

		if (
			(await inlineOccCheck(form.data.settingsVersion, USER_DEFAULTS_SETTINGS_KEYS)).status ===
			'conflict'
		) {
			return fail(409, {
				form,
				conflict: true,
				error: OCC_CONFLICT_MESSAGE
			});
		}

		try {
			const result = await setUserDefaultsAtomic({
				defaultShareMode: form.data.defaultShareMode,
				allowUserControl: form.data.allowUserControl,
				submittedVersion: form.data.settingsVersion
			});
			if (result === 'conflict') {
				return fail(409, {
					form,
					conflict: true,
					error: OCC_CONFLICT_MESSAGE
				});
			}
			return { form, success: true, message: 'User sharing defaults updated' };
		} catch (error) {
			const message =
				error instanceof Error ? error.message : 'Failed to update user sharing defaults';
			return fail(500, { form, error: message });
		}
	},

	bulkApplyShareDefaults: async () => {
		try {
			const count = await bulkApplyShareDefaults();
			return { success: true, message: `Updated ${count} user share records` };
		} catch (error) {
			const message =
				error instanceof Error ? error.message : 'Failed to apply defaults to existing users';
			return fail(500, { error: message });
		}
	}
});
