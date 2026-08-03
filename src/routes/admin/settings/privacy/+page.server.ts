import { fail } from '@sveltejs/kit';
import { zod4 } from 'sveltekit-superforms/adapters';
import { superValidate } from 'sveltekit-superforms/server';
import { z } from 'zod';
import {
	inlineOccCheck,
	OCC_CONFLICT_MESSAGE,
	settingsVersionISO
} from '$lib/server/admin/occ-helpers';
import {
	type AnonymizationModeType,
	getAnonymizationMode,
	getAppSettingsUpdatedAt,
	getPublicLandingLookupEnabled,
	PRIVACY_PRESET_SECTIONS,
	type PrivacyPresetSection,
	PUBLIC_LANDING_LOOKUP_SETTINGS_KEYS,
	SERVER_WRAPPED_SETTINGS_KEYS,
	setPrivacyPresetAtomic,
	setPublicLandingLookupEnabledAtomic,
	setServerWrappedSettingsAtomic,
	setUserDefaultsAtomic,
	USER_DEFAULTS_SETTINGS_KEYS
} from '$lib/server/admin/settings.service';
import { requireAdminActions } from '$lib/server/auth/guards';
import { logger } from '$lib/server/logging';
import {
	bulkApplyShareDefaults,
	getGlobalAllowUserControl,
	getGlobalDefaultShareMode,
	getServerWrappedShareMode
} from '$lib/server/sharing/service';
import {
	anonymizationOptions,
	DEFAULT_PRIVACY_PRESET_ID,
	PRIVACY_PRESET_IDS,
	PRIVACY_PRESETS,
	serverWrappedShareModeOptions,
	shareModeOptions
} from '$lib/sharing/options';
import type { Actions, PageServerLoad } from './$types';

/**
 * OCC strategy: INLINE `settingsVersion` for both forms (z.object). Each
 * nested-route owns its own schemas — the shared-module consolidation that
 * was tentatively planned during US-020 didn't materialise because the
 * six tabs settled on different shapes (Superforms vs use:enhance, z.object
 * vs z.enum, inline vs external OCC). Schema co-location with its consuming
 * action stays the cleanest layout post-US-022.
 */
/**
 * OCC strategy: INHERITED FROM PARENT. Consumed inside `ServerWrappedSettingsSchema`
 * (z.object), which carries the inline `settingsVersion`. Per v3 plan §A5 Table D2.
 */
const AnonymizationSchema = z.enum(['real', 'anonymous', 'hybrid']);

/**
 * OCC strategy: INHERITED FROM PARENT. Server-wide wrapped supports only
 * `public` and `private-oauth` (not `private-link`). The inline settingsVersion
 * lives on `ServerWrappedSettingsSchema`.
 */
const ServerWrappedModeSchema = z.enum(['public', 'private-oauth']);

/**
 * OCC strategy: INHERITED FROM PARENT. Per-user defaults are broader than
 * server-wide — `private-link` is allowed. Inline settingsVersion lives on
 * `UserDefaultsSettingsSchema`.
 */
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

/**
 * OCC strategy: INLINE `settingsVersion`. Parent schema for the
 * server-wide wrapped settings form. `superValidate` infers the input
 * type from this shape; the Superforms-driven action validates blank
 * settingsVersion via Zod min(1) and stale via `inlineOccCheck` against
 * `SERVER_WRAPPED_SETTINGS_KEYS`. The atomic write through
 * `setServerWrappedSettingsAtomic` does a second OCC check inside the
 * SQLite transaction to catch same-ms collisions.
 */
const ServerWrappedSettingsSchema = z.object({
	anonymizationMode: AnonymizationSchema,
	serverWrappedShareMode: ServerWrappedModeSchema,
	settingsVersion: z.string().min(1, 'Missing settings version (reload the page)')
});

/**
 * OCC strategy: INLINE `settingsVersion`. Parent schema for the user
 * sharing defaults form. allowUserControl uses `FormBooleanSchema` so
 * unexpected strings like 'on' fail validation. Same two-stage OCC
 * (Zod min(1) + inlineOccCheck + transactional check in
 * `setUserDefaultsAtomic`) as ServerWrappedSettingsSchema above.
 */
const UserDefaultsSettingsSchema = z.object({
	defaultShareMode: ShareModeSchema,
	allowUserControl: FormBooleanSchema,
	settingsVersion: z.string().min(1, 'Missing settings version (reload the page)')
});

