import { arch as osArch, platform as osPlatform } from 'node:os';
import { getAppSettingsUpdatedAt, LOG_SETTINGS_KEYS } from '$lib/server/admin/settings.service';
import { getLogMaxCount, getLogRetentionDays, isDebugEnabled } from '$lib/server/logging';
import { getAppVersion } from '$lib/server/version';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const [logRetentionDays, logMaxCount, logDebugEnabled, logSettingsUpdatedAt] = await Promise.all([
		getLogRetentionDays(),
		getLogMaxCount(),
		isDebugEnabled(),
		getAppSettingsUpdatedAt(LOG_SETTINGS_KEYS)
	]);

	return {
		logSettings: {
			retentionDays: logRetentionDays,
			maxCount: logMaxCount,
			debugEnabled: logDebugEnabled
		},
		logSettingsVersion: logSettingsUpdatedAt?.toISOString() ?? new Date(0).toISOString(),
		systemInfo: {
			uptimeSeconds: Math.floor(process.uptime()),
			osPlatform: osPlatform(),
			osArch: osArch(),
			bunVersion: typeof Bun !== 'undefined' ? Bun.version : null
		},
		appVersion: getAppVersion()
	};
};
