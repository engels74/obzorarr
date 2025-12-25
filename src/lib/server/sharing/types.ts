import { z } from 'zod';

/**
 * Sharing Service Types
 *
 * Type definitions for the sharing system that controls
 * wrapped page visibility.
 *
 * Implements Requirements 7.1-7.6
 *
 * @module sharing/types
 */

// =============================================================================
// Re-export Client-Safe Types
// =============================================================================

// Import and re-export types from the shared location for backward compatibility
// The import makes the type available for local use in this file
import { ShareMode, type ShareModeType } from '$lib/sharing/types';
export { ShareMode, type ShareModeType };

/**
 * App settings keys for sharing configuration
 */
export const ShareSettingsKey = {
	DEFAULT_SHARE_MODE: 'default_share_mode',
	ALLOW_USER_CONTROL: 'allow_user_control',
	SERVER_WRAPPED_SHARE_MODE: 'server_wrapped_share_mode'
} as const;

// =============================================================================
// Privacy Level Helpers (for floor enforcement)
// =============================================================================

/**
 * Privacy levels for floor enforcement (higher = more restrictive)
 *
 * Used to ensure user settings cannot be less restrictive than global floor.
 * Hierarchy: Private OAuth (strictest) > Private Link > Public (least restrictive)
 */
export const ShareModePrivacyLevel = {
	[ShareMode.PUBLIC]: 0,
	[ShareMode.PRIVATE_LINK]: 1,
	[ShareMode.PRIVATE_OAUTH]: 2
} as const;

/**
 * Compare two share modes and return the more restrictive one
 *
 * @param mode1 - First share mode
 * @param mode2 - Second share mode
 * @returns The more restrictive of the two modes
 */
export function getMoreRestrictiveMode(mode1: ShareModeType, mode2: ShareModeType): ShareModeType {
	const level1 = ShareModePrivacyLevel[mode1] ?? 0;
	const level2 = ShareModePrivacyLevel[mode2] ?? 0;
	return level1 >= level2 ? mode1 : mode2;
}

/**
 * Check if a mode meets or exceeds the floor requirement
 *
 * @param userMode - The user's requested share mode
 * @param floorMode - The minimum required privacy level (global floor)
 * @returns True if userMode is at least as restrictive as floorMode
 */
export function meetsPrivacyFloor(userMode: ShareModeType, floorMode: ShareModeType): boolean {
	const userLevel = ShareModePrivacyLevel[userMode] ?? 0;
	const floorLevel = ShareModePrivacyLevel[floorMode] ?? 0;
	return userLevel >= floorLevel;
}

// =============================================================================
// Error Types
// =============================================================================

/**
 * Base error for sharing operations
 */
export class ShareError extends Error {
	constructor(
		message: string,
		public readonly code: string,
		public readonly statusCode: number = 500
	) {
		super(message);
		this.name = 'ShareError';
	}
}

/**
 * Error when share token is invalid or not found
 */
export class InvalidShareTokenError extends ShareError {
	constructor(message = 'Invalid or expired share link.') {
		super(message, 'INVALID_SHARE_TOKEN', 404);
		this.name = 'InvalidShareTokenError';
	}
}

/**
 * Error when access is denied due to share mode
 */
export class ShareAccessDeniedError extends ShareError {
	constructor(message = 'You do not have permission to view this page.') {
		super(message, 'SHARE_ACCESS_DENIED', 403);
		this.name = 'ShareAccessDeniedError';
	}
}

/**
 * Error when user tries to set share mode beyond their permissions
 */
export class PermissionExceededError extends ShareError {
	constructor(message = 'You cannot set this share mode with your current permissions.') {
		super(message, 'PERMISSION_EXCEEDED', 403);
		this.name = 'PermissionExceededError';
	}
}

/**
 * Error when share settings are not found
 */
export class ShareSettingsNotFoundError extends ShareError {
	constructor(message = 'Share settings not found.') {
		super(message, 'SETTINGS_NOT_FOUND', 404);
		this.name = 'ShareSettingsNotFoundError';
	}
}

// =============================================================================
// Zod Schemas
// =============================================================================

/**
 * Schema for share mode validation
 */
export const ShareModeSchema = z.enum(['public', 'private-oauth', 'private-link']);

/**
 * Schema for share settings
 */
export const ShareSettingsSchema = z.object({
	userId: z.number().int().positive(),
	year: z.number().int().min(2000).max(2100),
	mode: ShareModeSchema.default('public'),
	shareToken: z.string().nullable().optional(),
	canUserControl: z.boolean().default(false)
});

/**
 * Schema for updating share settings
 */
export const UpdateShareSettingsSchema = z.object({
	mode: ShareModeSchema.optional(),
	canUserControl: z.boolean().optional()
});

/**
 * Schema for admin-setting global defaults
 */
export const GlobalShareDefaultsSchema = z.object({
	defaultShareMode: ShareModeSchema,
	allowUserControl: z.boolean()
});

// =============================================================================
// TypeScript Types (inferred from Zod schemas)
// =============================================================================

export type ShareSettings = z.infer<typeof ShareSettingsSchema>;
export type UpdateShareSettings = z.infer<typeof UpdateShareSettingsSchema>;
export type GlobalShareDefaults = z.infer<typeof GlobalShareDefaultsSchema>;

/**
 * Result of checking access to a wrapped page
 */
export interface AccessCheckResult {
	allowed: boolean;
	reason?: 'public' | 'authenticated' | 'valid_token' | 'owner';
	denialReason?: 'not_authenticated' | 'invalid_token' | 'mode_requires_auth';
}

/**
 * Context for access control checks
 */
export interface AccessCheckContext {
	/** The share mode of the wrapped page */
	shareMode: ShareModeType;
	/** Share token from URL, if any */
	shareToken?: string;
	/** Valid share token for this page (from database) */
	validToken?: string | null;
	/** Whether the requester is authenticated */
	isAuthenticated: boolean;
	/** Whether the requester is a server member */
	isServerMember: boolean;
	/** Whether the requester owns this wrapped (their own page) */
	isOwner: boolean;
}

/**
 * Options for getting or creating share settings
 */
export interface GetOrCreateShareSettingsOptions {
	userId: number;
	year: number;
	/** If true, creates default settings if none exist */
	createIfMissing?: boolean;
}
