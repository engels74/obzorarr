/**
 * Pure, client-safe privacy-preset logic — the match + preview functions shared
 * by the onboarding privacy step and the admin privacy page.
 *
 * Companion to `src/lib/sharing/options.ts` (which holds the preset *data* +
 * types). Like that module, this file imports nothing from `$lib/server/**`; it
 * is pure logic over the client-safe option value-types. Each page binds these
 * functions to its own state source (onboarding `$state` runes vs. admin
 * Superform stores) and renders the result in its own idiom.
 *
 * Privacy trust is the top constraint: `derivePreview` deliberately separates
 * admin-controlled *form/recap visibility* from *per-user effective
 * reachability* (the server-side `getEffectiveShareMode` floor, which admin
 * defaults do NOT override), so the preview can never overstate exposure.
 */
import {
	PRIVACY_PRESETS,
	type PrivacyPresetId,
	type PrivacyPresetPrivacyKey,
	type PrivacyPresetValues,
	publicLandingLookupCopy,
	type WrappedLogoOptionValue
} from '$lib/sharing/options';

/** Result of a preset match: a known preset id, or `'custom'` for any off-map combination. */
export type PrivacyPresetMatch = PrivacyPresetId | 'custom';

/**
 * Match the full six-field value set against the shipped presets. Used by
 * ONBOARDING, which owns all six fields (including `logoMode`) in one atomic
 * form. Returns the matching preset id, or `'custom'` if no preset matches.
 * Field order is irrelevant — comparison is key-by-key.
 */
export function matchPresetFull(values: PrivacyPresetValues): PrivacyPresetMatch {
	for (const preset of PRIVACY_PRESETS) {
		const p = preset.values;
		if (
			p.anonymizationMode === values.anonymizationMode &&
			p.defaultShareMode === values.defaultShareMode &&
			p.serverWrappedShareMode === values.serverWrappedShareMode &&
			p.publicLandingLookup === values.publicLandingLookup &&
			p.allowUserControl === values.allowUserControl &&
			p.logoMode === values.logoMode
		) {
			return preset.id;
		}
	}
	return 'custom';
}

/**
 * Match only the five admin-owned fields (everything except `logoMode`) against
 * the shipped presets. Used by ADMIN, whose privacy route does NOT own
 * `logoMode` (it lives on the Appearance route / a separate OCC group).
 *
 * Excluding `logoMode` fixes the trap where a perfect five-field match would
 * otherwise read `'custom'` because the persisted logoMode (commonly
 * `user_choice`) differs from a preset's logo value.
 */
export function matchPresetPrivacy(
	values: Pick<PrivacyPresetValues, PrivacyPresetPrivacyKey>
): PrivacyPresetMatch {
	for (const preset of PRIVACY_PRESETS) {
		const p = preset.values;
		if (
			p.anonymizationMode === values.anonymizationMode &&
			p.defaultShareMode === values.defaultShareMode &&
			p.serverWrappedShareMode === values.serverWrappedShareMode &&
			p.publicLandingLookup === values.publicLandingLookup &&
			p.allowUserControl === values.allowUserControl
		) {
			return preset.id;
		}
	}
	return 'custom';
}

/**
 * Skin-agnostic preview of what a privacy configuration exposes. Rendered
 * per-page in each flow's own markup. Each field is scoped precisely so the
 * preview never overstates exposure or privacy:
 *
 * - `landingLookupForm` — whether the landing page shows the username lookup
 *   FORM. Admin-controlled (the `publicLandingLookup` toggle). Showing the form
 *   never makes a non-public Wrapped reachable — the server still 404s those.
 * - `serverRecapVisibility` — who can view the server-wide `/wrapped` recap.
 *   Admin-controlled (`serverWrappedShareMode`).
 * - `perUserDefaultForNewUsers` — the default share mode applied to NEW users.
 *   Explicitly labeled "for new users": it does NOT change existing/private
 *   users, and the model never claims an existing private user becomes reachable.
 * - `nameDisplay` — how usernames appear, mirroring anonymization (including the
 *   hybrid "self sees own name" nuance).
 * - `logoVisibility` — OPTIONAL. Present only when `logoMode` is supplied
 *   (onboarding). Admin omits it (logoMode is managed on a different route).
 * - `warnings` — surfaced contradiction copy, e.g. landing lookup on while the
 *   default is non-public.
 */
