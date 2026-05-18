import {
	API_CONFIG_KEYS,
	type ConfigSource,
	getApiConfigWithSources,
	getAppSettingsUpdatedAt,
	isPlexInsecureLocalHttpAllowed,
	toSafeConfigValue
} from '$lib/server/admin/settings.service';
import type { PageServerLoad } from './$types';

interface SettingValue {
	value: string;
	source: ConfigSource;
	isLocked: boolean;
}

type SafeSettingValue = Omit<SettingValue, 'value'> & { hasValue: boolean };

export const load: PageServerLoad = async () => {
	const [apiConfig, plexAllowInsecureLocalHttp, apiConfigUpdatedAt] = await Promise.all([
		getApiConfigWithSources(),
		isPlexInsecureLocalHttpAllowed(),
		getAppSettingsUpdatedAt(API_CONFIG_KEYS)
	]);

	return {
		settings: {
			plexServerUrl: apiConfig.plex.serverUrl as SettingValue,
			plexToken: toSafeConfigValue(apiConfig.plex.token) satisfies SafeSettingValue,
			plexAllowInsecureLocalHttp,
			openaiApiKey: toSafeConfigValue(apiConfig.openai.apiKey) satisfies SafeSettingValue,
			openaiBaseUrl: apiConfig.openai.baseUrl as SettingValue,
			openaiModel: apiConfig.openai.model as SettingValue
		},
		apiConfigVersion: apiConfigUpdatedAt?.toISOString() ?? new Date(0).toISOString()
	};
};
