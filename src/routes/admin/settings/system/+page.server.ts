import { arch as osArch, platform as osPlatform } from 'node:os';
import { fail } from '@sveltejs/kit';
import { zod4 } from 'sveltekit-superforms/adapters';
import { superValidate } from 'sveltekit-superforms/server';
import { z } from 'zod';
import { listSupportedTimezones, validateTimezone } from '$lib/cron/timezone';
import {
	inlineOccCheck,
	OCC_CONFLICT_MESSAGE,
	settingsVersionISO
} from '$lib/server/admin/occ-helpers';
import {
	getAppSettingsUpdatedAt,
	getSchedulerTimezoneConfigWithSource,
	LOG_SETTINGS_KEYS,
	SCHEDULER_TIMEZONE_SETTINGS_KEYS,
	setSchedulerTimezone
} from '$lib/server/admin/settings.service';
import { requireAdminActions } from '$lib/server/auth/guards';
import {
	getLogMaxCount,
	getLogRetentionDays,
	isDebugEnabled,
	logger,
	setDebugEnabled,
	setLogMaxCount,
	setLogRetentionDays,
	updateLogRetentionSchedulerTimezone
} from '$lib/server/logging';
import { applySyncSchedulerTimezone } from '$lib/server/sync/scheduler-state';
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

/**
 * OCC strategy: INLINE `settingsVersion`, same shape as `LogSettingsSchema`, on
 * its own key group so the two System-tab forms never false-409 each other.
 * Validation is delegated to the shared `validateTimezone` so the field error,
 * the env-var reconciliation and the scheduler all accept exactly one set of
 * zone identifiers.
 */
const SchedulerTimezoneSchema = z.object({
	timezone: z
		.string()
		.trim()
		.superRefine((value, ctx) => {
			const error = validateTimezone(value);
			if (error) {
				ctx.addIssue({ code: z.ZodIssueCode.custom, message: error });
			}
		}),
	settingsVersion: z.string().min(1, 'Missing settings version (reload the page)')
});

export const load: PageServerLoad = async () => {
	const [
		logRetentionDays,
		logMaxCount,
		logDebugEnabled,
		logSettingsUpdatedAt,
		timezoneConfig,
		timezoneSettingsUpdatedAt
	] = await Promise.all([
		getLogRetentionDays(),
		getLogMaxCount(),
		isDebugEnabled(),
		getAppSettingsUpdatedAt(LOG_SETTINGS_KEYS),
		getSchedulerTimezoneConfigWithSource(),
		getAppSettingsUpdatedAt(SCHEDULER_TIMEZONE_SETTINGS_KEYS)
	]);

	const logSettingsVersion = settingsVersionISO(logSettingsUpdatedAt);
	const timezoneVersion = settingsVersionISO(timezoneSettingsUpdatedAt);

	const form = await superValidate(
		{
			retentionDays: logRetentionDays,
			maxCount: logMaxCount,
			debugEnabled: logDebugEnabled,
			settingsVersion: logSettingsVersion
		},
		zod4(LogSettingsSchema),
		{ id: 'logSettings' }
	);

	const timezoneForm = await superValidate(
		{ timezone: timezoneConfig.timezone.value, settingsVersion: timezoneVersion },
		zod4(SchedulerTimezoneSchema),
		{ id: 'schedulerTimezone' }
	);

	return {
		form,
		timezoneForm,
		logSettings: {
			retentionDays: logRetentionDays,
			maxCount: logMaxCount,
			debugEnabled: logDebugEnabled
		},
		logSettingsVersion,
		schedulerTimezone: {
			value: timezoneConfig.timezone.value,
			source: timezoneConfig.timezone.source,
			isLocked: timezoneConfig.timezone.isLocked,
			supportedZones: listSupportedTimezones()
		},
		timezoneVersion,
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
	updateSchedulerTimezone: async ({ request }) => {
		const form = await superValidate(request, zod4(SchedulerTimezoneSchema), {
			id: 'schedulerTimezone'
		});
		if (!form.valid) {
			if (form.errors.settingsVersion?.length) {
				return fail(409, { form, conflict: true, error: OCC_CONFLICT_MESSAGE });
			}
			return fail(400, {
				form,
				error: form.errors.timezone?.[0] ?? 'Invalid input'
			});
		}

		const timezoneConfig = await getSchedulerTimezoneConfigWithSource();
		if (timezoneConfig.timezone.isLocked) {
			return fail(400, {
				form,
				error: 'The TZ environment variable sets the timezone and it cannot be changed here'
			});
		}

		if (
			(await inlineOccCheck(form.data.settingsVersion, SCHEDULER_TIMEZONE_SETTINGS_KEYS)).status ===
			'conflict'
		) {
			return fail(409, { form, conflict: true, error: OCC_CONFLICT_MESSAGE });
		}

		try {
			// The env-lock branch above already returned, so the stored value IS the
			// effective one and both live jobs can be re-pointed at it immediately.
			const { timezone, updatedAt } = await setSchedulerTimezone(form.data.timezone);
			applySyncSchedulerTimezone(timezone);
			updateLogRetentionSchedulerTimezone(timezone);
			logger.info(`Scheduler timezone set to ${timezone}`, 'Settings');

			form.data.timezone = timezone;
			form.data.settingsVersion = settingsVersionISO(updatedAt);
			return { form, success: true, message: `Scheduler timezone set to ${timezone}` };
		} catch (error) {
			const message =
				error instanceof Error ? error.message : 'Failed to update the scheduler timezone';
			return fail(500, { form, error: message });
		}
	},

	updateLogSettings: async ({ request }) => {
		const form = await superValidate(request, zod4(LogSettingsSchema), { id: 'logSettings' });
		if (!form.valid) {
			// Promote blank/missing settingsVersion to 409 — matches the monolith's
			// inline-OCC pattern. Superforms aggregates leaf field errors as
			// `string[]` directly under each field name.
			if (form.errors.settingsVersion?.length) {
				return fail(409, {
					form,
					conflict: true,
					error: OCC_CONFLICT_MESSAGE
				});
			}
			return fail(400, { form, error: 'Invalid input' });
		}

		if (
			(await inlineOccCheck(form.data.settingsVersion, LOG_SETTINGS_KEYS)).status === 'conflict'
		) {
			return fail(409, {
				form,
				conflict: true,
				error: OCC_CONFLICT_MESSAGE
			});
		}

		try {
			const writtenAt = await Promise.all([
				setLogRetentionDays(form.data.retentionDays),
				setLogMaxCount(form.data.maxCount),
				setDebugEnabled(form.data.debugEnabled)
			]);
			logger.clearDebugCache();
			// ISSUE-004: refresh the returned settingsVersion to the row's new
			// updatedAt so a second consecutive save in the same page load isn't
			// rejected as a stale-version 409. The hidden field is bind:value-bound
			// to the superForm store, so this propagates without a reload.
			//
			// Derive the version from the timestamps THIS action wrote (max of the
			// three setters) rather than a separate post-write
			// `getAppSettingsUpdatedAt` re-read. The re-read can observe a concurrent
			// writer's newer `updatedAt` and hand the client a version it never wrote,
			// which would then let that client's next stale-UI save pass OCC (TOCTOU).
			const maxWrittenMs = Math.max(...writtenAt.map((d) => d.getTime()));
			form.data.settingsVersion = settingsVersionISO(new Date(maxWrittenMs));
			return { form, success: true, message: 'Logging settings updated' };
		} catch (error) {
			const message =
				error instanceof Error ? error.message : 'Failed to update the logging settings';
			return fail(500, { form, error: message });
		}
	}
});
