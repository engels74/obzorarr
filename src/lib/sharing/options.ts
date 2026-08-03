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
		description:
			'Any signed-in Plex server member can view — including this person’s real name and full viewing history'
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
 * Shared copy for the administrator-controlled landing lookup policy. Enabling
 * it changes current-year access semantics as well as showing the form.
 */
export const publicLandingLookupCopy = {
	label: 'Allow public current-year Wrapped lookup',
	helper:
		'Let anyone search a Plex username and open that user’s current-year Wrapped without signing in.',
	enabledDescription:
		'Current-year Wrapped pages are public by default. If user control is allowed, an explicit user opt-out stays hidden; otherwise this administrator setting applies to everyone.',
	disabledDescription:
		'The public username field is hidden. Visitors use Plex sign-in, and normal per-page sharing rules continue to apply.',
	protectedBoundary:
		'This opens only eligible current-year Wrapped pages. Admin controls, user settings, dashboards, and the rest of Obzorarr still require authentication.',
	privateOutcome:
		'Unknown usernames and users who opted out receive the same “not publicly shared” response.'
} as const;

/** Canonical explanation of stored defaults versus effective access. */
export const shareDefaultCopy = {
	summary:
		'New users and existing default-managed users follow the current default. Saving it does not rewrite explicit user choices.',
	explicitRows:
		'Explicit user choices stay stored. A stricter global floor can limit effective access; relaxing the floor can reveal the stored choice again.',
	bulkApply:
		'Apply the current defaults only to existing default-managed rows. Explicit user overrides are skipped, and users without a row already inherit the current default.'
} as const;

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
			'Admins always see real usernames in protected dashboards. This setting changes names only in Wrapped recap output and public-facing statistics.',
		visitor:
			'On Wrapped output they can access, visitors see real names, anonymous labels, or hybrid labels according to this setting.',
		member:
			'Hybrid shows a signed-in member their own real name while other people stay anonymized. Real shows names; Anonymous replaces them.'
	},
	newUserDefault: {
		admin:
			'New users and existing default-managed rows follow this baseline. Explicit choices are not rewritten, though a stricter global floor can limit effective access.',
		visitor:
			'This controls ordinary personal Wrapped links. Public landing lookup is separate: when enabled, eligible current-year Wrapped pages are public by default.',
		member:
			'Members can open members-only pages after sign-in. When user control is allowed, an explicit non-public choice also opts that user out of public lookup.'
	},
	serverWideRecap: {
		admin:
			'Controls only the aggregate server-wide /wrapped recap. It does not open admin pages, dashboards, settings, or every route on the server.',
		visitor:
			'Visitors can open the server-wide recap only when it is Public; otherwise Plex server membership is required.',
		member: 'Signed-in server members can open the recap whether it is members-only or Public.'
	},
	landingLookupForm: {
		admin:
			'Shows the public username field and makes eligible current-year personal Wrapped pages public by default. User opt-outs apply only when user control is allowed.',
		visitor:
			'Visitors can search a username and open an eligible current-year Wrapped without signing in. Unknown and opted-out users look the same.',
		member:
			'This affects current-year personal Wrapped output only. Dashboards, settings, admin controls, and other private surfaces remain protected.'
	}
};

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
		real: 'Wrapped recap output and leaderboards show each person’s actual Plex username.',
		anonymous:
			'Usernames are replaced with neutral placeholders like “User #1” everywhere except the admin dashboard — no one is identifiable in public stats.',
		'hybrid-self-sees-own':
			'A signed-in member sees their own real name, while everyone else stays anonymized as “User #1”.'
	},
	newUserDefault: {
		public: 'Ordinary personal Wrapped links are open without sign-in.',
		'members-only':
			"New users' Wrapped pages require signing in with a Plex account on this server.",
		'private-link':
			"New users' Wrapped pages are reachable only through a unique, unguessable share link."
	},
	serverWideRecap: {
		public:
			'Only the aggregate server-wide /wrapped recap is open without sign-in; protected Obzorarr areas stay private.',
		'members-only':
			'The aggregate server-wide /wrapped recap requires signing in as a Plex member of this server.'
	},
	landingLookupForm: {
		visible:
			'Visitors can search usernames and open eligible current-year Wrapped pages without signing in; other Obzorarr areas remain protected.',
		hidden: 'The public username field is hidden and the landing page offers Plex sign-in instead.'
	},
	wrappedLogo: {
		'always-show': "The Obzorarr logo is shown on every Wrapped page and users can't hide it.",
		'always-hide': "The Obzorarr logo is hidden on every Wrapped page and users can't reveal it.",
		'user-choice': 'Each user decides whether the Obzorarr logo appears on their own Wrapped pages.'
	}
};

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
 * Public lookup is a current-year policy rather than a form layered over the
 * default share mode, so presets may combine it with a private ordinary-link
 * baseline without creating a dead lookup experience.
 */
