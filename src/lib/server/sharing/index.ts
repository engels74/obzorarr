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

export {
	generateShareToken,
	isValidTokenFormat,
	getGlobalDefaultShareMode,
	getGlobalAllowUserControl,
	setGlobalShareDefaults,
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

export type {
	CheckWrappedAccessOptions,
	CheckWrappedAccessResult,
	CheckTokenAccessResult,
	CheckServerWrappedAccessOptions,
	CheckServerWrappedAccessResult
} from './access-control';

export {
	checkAccess,
	checkWrappedAccess,
	checkTokenAccess,
	checkServerWrappedAccess
} from './access-control';
