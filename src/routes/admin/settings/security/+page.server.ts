import {
	AppSettingsKey,
	getAppSetting,
	getAppSettingsUpdatedAt,
	getCsrfConfigWithSource,
	getTrustProxyConfigWithSource,
	isCsrfWarningDismissed,
	TRUST_PROXY_SETTINGS_KEYS
} from '$lib/server/admin/settings.service';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const [
		csrfConfig,
		csrfWarningDismissed,
		csrfOriginSkippedRaw,
		trustProxyConfig,
		trustProxySettingsUpdatedAt
	] = await Promise.all([
		getCsrfConfigWithSource(),
		isCsrfWarningDismissed(),
		getAppSetting(AppSettingsKey.CSRF_ORIGIN_SKIPPED),
		getTrustProxyConfigWithSource(),
		getAppSettingsUpdatedAt(TRUST_PROXY_SETTINGS_KEYS)
	]);

	return {
		security: {
			originValue: csrfConfig.origin.value,
			csrfEnabled: !!csrfConfig.origin.value,
			originSource: csrfConfig.origin.source,
			originLocked: csrfConfig.origin.isLocked,
			warningDismissed: csrfWarningDismissed,
			csrfOriginSkipped: csrfOriginSkippedRaw === 'true' && !csrfConfig.origin.value,
			trustProxyValue: trustProxyConfig.trustProxy.value === 'true',
			trustProxySource: trustProxyConfig.trustProxy.source,
			trustProxyLocked: trustProxyConfig.trustProxy.isLocked
		},
		trustProxyVersion: trustProxySettingsUpdatedAt?.toISOString() ?? new Date(0).toISOString()
	};
};
