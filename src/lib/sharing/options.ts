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
 * the lookup form but every lookup would 404 until the default share mode is set to public.
 * (A non-public default is a privacy floor: per-user public rows are blocked at write
 * time and promoted back to the floor at read time, so only raising the default unblocks lookups.)
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
		'Public lookup is on, but your default share mode is non-public — every lookup will return "not found" until the default share mode is set to Public.'
} as const;

// ============================================================================
// "What this exposes" preview-row tooltips
// ============================================================================

/**
 * Stable identifiers for the four shared "What this exposes" preview rows. They
 * map onto the corresponding {@link PrivacyPreviewModel} fields but are keyed by
 * the row concept (not the model union) because the tooltip copy describes the
 * *setting*, not its current value.
 */
export type PrivacyPreviewRowKey =
	| 'namesInStats'
	| 'newUserDefault'
	| 'serverWideRecap'
	| 'landingLookupForm';

/**
 * Real-world implications of a privacy preview row from the three viewpoints the
 * app distinguishes: the admin managing the server, an anonymous visitor on the
 * public landing page / shared links, and a signed-in server member.
 */
export interface PrivacyPreviewPerspectives {
	/** How the setting affects server-wide data and management. */
	admin: string;
	/** What an anonymous (non-member) visitor sees on public surfaces. */
	visitor: string;
	/** What a signed-in server member sees vs. their own and others' data. */
	member: string;
}

/**
 * Tooltip copy for each "What this exposes" preview row. Centralized here — next
 * to the option copy that drives the same controls — so the onboarding and admin
 * privacy previews can never drift apart. Both flows render these strings under a
 * small info trigger on each `<dt>` label.
 */
export const PRIVACY_PREVIEW_ROW_TOOLTIPS: Record<
	PrivacyPreviewRowKey,
	PrivacyPreviewPerspectives
> = {
	namesInStats: {
		admin:
			'Admins always see real usernames in the dashboard and Users page. This setting only changes how names appear in public-facing, server-wide stats and leaderboards.',
		visitor:
			'Anonymous visitors see real names, an anonymous placeholder, or no name at all — whichever anonymization mode you choose here.',
		member:
			'With Hybrid, a signed-in member sees their own real name while everyone else stays anonymized. Real shows all names; Anonymous hides them for everyone.'
	},
	newUserDefault: {
		admin:
			'Sets the share mode applied to each newly-created user. Existing users keep their current setting until you apply defaults to all users.',
		visitor:
			"A visitor can open a user's Wrapped without signing in when this default is Public, or Private Link if they have the share link. Server-members-only pages require signing in.",
		member:
			'Signed-in members can open members-only Wrapped pages. If user control is allowed, each member can still override their own share mode.'
	},
	serverWideRecap: {
		admin:
			"Controls who can open the server-wide Wrapped recap that aggregates every user's stats.",
		visitor:
			'A visitor sees the server-wide recap only when it is set to Public; otherwise they are prompted to sign in.',
		member:
			'Signed-in server members can open the server-wide recap whether it is set to members-only or public.'
	},
	landingLookupForm: {
		admin:
			'Shows or hides the username lookup field on the public landing page. Only Wrapped pages set to Public are reachable through it.',
		visitor:
			"When shown, a visitor can type a username to find that person's public Wrapped without signing in.",
		member:
			'Members normally reach Wrapped pages from the dashboard, so this form mainly affects anonymous visitors on the landing page.'
	}
};

// ============================================================================
// "What this exposes" preview-VALUE tooltips
// ============================================================================

/**
 * Value literals each preview row can display, mirroring the matching
 * `PrivacyPreviewModel` field unions in `src/lib/sharing/preset-logic.ts`. They
 * are redeclared here (rather than imported) on purpose: `preset-logic.ts`
 * imports from this module, so importing its types back would create a circular
 * dependency. Keeping them local follows the same pattern as the anonymization /
 * logo value literals above, which mirror the server enums without importing
 * them. `wrappedLogo` covers the onboarding-only logo row (admin omits it).
 */
export interface PrivacyPreviewValueTooltips {
	namesInStats: Record<'real' | 'anonymous' | 'hybrid-self-sees-own', string>;
	newUserDefault: Record<'public' | 'members-only' | 'private-link', string>;
	serverWideRecap: Record<'public' | 'members-only', string>;
	landingLookupForm: Record<'visible' | 'hidden', string>;
	wrappedLogo: Record<'always-show' | 'always-hide' | 'user-choice', string>;
}

/**
 * Tooltip copy explaining the *specific effect* of the currently-selected value
 * in each "What this exposes" preview row — the complement to
 * {@link PRIVACY_PREVIEW_ROW_TOOLTIPS}, which describes the setting in general.
 * Where the row tooltip answers "what is this control?", these answer "what does
 * *this* choice actually do?". Centralized next to the row copy so the onboarding
 * and admin previews stay in lockstep. Each string is a single, plain-language
 * sentence rendered under a small info trigger on the `<dd>` value.
 */
export const PRIVACY_PREVIEW_VALUE_TOOLTIPS: PrivacyPreviewValueTooltips = {
	namesInStats: {
		real: "Public, server-wide stats and leaderboards show each person's actual Plex username.",
		anonymous:
			'Usernames are replaced with neutral placeholders like “User #1” everywhere except the admin dashboard — no one is identifiable in public stats.',
		'hybrid-self-sees-own':
			'A signed-in member sees their own real name, while everyone else stays anonymized as “User #1”.'
	},
	newUserDefault: {
		public: "New users' Wrapped pages are reachable by anyone with the link — no sign-in required.",
		'members-only':
			"New users' Wrapped pages require signing in with a Plex account on this server.",
		'private-link':
			"New users' Wrapped pages are reachable only through a unique, unguessable share link."
	},
	serverWideRecap: {
		public:
			"The server-wide /wrapped recap is open to anyone, including anonymous visitors who aren't signed in.",
		'members-only':
			'The server-wide /wrapped recap requires signing in with a Plex account on this server.'
	},
	landingLookupForm: {
		visible:
			'The landing page shows a username lookup field so visitors can open any Public Wrapped without signing in.',
		hidden:
			'The landing page hides the lookup field and shows a “Sign in with Plex” button instead.'
	},
	wrappedLogo: {
		'always-show': "The Obzorarr logo is shown on every Wrapped page and users can't hide it.",
		'always-hide': "The Obzorarr logo is hidden on every Wrapped page and users can't reveal it.",
		'user-choice': 'Each user decides whether the Obzorarr logo appears on their own Wrapped pages.'
	}
};

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
		exposureSummary: 'Real names, server-members-only access, nothing public.',
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
		exposureSummary: 'Hybrid names, members-only recap, nothing public.',
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
