import { arch as osArch, platform as osPlatform } from 'node:os';
import { fail } from '@sveltejs/kit';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { z } from 'zod';
import { inlineOccCheck } from '$lib/server/admin/occ-helpers';
import { getAppSettingsUpdatedAt, LOG_SETTINGS_KEYS } from '$lib/server/admin/settings.service';
import { requireAdminActions } from '$lib/server/auth/guards';
import {
	getLogMaxCount,
	getLogRetentionDays,
	isDebugEnabled,
	logger,
	setDebugEnabled,
	setLogMaxCount,
	setLogRetentionDays
} from '$lib/server/logging';
import { getAppVersion } from '$lib/server/version';
import type { Actions, PageServerLoad } from './$types';

/**
 * OCC strategy: INLINE `settingsVersion`. Schema duplicated from the monolith
 * (will share via a settings-schemas module when more tabs land Superforms;
 * keeping the duplicate small and local for now matches the v3 plan's
 * "land US-020 one tab at a time" sequencing).
 */
const LogSettingsSchema = z.object({
	retentionDays: z.coerce
		.number({ error: 'Retention days must be a number' })
		.int('Retention days must be a whole number')
		.min(1, 'Retention days must be at least 1')
		.max(365, 'Retention days cannot exceed 365'),
	maxCount: z.coerce
		.number({ error: 'Max log count must be a number' })
		.int('Max log count must be a whole number')
		.min(1000, 'Max log count must be at least 1000')
		.max(1000000, 'Max log count cannot exceed 1,000,000'),
	debugEnabled: z.boolean(),
	settingsVersion: z.string().min(1, 'Missing settings version (reload the page)')
});

export const load: PageServerLoad = async () => {
	const [logRetentionDays, logMaxCount, logDebugEnabled, logSettingsUpdatedAt] = await Promise.all([
		getLogRetentionDays(),
		getLogMaxCount(),
		isDebugEnabled(),
		getAppSettingsUpdatedAt(LOG_SETTINGS_KEYS)
	]);

	const logSettingsVersion = logSettingsUpdatedAt?.toISOString() ?? new Date(0).toISOString();

	const form = await superValidate(
		{
			retentionDays: logRetentionDays,
			maxCount: logMaxCount,
			debugEnabled: logDebugEnabled,
			settingsVersion: logSettingsVersion
		},
		zod4(LogSettingsSchema)
	);

	return {
		form,
		logSettings: {
			retentionDays: logRetentionDays,
			maxCount: logMaxCount,
			debugEnabled: logDebugEnabled
		},
		logSettingsVersion,
		systemInfo: {
			uptimeSeconds: Math.floor(process.uptime()),
			osPlatform: osPlatform(),
			osArch: osArch(),
			bunVersion: typeof Bun !== 'undefined' ? Bun.version : null
		},
		appVersion: getAppVersion()
	};
};

export const actions: Actions = requireAdminActions({
	updateLogSettings: async ({ request }) => {
		const form = await superValidate(request, zod4(LogSettingsSchema));
		if (!form.valid) {
			// Promote blank/missing settingsVersion to 409 — matches the monolith's
			// inline-OCC pattern. Superforms aggregates leaf field errors as
			// `string[]` directly under each field name.
			if (form.errors.settingsVersion?.length) {
				return fail(409, {
					form,
					conflict: true,
					error: 'Settings changed in another tab. Please reload.'
				});
			}
			return fail(400, { form, error: 'Invalid input' });
		}

		// Stale-version check via the shared inline OCC helper.
		if (
			(await inlineOccCheck(form.data.settingsVersion, LOG_SETTINGS_KEYS)).status === 'conflict'
		) {
			return fail(409, {
				form,
				conflict: true,
				error: 'Settings changed in another tab. Please reload.'
			});
		}

		try {
			await Promise.all([
				setLogRetentionDays(form.data.retentionDays),
				setLogMaxCount(form.data.maxCount),
				setDebugEnabled(form.data.debugEnabled)
			]);
			logger.clearDebugCache();
			return { form, success: true, message: 'Logging settings updated' };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to update settings';
			return fail(500, { form, error: message });
		}
	}
});