/**
 * OCC strategy: INLINE `settingsVersion` over its OWN single-key group
 * (`PUBLIC_LANDING_LOOKUP_SETTINGS_KEYS`). Kept as a separate form + action from
 * the server-wide and user-default forms so the three privacy controls never
 * false-409 one another. Reuses `FormBooleanSchema` so a stray 'on' fails
 * validation rather than silently flipping a privacy toggle. Same two-stage OCC
 * (Zod min(1) + inlineOccCheck + transactional check in
 * `setPublicLandingLookupEnabledAtomic`) as the two schemas above.
 */
const PublicLandingLookupSchema = z.object({
	publicLandingLookup: FormBooleanSchema,
	settingsVersion: z.string().min(1, 'Missing settings version (reload the page)')
});

/**
 * Human-readable section names for the cross-group conflict message. Match the
 * card titles on the route so an admin can find the section that moved.
 */
const PRESET_SECTION_LABELS: Record<PrivacyPresetSection, string> = {
	serverWrapped: 'Server-wide wrapped sharing',
	userDefaults: 'User sharing defaults',
	publicLandingLookup: 'Public landing lookup'
};

/**
 * Conflict copy for `applyPrivacyPreset`. Keeps `OCC_CONFLICT_MESSAGE` intact as
 * the leading sentinel (`surfaceOccConflict` surfaces `error` verbatim, and the
 * suite asserts the sentinel), then states the two things a generic OCC message
 * cannot: that the apply is all-or-nothing so NOTHING was written, and which
 * sections changed underneath the tab.
 */
function presetConflictMessage(staleSections: readonly PrivacyPresetSection[]): string {
	const names = staleSections.map((section) => PRESET_SECTION_LABELS[section]).join(', ');
	return `${OCC_CONFLICT_MESSAGE} Nothing was applied — changed since this page loaded: ${names}.`;
}

/**
 * OCC strategy: THREE INLINE versions, one per group the preset spans. A preset is
 * one coherent privacy posture written across all three sections at once, so the
 * form carries `serverWrappedVersion` / `userDefaultsVersion` /
 * `publicLandingLookupVersion` and the action refuses the WHOLE apply if any one
 * of them is stale — `setPrivacyPresetAtomic` gates all three inside a single
 * transaction and writes nothing on conflict, so a partial apply is unreachable.
 *
 * `presetId` is the shipped-preset enum only. The client-only `custom` card has no
 * value-map by definition, so it can never reach this action; a POST claiming it
 * fails validation as a 400.
 *
 * The enum is `.optional()` on purpose. Superforms infers a required enum's default
 * as its FIRST member, so a POST that simply omits `presetId` would otherwise pass
 * validation and silently apply Maximum Privacy — a missing discriminator must
 * never pick a privacy posture. Optional makes both an absent field and an empty
 * value arrive as `undefined`, which the action rejects with a 400 before any write.
 */
const PrivacyPresetApplySchema = z.object({
	presetId: z.enum(PRIVACY_PRESET_IDS).optional(),
	serverWrappedVersion: z.string().min(1, 'Missing settings version (reload the page)'),
	userDefaultsVersion: z.string().min(1, 'Missing settings version (reload the page)'),
	publicLandingLookupVersion: z.string().min(1, 'Missing settings version (reload the page)')
});

