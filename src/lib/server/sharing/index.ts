/**
 * Sharing Service Module
 *
 * Provides functionality for managing wrapped page sharing.
 *
 * @module sharing
 *
 * @example
 * ```typescript
 * import {
 *   checkWrappedAccess,
 *   updateShareSettings,
 *   ShareMode
 * } from '$lib/server/sharing';
 *
 * // Check access in a load function
 * const { settings } = await checkWrappedAccess({
 *   userId: 123,
 *   year: 2024,
 *   currentUser: event.locals.user,
 *   shareToken: params.token
 * });
 *
 * // Update share settings
 * await updateShareSettings(123, 2024, { mode: 'private-link' }, true);
 * ```
 */

// =============================================================================
// Type Exports
// =============================================================================

export type {
	ShareSettings,
	UpdateShareSettings,
	GlobalShareDefaults,
	AccessCheckResult,
	AccessCheckContext,
	GetOrCreateShareSettingsOptions,
	ShareModeType
} from './types';

export {
	ShareMode,
	ShareSettingsKey,
	ShareModeSchema,
	ShareSettingsSchema,
	UpdateShareSettingsSchema,
	GlobalShareDefaultsSchema,
	ShareError,
	InvalidShareTokenError,
	ShareAccessDeniedError,
	PermissionExceededError,
	ShareSettingsNotFoundError,
	// Privacy level helpers for floor enforcement
	ShareModePrivacyLevel,
	getMoreRestrictiveMode,
	meetsPrivacyFloor
} from './types';

// =============================================================================
// Service Exports
// =============================================================================

export {
	generateShareToken,
	isValidTokenFormat,
	getGlobalDefaultShareMode,
	getGlobalAllowUserControl,
	setGlobalShareDefaults,
	// Server-wide wrapped share mode
	getServerWrappedShareMode,
	setServerWrappedShareMode,
	getShareSettings,
	getOrCreateShareSettings,
	updateShareSettings,
	regenerateShareToken,
	getShareSettingsByToken,
	deleteShareSettings,
	getAllUserShareSettings
} from './service';

// =============================================================================
// Access Control Exports
// =============================================================================

export type {
	CheckWrappedAccessOptions,
	CheckWrappedAccessResult,
	CheckTokenAccessResult,
	// Server-wide wrapped access check types
	CheckServerWrappedAccessOptions,
	CheckServerWrappedAccessResult
} from './access-control';

export {
	checkAccess,
	checkWrappedAccess,
	checkTokenAccess,
	// Server-wide wrapped access check
	checkServerWrappedAccess
} from './access-control';