export const PRIVACY_PRESETS: PrivacyPreset[] = [
	{
		id: 'maximum-privacy',
		label: 'Maximum Privacy',
		description: 'Personal and server recap links stay members-only; names are anonymous.',
		exposureSummary:
			'No public Wrapped output; protected dashboards still show admin-only details.',
		values: {
			anonymizationMode: 'anonymous',
			defaultShareMode: ShareMode.PRIVATE_OAUTH,
			serverWrappedShareMode: 'private-oauth',
			publicLandingLookup: false,
			allowUserControl: false,
			logoMode: 'always_show'
		}
	},
	{
		id: 'internal-community',
		label: 'Internal Community',
		description: 'Real names for signed-in members, with no public Wrapped output.',
		exposureSummary: 'Members-only personal pages and recap; users may choose stricter sharing.',
		values: {
			anonymizationMode: 'real',
			defaultShareMode: ShareMode.PRIVATE_OAUTH,
			serverWrappedShareMode: 'private-oauth',
			publicLandingLookup: false,
			allowUserControl: true,
			logoMode: 'always_show'
		}
	},
	{
		id: 'balanced',
		label: 'Balanced',
		description: 'Recommended starting point: hybrid names and members-only sharing.',
		exposureSummary: 'No public Wrapped output unless the administrator enables public lookup.',
		values: {
			anonymizationMode: 'hybrid',
			defaultShareMode: ShareMode.PRIVATE_OAUTH,
			serverWrappedShareMode: 'private-oauth',
			publicLandingLookup: false,
			allowUserControl: true,
			logoMode: 'always_show'
		}
	},
	{
		id: 'public-showcase',
		label: 'Public Showcase',
		description: 'Public recap and current-year username lookup with real names.',
		exposureSummary:
			'Specific Wrapped output is public; dashboards, settings, and admin controls stay protected.',
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
		description: 'Public recap and current-year lookup with anonymous recap names.',
		exposureSummary:
			'Wrapped output is public and names stay anonymous; protected controls remain signed-in only.',
		values: {
			anonymizationMode: 'anonymous',
			defaultShareMode: ShareMode.PUBLIC,
			serverWrappedShareMode: 'public',
			publicLandingLookup: true,
			// Deliberate: "forced anonymization" only holds if users cannot reveal themselves.
			allowUserControl: false,
			logoMode: 'always_show'
		}
	}
];

/**
 * The preset the "Custom" card seeds on its FIRST pick of a session, so an
 * admin who starts from Custom begins from the recommended baseline instead of
 * whatever the raw factory defaults happen to be.
 */
export const DEFAULT_PRIVACY_PRESET_ID: PrivacyPresetId = 'balanced';

/**
 * Descriptor for the client-only "Custom" card rendered LAST in both preset
 * grids (onboarding + admin).
 *
 * Deliberately NOT a member of {@link PRIVACY_PRESETS}: that array is the set of
 * shipped value-maps every matcher iterates, and a pseudo-entry with no `values`
 * would force each consumer to skip it. Custom has no value-map by definition —
 * it represents "whatever the live fields currently say" — and no
 * `exposureSummary` either, because both pages already render a live exposure
 * preview panel next to the grid.
 *
 * Its `id` mirrors the `'custom'` arm of `PrivacyPresetMatch` in
 * `preset-logic.ts`; it is never persisted, submitted, or added to a Zod enum.
 */
export interface CustomPrivacyPresetCard {
	id: 'custom';
	label: string;
	description: string;
}

export const CUSTOM_PRIVACY_PRESET: CustomPrivacyPresetCard = {
	id: 'custom',
	label: 'Custom',
	description: 'Your own combination of the options below.'
};
