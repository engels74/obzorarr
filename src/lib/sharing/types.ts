export const ShareMode = {
	PUBLIC: 'public',
	PRIVATE_OAUTH: 'private-oauth',
	PRIVATE_LINK: 'private-link'
} as const;

export type ShareModeType = (typeof ShareMode)[keyof typeof ShareMode];
