export const ShareMode = {
	PUBLIC: 'public',
	PRIVATE_OAUTH: 'private-oauth',
	PRIVATE_LINK: 'private-link'
} as const;

export type ShareModeType = (typeof ShareMode)[keyof typeof ShareMode];

// Single source of truth for privacy-level ordering, used by both
// server enforcement (meetsPrivacyFloor) and client UI (isBelowFloor).
export const ShareModePrivacyLevel: Record<ShareModeType, number> = {
	[ShareMode.PUBLIC]: 0,
	[ShareMode.PRIVATE_LINK]: 1,
	[ShareMode.PRIVATE_OAUTH]: 2
} as const;
