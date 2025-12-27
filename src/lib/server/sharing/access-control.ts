import {
	ShareMode,
	ShareAccessDeniedError,
	InvalidShareTokenError,
	getMoreRestrictiveMode,
	type AccessCheckContext,
	type AccessCheckResult,
	type ShareSettings,
	type ShareModeType
} from './types';
import {
	getShareSettingsByToken,
	getOrCreateShareSettings,
	getGlobalDefaultShareMode,
	getServerWrappedShareMode
} from './service';

/**
 * Access Control Module
 *
 * Implements access control logic for wrapped pages.
 *
 * Property 15: Share Mode Access Control
 * - Public: all requests allowed
 * - Private OAuth: only authenticated server members
 * - Private Link: only valid share token
 *
 * @module sharing/access-control
 */

// =============================================================================
// Core Access Control
// =============================================================================

/**
 * Check if access is allowed based on context
 *
 * Property 15: Share Mode Access Control
 *
 * @param context - Access check context
 * @returns Access check result
 */
export function checkAccess(context: AccessCheckContext): AccessCheckResult {
	// Owner always has access
	if (context.isOwner) {
		return { allowed: true, reason: 'owner' };
	}

	switch (context.shareMode) {
		case ShareMode.PUBLIC:
			return { allowed: true, reason: 'public' };

		case ShareMode.PRIVATE_OAUTH:
			if (!context.isAuthenticated) {
				return {
					allowed: false,
					denialReason: 'not_authenticated'
				};
			}
			if (!context.isServerMember) {
				return {
					allowed: false,
					denialReason: 'mode_requires_auth'
				};
			}
			return { allowed: true, reason: 'authenticated' };

		case ShareMode.PRIVATE_LINK:
			if (!context.shareToken) {
				return {
					allowed: false,
					denialReason: 'invalid_token'
				};
			}
			if (context.shareToken !== context.validToken) {
				return {
					allowed: false,
					denialReason: 'invalid_token'
				};
			}
			return { allowed: true, reason: 'valid_token' };

		default:
			// Unknown mode - deny access
			return {
				allowed: false,
				denialReason: 'mode_requires_auth'
			};
	}
}

// =============================================================================
// Route Guard Helpers
// =============================================================================

/**
 * Options for wrapped page access check
 */
export interface CheckWrappedAccessOptions {
	/** User ID of the wrapped page owner */
	userId: number;
	/** Year of the wrapped page */
	year: number;
	/** Authenticated user (from event.locals.user) */
	currentUser?: {
		id: number;
		plexId: number;
		isAdmin: boolean;
	};
	/** Share token from URL parameter */
	shareToken?: string;
}

/**
 * Result of wrapped access check
 */
export interface CheckWrappedAccessResult {
	settings: ShareSettings;
	accessReason: string;
}

/**
 * Check access to a wrapped page with floor enforcement
 *
 * High-level function for use in route load functions.
 * The effective share mode is the MORE RESTRICTIVE of:
 * - The user's configured share mode
 * - The global default share mode (floor)
 *
 * @param options - Access check options
 * @returns Share settings if access is allowed
 * @throws ShareAccessDeniedError if access is denied
 * @throws InvalidShareTokenError if token is invalid
 */
export async function checkWrappedAccess(
	options: CheckWrappedAccessOptions
): Promise<CheckWrappedAccessResult> {
	const { userId, year, currentUser, shareToken } = options;

	// Get or create share settings with defaults
	const settings = await getOrCreateShareSettings({ userId, year });

	// Get global floor and calculate effective mode
	const globalFloor = await getGlobalDefaultShareMode();
	const effectiveMode = getMoreRestrictiveMode(settings.mode, globalFloor);

	// Build access context with EFFECTIVE mode (floor enforcement)
	const context: AccessCheckContext = {
		shareMode: effectiveMode,
		shareToken,
		validToken: settings.shareToken,
		isAuthenticated: !!currentUser,
		isServerMember: !!currentUser, // If authenticated, they passed membership check
		isOwner: currentUser?.id === userId || currentUser?.isAdmin === true
	};

	// Check access
	const result = checkAccess(context);

	if (!result.allowed) {
		switch (result.denialReason) {
			case 'invalid_token':
				throw new InvalidShareTokenError();
			case 'not_authenticated':
				throw new ShareAccessDeniedError('You must be logged in to view this page.');
			case 'mode_requires_auth':
				throw new ShareAccessDeniedError(
					'You must be a member of this Plex server to view this page.'
				);
			default:
				throw new ShareAccessDeniedError();
		}
	}

	return {
		// Return settings with effective mode so UI reflects actual access
		settings: {
			...settings,
			mode: effectiveMode
		},
		accessReason: result.reason ?? 'unknown'
	};
}

/**
 * Result of token access check
 */
export interface CheckTokenAccessResult {
	settings: ShareSettings;
	userId: number;
	year: number;
}

/**
 * Check access by share token (for /wrapped/{year}/u/{token} routes)
 *
 * @param token - The share token from URL
 * @returns Share settings if token is valid
 * @throws InvalidShareTokenError if token is invalid
 */
export async function checkTokenAccess(token: string): Promise<CheckTokenAccessResult> {
	const settings = await getShareSettingsByToken(token);

	if (!settings) {
		throw new InvalidShareTokenError();
	}

	if (settings.mode !== ShareMode.PRIVATE_LINK) {
		throw new InvalidShareTokenError('This share link is no longer valid.');
	}

	return {
		settings,
		userId: settings.userId,
		year: settings.year
	};
}

// =============================================================================
// Server-Wide Wrapped Access Control
// =============================================================================

/**
 * Options for server-wide wrapped access check
 */
export interface CheckServerWrappedAccessOptions {
	/** Year of the wrapped page */
	year: number;
	/** Authenticated user (from event.locals.user) */
	currentUser?: {
		id: number;
		plexId: number;
		isAdmin: boolean;
	};
}

/**
 * Result of server wrapped access check
 */
export interface CheckServerWrappedAccessResult {
	shareMode: ShareModeType;
	accessReason: string;
}

/**
 * Check access to server-wide wrapped page
 *
 * Server-wide pages use the SERVER_WRAPPED_SHARE_MODE setting.
 * Admins always have access.
 *
 * Note: Private Link mode is not supported for server-wide pages
 * (there's no user to own the token).
 *
 * @param options - Access check options
 * @returns Access info if allowed
 * @throws ShareAccessDeniedError if access is denied
 */
export async function checkServerWrappedAccess(
	options: CheckServerWrappedAccessOptions
): Promise<CheckServerWrappedAccessResult> {
	const { currentUser } = options;

	// Get server wrapped share mode
	const shareMode = await getServerWrappedShareMode();

	// Build access context (no owner for server-wide, but admin counts as owner)
	const context: AccessCheckContext = {
		shareMode,
		isAuthenticated: !!currentUser,
		isServerMember: !!currentUser,
		isOwner: currentUser?.isAdmin === true // Only admins are "owners" of server stats
	};

	// Check access
	const result = checkAccess(context);

	if (!result.allowed) {
		switch (result.denialReason) {
			case 'not_authenticated':
				throw new ShareAccessDeniedError('You must be logged in to view this page.');
			case 'mode_requires_auth':
				throw new ShareAccessDeniedError(
					'You must be a member of this Plex server to view this page.'
				);
			default:
				throw new ShareAccessDeniedError();
		}
	}

	return {
		shareMode,
		accessReason: result.reason ?? 'unknown'
	};
}
