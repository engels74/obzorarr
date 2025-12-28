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

export function checkAccess(context: AccessCheckContext): AccessCheckResult {
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
			return {
				allowed: false,
				denialReason: 'mode_requires_auth'
			};
	}
}

export interface CheckWrappedAccessOptions {
	userId: number;
	year: number;
	currentUser?: {
		id: number;
		plexId: number;
		isAdmin: boolean;
	};
	shareToken?: string;
}

export interface CheckWrappedAccessResult {
	settings: ShareSettings;
	accessReason: string;
}

/**
 * Effective share mode is the MORE RESTRICTIVE of user's mode and global floor.
 */
export async function checkWrappedAccess(
	options: CheckWrappedAccessOptions
): Promise<CheckWrappedAccessResult> {
	const { userId, year, currentUser, shareToken } = options;

	const settings = await getOrCreateShareSettings({ userId, year });

	const globalFloor = await getGlobalDefaultShareMode();
	const effectiveMode = getMoreRestrictiveMode(settings.mode, globalFloor);

	const context: AccessCheckContext = {
		shareMode: effectiveMode,
		shareToken,
		validToken: settings.shareToken,
		isAuthenticated: !!currentUser,
		isServerMember: !!currentUser,
		isOwner: currentUser?.id === userId || currentUser?.isAdmin === true
	};

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
		settings: {
			...settings,
			mode: effectiveMode
		},
		accessReason: result.reason ?? 'unknown'
	};
}

export interface CheckTokenAccessResult {
	settings: ShareSettings;
	userId: number;
	year: number;
}

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

export interface CheckServerWrappedAccessOptions {
	year: number;
	currentUser?: {
		id: number;
		plexId: number;
		isAdmin: boolean;
	};
}

export interface CheckServerWrappedAccessResult {
	shareMode: ShareModeType;
	accessReason: string;
}

export async function checkServerWrappedAccess(
	options: CheckServerWrappedAccessOptions
): Promise<CheckServerWrappedAccessResult> {
	const { currentUser } = options;

	const shareMode = await getServerWrappedShareMode();

	const context: AccessCheckContext = {
		shareMode,
		isAuthenticated: !!currentUser,
		isServerMember: !!currentUser,
		isOwner: currentUser?.isAdmin === true
	};

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
