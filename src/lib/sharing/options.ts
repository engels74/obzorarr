/**
 * Shared, client-safe option COPY + preset value-maps for privacy / sharing controls.
 *
 * This is the single source of truth for the user-visible *strings* (label +
 * description) shown in BOTH the onboarding privacy step and the admin settings
 * pages, so the two flows can never drift apart again. It also holds the
 * client-safe privacy *preset* value-maps ({@link PRIVACY_PRESETS}) consumed by
 * both flows; the pure preset logic (match + preview) lives in the sibling
 * `src/lib/sharing/preset-logic.ts`.
 *
 * Scope is copy + client-safe preset value-maps — deliberately NOT Zod schemas.
 * A preset is a client-only control surface: it selects existing fields, it is
 * never a persisted DB key nor a submitted form field. Each route keeps its own
 * schema and submission model co-located (Superforms vs `use:enhance`, `z.object`
 * vs `z.enum`, inline vs external OCC), as documented in
 * `src/routes/admin/settings/privacy/+page.server.ts`. We only share text + presets.
 *
 * Client boundary: this module imports nothing from `$lib/server/**`. It pulls
 * `ShareMode` from `$lib/sharing/types` (a pure constant map, no server imports)
 * so the share-mode values stay type-checked. The anonymization and logo values
 * are string literals that MUST match the server enums `AnonymizationMode` /
 * `WrappedLogoMode` in `settings.service.ts`; a unit test cross-checks that every
 * server enum value has exactly one entry here so drift fails CI rather than
 * shipping silently.
 */
import { ShareMode, type ShareModeType } from '$lib/sharing/types';

export interface OptionCopy<V extends string = string> {
	value: V;
	label: string;
	description: string;
}

/** Anonymization mode values — mirror `AnonymizationMode` in settings.service.ts. */
export type AnonymizationOptionValue = 'real' | 'anonymous' | 'hybrid';

/** Wrapped logo mode values — mirror `WrappedLogoMode` in settings.service.ts. */
export type WrappedLogoOptionValue = 'always_show' | 'always_hide' | 'user_choice';

/** Server-wide wrapped share mode — only public | private-oauth (no private-link). */
export type ServerWrappedShareModeValue = 'public' | 'private-oauth';

/**
 * Per-user default share mode (all three modes). Used by the user-sharing-defaults
 * control in both settings and onboarding.
 */
export const shareModeOptions: OptionCopy<ShareModeType>[] = [
	{
		value: ShareMode.PUBLIC,
		label: 'Public',
		description: 'Anyone with the link can view'
	},
	{
		value: ShareMode.PRIVATE_OAUTH,
		label: 'Server Members Only',
		description: 'Only authenticated Plex server members can view'
	},
	{
		value: ShareMode.PRIVATE_LINK,
		label: 'Private Link',
		description: 'Requires a unique share token'
	}
];

/**
 * Server-wide wrapped recap share mode. Narrower than {@link shareModeOptions}:
 * the server-wide `/wrapped` recap supports only public and server-members-only.
 */
export const serverWrappedShareModeOptions: OptionCopy<ServerWrappedShareModeValue>[] = [
	{
		value: 'public',
		label: 'Public',
		description: 'Anyone can view the server-wide Wrapped recap'
	},
	{
		value: 'private-oauth',
		label: 'Server Members Only',
		description: 'Only authenticated Plex server members can view the recap'
	}
];

export const anonymizationOptions: OptionCopy<AnonymizationOptionValue>[] = [
	{
		value: 'real',
		label: 'Real Names',
		description: 'Show actual usernames in server-wide stats'
	},
	{
		value: 'anonymous',
		label: 'Anonymous',
		description: 'Hide all usernames (e.g., "User #1", "User #2")'
	},
	{
		value: 'hybrid',
		label: 'Hybrid',
		description: 'Users see their own name; everyone else is anonymized'
	}
];

export const wrappedLogoOptions: OptionCopy<WrappedLogoOptionValue>[] = [
	{
		value: 'always_show',
		label: 'Always Show',
		description: 'Logo always visible on Wrapped pages'
	},
	{
		value: 'always_hide',
		label: 'Always Hide',
		description: 'Logo hidden on all Wrapped pages'
	},
	{
		value: 'user_choice',
		label: 'User Choice',
		description: 'Users can toggle logo visibility'
	}
];

/**
 * Copy for the public-landing-lookup toggle (the new dedicated admin setting).
 * `contradictionWarning` is surfaced in both settings and onboarding when the
 * toggle is on while the default share mode is non-public — visitors would see
 * the lookup form but every lookup would 404 until at least one Wrapped is set to public sharing.
 */
export const publicLandingLookupCopy = {
	label: 'Allow public Wrapped lookup on the landing page',
	helper:
		'Show a username field on the landing page so anyone can look up a public Wrapped without signing in.',
	enabledDescription:
		'The landing page shows a username lookup field. Only Wrapped pages set to "Public" are reachable this way.',
	disabledDescription:
		'The landing page hides the lookup field and shows a "Sign in with Plex" button instead.',
	contradictionWarning:
		'Public lookup is on, but your default share mode is non-public — visitors will not find any Wrapped until at least one Wrapped is set to public sharing.'
} as const;

