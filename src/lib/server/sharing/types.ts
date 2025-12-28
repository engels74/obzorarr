import { z } from 'zod';

import { ShareMode, type ShareModeType } from '$lib/sharing/types';
export { ShareMode, type ShareModeType };

export const ShareSettingsKey = {
	DEFAULT_SHARE_MODE: 'default_share_mode',
	ALLOW_USER_CONTROL: 'allow_user_control',
	SERVER_WRAPPED_SHARE_MODE: 'server_wrapped_share_mode'
} as const;

// Privacy levels for floor enforcement (higher = more restrictive)
export const ShareModePrivacyLevel = {
	[ShareMode.PUBLIC]: 0,
	[ShareMode.PRIVATE_LINK]: 1,
	[ShareMode.PRIVATE_OAUTH]: 2
} as const;

export function getMoreRestrictiveMode(mode1: ShareModeType, mode2: ShareModeType): ShareModeType {
	const level1 = ShareModePrivacyLevel[mode1] ?? 0;
	const level2 = ShareModePrivacyLevel[mode2] ?? 0;
	return level1 >= level2 ? mode1 : mode2;
}

export function meetsPrivacyFloor(userMode: ShareModeType, floorMode: ShareModeType): boolean {
	const userLevel = ShareModePrivacyLevel[userMode] ?? 0;
	const floorLevel = ShareModePrivacyLevel[floorMode] ?? 0;
	return userLevel >= floorLevel;
}

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

export class InvalidShareTokenError extends ShareError {
	constructor(message = 'Invalid or expired share link.') {
		super(message, 'INVALID_SHARE_TOKEN', 404);
		this.name = 'InvalidShareTokenError';
	}
}

export class ShareAccessDeniedError extends ShareError {
	constructor(message = 'You do not have permission to view this page.') {
		super(message, 'SHARE_ACCESS_DENIED', 403);
		this.name = 'ShareAccessDeniedError';
	}
}

export class PermissionExceededError extends ShareError {
	constructor(message = 'You cannot set this share mode with your current permissions.') {
		super(message, 'PERMISSION_EXCEEDED', 403);
		this.name = 'PermissionExceededError';
	}
}

export class ShareSettingsNotFoundError extends ShareError {
	constructor(message = 'Share settings not found.') {
		super(message, 'SETTINGS_NOT_FOUND', 404);
		this.name = 'ShareSettingsNotFoundError';
	}
}

export const ShareModeSchema = z.enum(['public', 'private-oauth', 'private-link']);

export const ShareSettingsSchema = z.object({
	userId: z.number().int().positive(),
	year: z.number().int().min(2000).max(2100),
	mode: ShareModeSchema.default('public'),
	shareToken: z.string().nullable().optional(),
	canUserControl: z.boolean().default(false)
});

export const UpdateShareSettingsSchema = z.object({
	mode: ShareModeSchema.optional(),
	canUserControl: z.boolean().optional()
});

export const GlobalShareDefaultsSchema = z.object({
	defaultShareMode: ShareModeSchema,
	allowUserControl: z.boolean()
});

export type ShareSettings = z.infer<typeof ShareSettingsSchema>;
export type UpdateShareSettings = z.infer<typeof UpdateShareSettingsSchema>;
export type GlobalShareDefaults = z.infer<typeof GlobalShareDefaultsSchema>;

export interface AccessCheckResult {
	allowed: boolean;
	reason?: 'public' | 'authenticated' | 'valid_token' | 'owner';
	denialReason?: 'not_authenticated' | 'invalid_token' | 'mode_requires_auth';
}

export interface AccessCheckContext {
	shareMode: ShareModeType;
	shareToken?: string;
	validToken?: string | null;
	isAuthenticated: boolean;
	isServerMember: boolean;
	isOwner: boolean;
}

export interface GetOrCreateShareSettingsOptions {
	userId: number;
	year: number;
	createIfMissing?: boolean;
}
