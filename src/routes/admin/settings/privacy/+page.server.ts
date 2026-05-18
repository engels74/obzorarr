import {
	AnonymizationMode,
	getAnonymizationMode,
	getAppSettingsUpdatedAt,
	SERVER_WRAPPED_SETTINGS_KEYS,
	USER_DEFAULTS_SETTINGS_KEYS
} from '$lib/server/admin/settings.service';
import {
	getGlobalAllowUserControl,
	getGlobalDefaultShareMode,
	getServerWrappedShareMode
} from '$lib/server/sharing/service';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const [
		anonymizationMode,
		defaultShareMode,
		allowUserControl,
		serverWrappedShareMode,
		serverWrappedSettingsUpdatedAt,
		userDefaultsSettingsUpdatedAt
	] = await Promise.all([
		getAnonymizationMode(),
		getGlobalDefaultShareMode(),
		getGlobalAllowUserControl(),
		getServerWrappedShareMode(),
		getAppSettingsUpdatedAt(SERVER_WRAPPED_SETTINGS_KEYS),
		getAppSettingsUpdatedAt(USER_DEFAULTS_SETTINGS_KEYS)
	]);

	return {
		anonymizationMode,
		anonymizationOptions: Object.entries(AnonymizationMode).map(([key, value]) => ({
			value,
			label: key.charAt(0).toUpperCase() + key.slice(1).toLowerCase()
		})),
		globalDefaults: {
			defaultShareMode,
			allowUserControl
		},
		serverWrappedShareMode,
		serverWrappedSettingsVersion:
			serverWrappedSettingsUpdatedAt?.toISOString() ?? new Date(0).toISOString(),
		userDefaultsSettingsVersion:
			userDefaultsSettingsUpdatedAt?.toISOString() ?? new Date(0).toISOString()
	};
};