export interface PrivacyPreviewModel {
	landingLookupForm: 'visible' | 'hidden';
	serverRecapVisibility: 'public' | 'members-only';
	perUserDefaultForNewUsers: 'public' | 'members-only' | 'private-link';
	nameDisplay: 'real' | 'anonymous' | 'hybrid-self-sees-own';
	logoVisibility?: 'always-show' | 'always-hide' | 'user-choice';
	warnings: string[];
}

const SHARE_MODE_TO_PER_USER: Record<
	PrivacyPresetValues['defaultShareMode'],
	PrivacyPreviewModel['perUserDefaultForNewUsers']
> = {
	public: 'public',
	'private-oauth': 'members-only',
	'private-link': 'private-link'
};

const ANONYMIZATION_TO_NAME_DISPLAY: Record<
	PrivacyPresetValues['anonymizationMode'],
	PrivacyPreviewModel['nameDisplay']
> = {
	real: 'real',
	anonymous: 'anonymous',
	hybrid: 'hybrid-self-sees-own'
};

const LOGO_MODE_TO_VISIBILITY: Record<
	WrappedLogoOptionValue,
	NonNullable<PrivacyPreviewModel['logoVisibility']>
> = {
	always_show: 'always-show',
	always_hide: 'always-hide',
	user_choice: 'user-choice'
};

/**
 * Derive a {@link PrivacyPreviewModel} from a privacy configuration.
 *
 * `logoMode` is OPTIONAL: when supplied (onboarding) `logoVisibility` is
 * populated and the consumer renders a logo line; when omitted (admin)
 * `logoVisibility` stays `undefined` and the consumer renders no logo line —
 * which is why the admin privacy page needs no logoMode wiring at all.
 */
export function derivePreview(
	values: Omit<PrivacyPresetValues, 'logoMode'> & { logoMode?: WrappedLogoOptionValue }
): PrivacyPreviewModel {
	const warnings: string[] = [];

	// Landing lookup on while the default is non-public: the form shows but every
	// lookup 404s until users opt into public sharing. Mirrors the live warning
	// both flows already surface; sourced from the shared copy module.
	if (values.publicLandingLookup && values.defaultShareMode !== 'public') {
		warnings.push(publicLandingLookupCopy.contradictionWarning);
	}

	const model: PrivacyPreviewModel = {
		landingLookupForm: values.publicLandingLookup ? 'visible' : 'hidden',
		serverRecapVisibility: values.serverWrappedShareMode === 'public' ? 'public' : 'members-only',
		perUserDefaultForNewUsers: SHARE_MODE_TO_PER_USER[values.defaultShareMode],
		nameDisplay: ANONYMIZATION_TO_NAME_DISPLAY[values.anonymizationMode],
		warnings
	};

	if (values.logoMode !== undefined) {
		model.logoVisibility = LOGO_MODE_TO_VISIBILITY[values.logoMode];
	}

	return model;
}

/**
 * Human-readable labels for {@link PrivacyPreviewModel} fields, shared by both
 * the onboarding and admin preview UIs so the wording can't drift between flows
 * (the same reason option copy lives in `options.ts`). Keyed by the model's own
 * union types, so a new model value fails to compile until a label is added.
 */
export const PREVIEW_NAME_DISPLAY_LABELS: Record<PrivacyPreviewModel['nameDisplay'], string> = {
	real: 'Real usernames',
	anonymous: 'Anonymous (hidden)',
	'hybrid-self-sees-own': 'Hybrid — each sees their own name'
};

export const PREVIEW_RECAP_VISIBILITY_LABELS: Record<
	PrivacyPreviewModel['serverRecapVisibility'],
	string
> = {
	public: 'Anyone can view',
	'members-only': 'Server members only'
};

export const PREVIEW_PER_USER_DEFAULT_LABELS: Record<
	PrivacyPreviewModel['perUserDefaultForNewUsers'],
	string
> = {
	public: 'Public',
	'members-only': 'Server members only',
	'private-link': 'Private link'
};

export const PREVIEW_LOGO_VISIBILITY_LABELS: Record<
	NonNullable<PrivacyPreviewModel['logoVisibility']>,
	string
> = {
	'always-show': 'Always shown',
	'always-hide': 'Always hidden',
	'user-choice': 'Each user chooses'
};
