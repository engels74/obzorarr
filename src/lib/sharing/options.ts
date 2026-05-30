/**
 * Shared, client-safe option COPY for privacy / sharing controls.
 *
 * This is the single source of truth for the user-visible *strings* (label +
 * description) shown in BOTH the onboarding privacy step and the admin settings
 * pages, so the two flows can never drift apart again.
 *
 * Scope is COPY ONLY — deliberately NOT Zod schemas. Each route keeps its own
 * schema and submission model co-located (Superforms vs `use:enhance`, `z.object`
 * vs `z.enum`, inline vs external OCC), as documented in
 * `src/routes/admin/settings/privacy/+page.server.ts`. We only share text.
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
 * the lookup form but every lookup would 404 until users opt into public sharing.
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
		'Public lookup is on, but your default share mode is non-public — visitors will not find any Wrapped until users opt into public sharing.'
} as const;
