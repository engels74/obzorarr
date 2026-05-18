import { arch as osArch, platform as osPlatform } from 'node:os';
import { getLogMaxCount, getLogRetentionDays, isDebugEnabled } from '$lib/server/logging';
import { getAppVersion } from '$lib/server/version';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const [logRetentionDays, logMaxCount, logDebugEnabled] = await Promise.all([
		getLogRetentionDays(),
		getLogMaxCount(),
		isDebugEnabled()
	]);

	return {
		logSettings: {
			retentionDays: logRetentionDays,
			maxCount: logMaxCount,
			debugEnabled: logDebugEnabled
		},
		systemInfo: {
			uptimeSeconds: Math.floor(process.uptime()),
			osPlatform: osPlatform(),
			osArch: osArch(),
			bunVersion: typeof Bun !== 'undefined' ? Bun.version : null
		},
		appVersion: getAppVersion()
	};
};