export const load: PageServerLoad = async () => {
	const [
		anonymizationMode,
		defaultShareMode,
		allowUserControl,
		serverWrappedShareMode,
		publicLandingLookupEnabled,
		serverWrappedSettingsUpdatedAt,
		userDefaultsSettingsUpdatedAt,
		publicLandingLookupUpdatedAt
	] = await Promise.all([
		getAnonymizationMode(),
		getGlobalDefaultShareMode(),
		getGlobalAllowUserControl(),
		getServerWrappedShareMode(),
		getPublicLandingLookupEnabled(),
		getAppSettingsUpdatedAt(SERVER_WRAPPED_SETTINGS_KEYS),
		getAppSettingsUpdatedAt(USER_DEFAULTS_SETTINGS_KEYS),
		getAppSettingsUpdatedAt(PUBLIC_LANDING_LOOKUP_SETTINGS_KEYS)
	]);

	const serverWrappedSettingsVersion = settingsVersionISO(serverWrappedSettingsUpdatedAt);
	const userDefaultsSettingsVersion = settingsVersionISO(userDefaultsSettingsUpdatedAt);
	const publicLandingLookupSettingsVersion = settingsVersionISO(publicLandingLookupUpdatedAt);

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

	const publicLandingLookupForm = await superValidate(
		{
			publicLandingLookup: publicLandingLookupEnabled,
			settingsVersion: publicLandingLookupSettingsVersion
		},
		zod4(PublicLandingLookupSchema),
		{ id: 'publicLandingLookup' }
	);

	// Submission channel for the "apply preset" write. `presetId` is seeded with the
	// shipped default only so the enum validates on load; the value that is actually
	// submitted is the highlighted card, rendered into the form's hidden input. The
	// three version fields mirror the sections' own `settingsVersion` values, so one
	// submit can gate all three OCC groups.
	const presetForm = await superValidate(
		{
			presetId: DEFAULT_PRIVACY_PRESET_ID,
			serverWrappedVersion: serverWrappedSettingsVersion,
			userDefaultsVersion: userDefaultsSettingsVersion,
			publicLandingLookupVersion: publicLandingLookupSettingsVersion
		},
		zod4(PrivacyPresetApplySchema),
		{ id: 'privacyPreset' }
	);

	return {
		anonymizationMode,
		// Option copy is sourced from the shared module so onboarding and settings
		// never drift. Icons stay route-local (chosen per value in the template).
		anonymizationOptions,
		shareModeOptions,
		serverWrappedShareModeOptions,
		globalDefaults: {
			defaultShareMode,
			allowUserControl
		},
		serverWrappedShareMode,
		serverWrappedSettingsVersion,
		userDefaultsSettingsVersion,
		publicLandingLookupSettingsVersion,
		serverWrappedForm,
		userDefaultsForm,
		publicLandingLookupForm,
		presetForm
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
			if (result.status === 'conflict') {
				return fail(409, {
					form,
					conflict: true,
					error: OCC_CONFLICT_MESSAGE
				});
			}
			// ISSUE-004: advance the returned settingsVersion so a second consecutive
			// save in the same page load isn't false-409'd. Use the timestamp the
			// transaction actually wrote rather than a post-write
			// `getAppSettingsUpdatedAt` re-read — that re-read could observe a
			// concurrent writer's newer version and let the client's next stale save
			// pass OCC (TOCTOU).
			form.data.settingsVersion = settingsVersionISO(result.version);
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
			if (result.status === 'conflict') {
				return fail(409, {
					form,
					conflict: true,
					error: OCC_CONFLICT_MESSAGE
				});
			}
			// ISSUE-004: advance the returned settingsVersion so a second consecutive
			// save in the same page load isn't false-409'd. Use the timestamp the
			// transaction actually wrote rather than a post-write
			// `getAppSettingsUpdatedAt` re-read (TOCTOU — see updateServerWrappedSettings).
			form.data.settingsVersion = settingsVersionISO(result.version);
			return { form, success: true, message: 'User sharing defaults updated' };
		} catch (error) {
			const message =
				error instanceof Error ? error.message : 'Failed to update user sharing defaults';
			return fail(500, { form, error: message });
		}
	},

	updatePublicLandingLookup: async ({ request }) => {
		const form = await superValidate(request, zod4(PublicLandingLookupSchema), {
			id: 'publicLandingLookup'
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
			(await inlineOccCheck(form.data.settingsVersion, PUBLIC_LANDING_LOOKUP_SETTINGS_KEYS))
				.status === 'conflict'
		) {
			return fail(409, {
				form,
				conflict: true,
				error: OCC_CONFLICT_MESSAGE
			});
		}

		try {
			const result = await setPublicLandingLookupEnabledAtomic({
				enabled: form.data.publicLandingLookup,
				submittedVersion: form.data.settingsVersion
			});
			if (result.status === 'conflict') {
				return fail(409, {
					form,
					conflict: true,
					error: OCC_CONFLICT_MESSAGE
				});
			}
			// ISSUE-004: advance the returned settingsVersion so a second consecutive
			// save in the same page load isn't false-409'd. Use the timestamp the
			// transaction actually wrote rather than a post-write
			// `getAppSettingsUpdatedAt` re-read (TOCTOU — see updateServerWrappedSettings).
			form.data.settingsVersion = settingsVersionISO(result.version);
			return { form, success: true, message: 'Public landing lookup updated' };
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			logger.error(`Failed to update public landing lookup: ${message}`, 'Privacy');
			return fail(500, { form, error: 'Failed to update public landing lookup' });
		}
	},

	/**
	 * Applies one shipped privacy preset across ALL THREE sections in a single
	 * atomic write.
	 *
	 * Why this action exists: a preset spans three independently-saved OCC groups
	 * (`updateServerWrappedSettings`, `updatePublicLandingLookup`,
	 * `updateUserDefaults`). Clicking a preset card used to only stage client-side
	 * values, so Balanced → Custom → Balanced looked applied while the section that
	 * actually changed stayed unsaved until the admin found its own Save button.
	 *
	 * Partial-conflict policy: the whole apply is refused, and nothing is written.
	 * The pre-write `inlineOccCheck`s below and the second gate inside
	 * `setPrivacyPresetAtomic` both evaluate all three groups before any row is
	 * touched, so there is no state in which one section applied and another did
	 * not. The 409 names every section that changed underneath the tab.
	 *
	 * `logoMode` is not in scope: it lives on the Appearance route and its own OCC
	 * group, and admin preset matching covers only the five fields this route owns.
	 */
	applyPrivacyPreset: async ({ request }) => {
		const form = await superValidate(request, zod4(PrivacyPresetApplySchema), {
			id: 'privacyPreset'
		});
		if (!form.valid) {
			const versionErrors = [
				form.errors.serverWrappedVersion,
				form.errors.userDefaultsVersion,
				form.errors.publicLandingLookupVersion
			];
			if (versionErrors.some((errors) => errors?.length)) {
				return fail(409, {
					form,
					conflict: true,
					error: OCC_CONFLICT_MESSAGE
				});
			}
			return fail(400, { form, error: 'Invalid input' });
		}

		const preset = PRIVACY_PRESETS.find((candidate) => candidate.id === form.data.presetId);
		if (!preset) {
			// Reached when `presetId` is absent or empty (see the schema's `.optional()`
			// note), and it would also catch an id added to PRIVACY_PRESET_IDS without a
			// matching value-map — failing loudly instead of writing undefined values.
			return fail(400, { form, error: 'Invalid input' });
		}

		const submittedVersions: Record<PrivacyPresetSection, string> = {
			serverWrapped: form.data.serverWrappedVersion,
			userDefaults: form.data.userDefaultsVersion,
			publicLandingLookup: form.data.publicLandingLookupVersion
		};

		const preChecks = await Promise.all([
			inlineOccCheck(submittedVersions.serverWrapped, SERVER_WRAPPED_SETTINGS_KEYS),
			inlineOccCheck(submittedVersions.userDefaults, USER_DEFAULTS_SETTINGS_KEYS),
			inlineOccCheck(submittedVersions.publicLandingLookup, PUBLIC_LANDING_LOOKUP_SETTINGS_KEYS)
		]);
		const sections: PrivacyPresetSection[] = [
			PRIVACY_PRESET_SECTIONS.SERVER_WRAPPED,
			PRIVACY_PRESET_SECTIONS.USER_DEFAULTS,
			PRIVACY_PRESET_SECTIONS.PUBLIC_LANDING_LOOKUP
		];
		const staleBeforeWrite = sections.filter(
			(_section, index) => preChecks[index]?.status === 'conflict'
		);
		if (staleBeforeWrite.length > 0) {
			return fail(409, {
				form,
				conflict: true,
				error: presetConflictMessage(staleBeforeWrite)
			});
		}

		try {
			const result = await setPrivacyPresetAtomic({
				anonymizationMode: preset.values.anonymizationMode as AnonymizationModeType,
				serverWrappedShareMode: preset.values.serverWrappedShareMode,
				defaultShareMode: preset.values.defaultShareMode,
				allowUserControl: preset.values.allowUserControl,
				publicLandingLookup: preset.values.publicLandingLookup,
				submittedVersions
			});
			if (result.status === 'conflict') {
				return fail(409, {
					form,
					conflict: true,
					error: presetConflictMessage(result.staleSections)
				});
			}
			// ISSUE-004: hand every section the version the transaction actually wrote,
			// so each one's own Save button still works afterwards without a reload.
			// One shared timestamp — the write covered all three groups at once.
			const version = settingsVersionISO(result.version);
			form.data.serverWrappedVersion = version;
			form.data.userDefaultsVersion = version;
			form.data.publicLandingLookupVersion = version;
			return {
				form,
				success: true,
				message: `Applied the ${preset.label} preset`
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			logger.error(`Failed to apply privacy preset: ${message}`, 'Privacy');
			return fail(500, { form, error: 'Failed to apply the privacy preset' });
		}
	},

	bulkApplyShareDefaults: async () => {
		try {
			const { updated, skipped } = await bulkApplyShareDefaults();
			const updatedPart = `Updated ${updated} user share record${updated === 1 ? '' : 's'}`;
			const skippedPart =
				skipped > 0 ? `; skipped ${skipped} with an explicit per-user override` : '';
			const message =
				updated === 0 && skipped === 0
					? 'No users needed to be updated'
					: `${updatedPart}${skippedPart}`;
			return { form: null, success: true, message };
		} catch (error) {
			const message =
				error instanceof Error ? error.message : 'Failed to apply defaults to existing users';
			return fail(500, { form: null, error: message });
		}
	}
});
