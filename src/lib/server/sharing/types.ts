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
// Constants
// =============================================================================

/**
 * Valid share modes for wrapped pages
 */
export const ShareMode = {
	PUBLIC: 'public',
	PRIVATE_OAUTH: 'private-oauth',
	PRIVATE_LINK: 'private-link'
} as const;

export type ShareModeType = (typeof ShareMode)[keyof typeof ShareMode];

/**
 * App settings keys for sharing configuration
 */
export const ShareSettingsKey = {
	DEFAULT_SHARE_MODE: 'default_share_mode',
	ALLOW_USER_CONTROL: 'allow_user_control'
} as const;

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
