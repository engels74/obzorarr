import {
	clearConflictingDbSettings,
	getSchedulerTimezone
} from '$lib/server/admin/settings.service';
import { logger, setupLogRetentionScheduler } from '$lib/server/logging';
import { reconcileInterruptedSyncs } from '$lib/server/sync/reconcile';
import { restoreSyncScheduler } from '$lib/server/sync/scheduler-state';

type StartupTask = () => Promise<unknown>;

export function createServerInitializer(task: StartupTask): () => Promise<void> {
	let initialization: Promise<void> | undefined;

	return () => {
		initialization ??= Promise.resolve()
			.then(task)
			.then(() => undefined);
		return initialization;
	};
}

/**
 * Brings both cron jobs up with the effective timezone before the first request.
 *
 * Neither job used to exist until an admin opened a page (`/admin/sync` for the
 * sync schedule, `/admin/logs` for retention), so a restart dropped a configured
 * schedule entirely and log retention only ran on instances whose admin happened
 * to visit the logs page. A failure here must not block startup: the request
 * pipeline is still serviceable without a scheduler.
 */
async function startSchedulers(): Promise<void> {
	try {
		const timezone = await getSchedulerTimezone();
		setupLogRetentionScheduler({ timezone });
		await restoreSyncScheduler(timezone);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		logger.error(`Failed to start schedulers: ${message}`, 'Startup');
	}
}

async function reconcileStartupState(): Promise<void> {
	const clearedSettings = await clearConflictingDbSettings();
	if (clearedSettings.length > 0) {
		logger.info(
			`Reconciled ${clearedSettings.length} startup configuration item(s): ${clearedSettings.join(', ')}`,
			'Startup'
		);
	}
	await reconcileInterruptedSyncs();
	await startSchedulers();
}

export const initializeServer = createServerInitializer(reconcileStartupState);
