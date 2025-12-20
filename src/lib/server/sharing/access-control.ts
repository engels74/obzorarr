import {
	ShareMode,
	ShareAccessDeniedError,
	InvalidShareTokenError,
	type AccessCheckContext,
	type AccessCheckResult,
	type ShareSettings
} from './types';
import { getShareSettingsByToken, getOrCreateShareSettings } from './service';

/**
 * Access Control Module
 *
 * Implements access control logic for wrapped pages.
 *
 * Implements Property 15: Share Mode Access Control
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
 * Pure function implementing Property 15: Share Mode Access Control.
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
			// Requirement 7.1: Public mode - anyone can access
			return { allowed: true, reason: 'public' };

		case ShareMode.PRIVATE_OAUTH:
			// Requirement 7.2: Private OAuth - authenticated server members only
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
			// Requirement 7.3: Private Link - valid share token required
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
 * Check access to a wrapped page
 *
 * High-level function for use in route load functions.
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

	// Build access context
	const context: AccessCheckContext = {
		shareMode: settings.mode,
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
		settings,
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
