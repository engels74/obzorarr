/**
 * Shared Sharing Types
 *
 * Client-safe type definitions for the sharing system.
 * These types can be imported in both client and server code.
 *
 * @module sharing/types
 */

/**
 * Valid share modes for wrapped pages
 */
export const ShareMode = {
	PUBLIC: 'public',
	PRIVATE_OAUTH: 'private-oauth',
	PRIVATE_LINK: 'private-link'
} as const;

export type ShareModeType = (typeof ShareMode)[keyof typeof ShareMode];
