import { clearConflictingDbSettings } from '$lib/server/admin/settings.service';
import { logger } from '$lib/server/logging';
import { reconcileInterruptedSyncs } from '$lib/server/sync/reconcile';

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

async function reconcileStartupState(): Promise<void> {
	const clearedSettings = await clearConflictingDbSettings();
	if (clearedSettings.length > 0) {
		logger.info(
			`Reconciled ${clearedSettings.length} startup configuration item(s): ${clearedSettings.join(', ')}`,
			'Startup'
		);
	}
	await reconcileInterruptedSyncs();
}

export const initializeServer = createServerInitializer(reconcileStartupState);
