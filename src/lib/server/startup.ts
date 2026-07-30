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

export const initializeServer = createServerInitializer(reconcileInterruptedSyncs);