// ============================================================================
// Privacy presets (client-only control surface)
// ============================================================================

/**
 * Privacy preset identifiers. A preset bundles a recommended combination of the
 * existing privacy/sharing fields behind one visual card. Presets are NEVER a
 * persisted field — selecting one just mutates the existing form state; the
 * active preset is recomputed from field values on load (see `preset-logic.ts`).
 */
export type PrivacyPresetId =
	| 'maximum-privacy'
	| 'internal-community'
	| 'balanced'
	| 'public-showcase'
	| 'anonymous-public';

/**
 * The exact set of fields a preset configures. EXACTLY six keys, mirroring the
 * six privacy/sharing fields the onboarding privacy step owns. Each value type
 * is the shared client-safe option value-type so the maps stay type-checked
 * against the server enums (a drift test enforces enum membership at CI time).
 */
export interface PrivacyPresetValues {
	anonymizationMode: AnonymizationOptionValue;
	defaultShareMode: ShareModeType;
	serverWrappedShareMode: ServerWrappedShareModeValue;
	publicLandingLookup: boolean;
	allowUserControl: boolean;
	logoMode: WrappedLogoOptionValue;
}

/**
 * The five preset keys the ADMIN privacy route owns — every field except
 * `logoMode`, which lives on the separate Appearance route / OCC group. Admin
 * matching ({@link matchPresetPrivacy} in `preset-logic.ts`) compares only these
 * so a perfect 5-field match isn't dragged to "Custom" by a differing persisted
 * logoMode (commonly `user_choice`).
 */
export type PrivacyPresetPrivacyKey = Exclude<keyof PrivacyPresetValues, 'logoMode'>;

export interface PrivacyPreset {
	id: PrivacyPresetId;
	label: string;
	description: string;
	/** One-line plain-language summary of what this preset exposes. */
	exposureSummary: string;
	values: PrivacyPresetValues;
}

/**
 * The shipped privacy presets. Field order in each `values` map mirrors the
 * documented order: anonymizationMode / defaultShareMode / serverWrappedShareMode
 * / publicLandingLookup / allowUserControl / logoMode.
 *
 * Note: "Balanced" ships with `publicLandingLookup: false` (a clean first-run,
 * members-only default that exposes nothing to anonymous visitors), so no shipped
 * preset trips the landing-lookup contradiction warning — that path is still
 * reachable (and tested) via a custom combination.
 */
export const PRIVACY_PRESETS: PrivacyPreset[] = [
	{
		id: 'maximum-privacy',
		label: 'Maximum Privacy',
		description: 'Everything locked down. Usernames hidden, nothing public, no landing lookup.',
		exposureSummary: 'Anonymous stats, server-members-only recap, no public exposure.',
		values: {
			anonymizationMode: 'anonymous',
			defaultShareMode: ShareMode.PRIVATE_OAUTH,
			serverWrappedShareMode: 'private-oauth',
			publicLandingLookup: false,
			allowUserControl: false,
			logoMode: 'always_hide'
		}
	},
	{
		id: 'internal-community',
		label: 'Internal Community',
		description: 'Real names for your members, but nothing exposed to the public web.',
		exposureSummary: 'Real names, server-members-only, users control their own sharing.',
		values: {
			anonymizationMode: 'real',
			defaultShareMode: ShareMode.PRIVATE_OAUTH,
			serverWrappedShareMode: 'private-oauth',
			publicLandingLookup: false,
			allowUserControl: true,
			logoMode: 'user_choice'
		}
	},
	{
		id: 'balanced',
		label: 'Balanced',
		description: 'Recommended default. Members see their own name; nothing is public by default.',
		exposureSummary: 'Hybrid names, members-only recap, users control their own sharing.',
		values: {
			anonymizationMode: 'hybrid',
			defaultShareMode: ShareMode.PRIVATE_OAUTH,
			serverWrappedShareMode: 'private-oauth',
			publicLandingLookup: false,
			allowUserControl: true,
			logoMode: 'user_choice'
		}
	},
	{
		id: 'public-showcase',
		label: 'Public Showcase',
		description: 'Share everything publicly with real names and a public landing lookup.',
		exposureSummary: 'Real names, public recap + landing lookup, users control their sharing.',
		values: {
			anonymizationMode: 'real',
			defaultShareMode: ShareMode.PUBLIC,
			serverWrappedShareMode: 'public',
			publicLandingLookup: true,
			allowUserControl: true,
			logoMode: 'always_show'
		}
	},
	{
		id: 'anonymous-public',
		label: 'Anonymous Public',
		description: 'Public stats, but every username stays anonymous and locked.',
		exposureSummary: 'Anonymous names (forced), public recap + landing lookup.',
		values: {
			anonymizationMode: 'anonymous',
			defaultShareMode: ShareMode.PUBLIC,
			serverWrappedShareMode: 'public',
			publicLandingLookup: true,
			// Deliberate: "forced anonymization" only holds if users cannot reveal themselves.
			allowUserControl: false,
			logoMode: 'always_hide'
		}
	}
];
