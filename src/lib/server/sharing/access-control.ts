import {
	getGlobalDefaultShareMode,
	getOrCreateShareSettings,
	getServerWrappedShareMode,
	getShareSettingsByToken
} from './service';
import {
	type AccessCheckContext,
	type AccessCheckResult,
	getMoreRestrictiveMode,
	InvalidShareTokenError,
	ShareAccessDeniedError,
	ShareMode,
	ShareModePrivacyLevel,
	type ShareModeType,
	type ShareSettings
} from './types';

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
				throw new ShareAccessDeniedError('Sign in with your Plex account to view this wrapped.');
			case 'mode_requires_auth':
				throw new ShareAccessDeniedError(
					'This wrapped is visible only to members of this Plex server. Sign in with your Plex account to view.'
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

	// A per-user mode that is explicitly MORE restrictive than private-link
	// (e.g. private-oauth) means the owner has chosen auth over tokens; the
	// token is stale regardless of the global floor.
	if (ShareModePrivacyLevel[settings.mode] > ShareModePrivacyLevel[ShareMode.PRIVATE_LINK]) {
		throw new InvalidShareTokenError('This share link is no longer valid.');
	}

	// Resolve against the global privacy floor. This mirrors the effective-mode
	// computation done at mint-time (see `+page.server.ts` for user wrapped) and
	// in `checkWrappedAccess`, so that a token minted because the floor raised a
	// less-restrictive per-user row (e.g. EXPLICIT 'public') up to 'private-link'
	// is also honored here. Without this symmetry, `checkTokenAccess` would reject
	// tokens on the raw `settings.mode` while the minting site happily issues them
	// on `effectiveMode`, producing share URLs that work for the owner but not
	// for any non-owner they send them to.
	const globalFloor = await getGlobalDefaultShareMode();
	const effectiveMode = getMoreRestrictiveMode(settings.mode, globalFloor);
	if (effectiveMode !== ShareMode.PRIVATE_LINK) {
		// Floor pushed the effective mode above private-link (e.g. private-oauth):
		// token alone is no longer sufficient, direct the viewer to sign in.
		if (ShareModePrivacyLevel[effectiveMode] > ShareModePrivacyLevel[ShareMode.PRIVATE_LINK]) {
			throw new ShareAccessDeniedError(
				'This wrapped is visible only to members of this Plex server. Sign in with your Plex account to view.'
			);
		}
		// Both per-user mode and floor are public: the page is public, so the
		// token is meaningless; treat as a stale link.
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
				throw new ShareAccessDeniedError('Sign in with your Plex account to view this wrapped.');
			case 'mode_requires_auth':
				throw new ShareAccessDeniedError(
					'This wrapped is visible only to members of this Plex server. Sign in with your Plex account to view.'
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
