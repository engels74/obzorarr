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
 * Privacy trust is the top constraint: `derivePreview` names each independently
 * controlled Wrapped surface and never implies that “public” opens protected
 * dashboards, settings, or administration.
 */
import {
	DEFAULT_PRIVACY_PRESET_ID,
	PRIVACY_PRESETS,
	type PrivacyPresetId,
	type PrivacyPresetPrivacyKey,
	type PrivacyPresetValues,
	type WrappedLogoOptionValue
} from '$lib/sharing/options';

export type PrivacyPresetMatch = PrivacyPresetId | 'custom';

/**
 * Whether the onboarding privacy step should show the "Custom configuration —
 * your choices don't match a preset" note.
 *
 * On a fresh install the seeded values can incidentally resolve to `'custom'`
 * (the raw defaults match no shipped preset) before the admin touches anything.
 * Showing the "your choices don't match a preset" note in that untouched state
 * is misleading — the admin hasn't made any choices yet (ISSUE-001). The note is
 * therefore gated on interaction: it appears only once the admin has picked a
 * preset card or edited an Advanced Option AND the live values still match no
 * preset.
 */
export function shouldShowCustomPresetNote(
	selectedPreset: PrivacyPresetMatch,
	hasInteracted: boolean
): boolean {
	return selectedPreset === 'custom' && hasInteracted;
}

/**
 * Which preset card renders as SELECTED, or `null` when no card is selected.
 *
 * Three inputs, because the visual selection is not simply the derived match:
 *
 * - `match` — what the live field values resolve to ('custom' when they match no
 *   shipped preset).
 * - `hasInteracted` — the `privacyTouched` gate. On a fresh install the seeded
 *   defaults can incidentally resolve to `'custom'` before the admin touches
 *   anything (ISSUE-001, see {@link shouldShowCustomPresetNote}); the Custom card
 *   must not light up there either, so an untouched `'custom'` selects NO card —
 *   exactly the pre-Custom-card behaviour.
 * - `customChosen` — the sticky "admin explicitly clicked Custom" flag. It wins
 *   over `match` so the highlight does not immediately snap back to a shipped
 *   preset: in onboarding because clicking Custom seeds the Balanced values, and
 *   on the admin route because the saved configuration may already match a preset
 *   while the click itself stages nothing. Clicking any of the five real cards
 *   clears it.
 */
export function resolvePresetSelection(
	match: PrivacyPresetMatch,
	hasInteracted: boolean,
	customChosen: boolean
): PrivacyPresetMatch | null {
	if (match !== 'custom' && !customChosen) return match;
	return hasInteracted ? 'custom' : null;
}

/**
 * The values the Custom card seeds when it is clicked, or `null` when the click
 * must not mutate anything.
 *
 * ONBOARDING-ONLY rule. Seeding happens on the first interaction of the session:
 * Custom then acts as "start from the recommended baseline and tweak it". Once
 * the admin has interacted — whether they are sitting on a shipped preset or have
 * already diverged from one — clicking Custom is a pure highlight change and must
 * leave every Advanced setting exactly as it is.
 *
 * `hasInteracted` must therefore be a MONOTONIC session flag, which is only true
 * of onboarding's `let privacyTouched = $state(false)`. The admin privacy route
 * derives its gate from `unsavedSectionCount`, so it drops back to false after a
 * successful save and starts false for a persisted off-preset configuration;
 * seeding there would overwrite real saved settings. Admin consequently never
 * calls this helper — its Custom card stages nothing.
 */
export function customPresetSeedValues(hasInteracted: boolean): PrivacyPresetValues | null {
	if (hasInteracted) return null;
	return PRIVACY_PRESETS.find((preset) => preset.id === DEFAULT_PRIVACY_PRESET_ID)?.values ?? null;
}

/**
 * Onboarding owns all six privacy fields in one atomic form, including
 * `logoMode`, so its preset match must include the full value set.
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
 * - `landingLookupForm` — whether anonymous visitors can search for eligible
 *   current-year personal Wrapped pages. Enabling it also establishes the
 *   current-year public default enforced by the server.
 * - `serverRecapVisibility` — who can view the aggregate server-wide `/wrapped`
 *   recap. This does not affect protected application surfaces.
 * - `perUserDefaultForNewUsers` — the ordinary personal-link baseline followed
 *   by new and default-managed users. Explicit rows retain their stored choice.
 * - `nameDisplay` — how usernames appear, mirroring anonymization (including the
 *   hybrid "self sees own name" nuance).
 * - `logoVisibility` — OPTIONAL. Present only when `logoMode` is supplied
 *   (onboarding). Admin omits it (logoMode is managed on a different route).
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
