import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { syncStatus } from '$lib/server/db/schema';
import { logger } from '$lib/server/logging';

/**
 * Marks any pre-existing `running` sync rows as failed. A crash or restart
 * mid-sync leaves `status='running'` forever, which would otherwise permanently
 * block every future sync via the atomic single-flight claim in
 * `createSyncRecord` (ISSUE-001, restart deadlock). Runs exactly once at process
 * start (from `db/client.ts`, right after migrations) — before any request can
 * begin a sync — so it can never clobber a sync started by this process.
 *
 * Kept in its own lightweight module (importing only `db`, the schema, and the
 * logger — no Plex/`$env` graph) so `db/client.ts` can call it at boot without
 * pulling SvelteKit virtual modules into raw-bun import contexts.
 *
 * Returns the number of interrupted rows reconciled.
 */
export async function reconcileInterruptedSyncs(): Promise<number> {
	const running = await db
		.select({ id: syncStatus.id })
		.from(syncStatus)
		.where(eq(syncStatus.status, 'running'));

	if (running.length === 0) {
		return 0;
	}

	await db
		.update(syncStatus)
		.set({
			status: 'failed',
			completedAt: new Date(),
			error: 'Interrupted by restart'
		})
		.where(eq(syncStatus.status, 'running'));

	logger.warn(
		`Reconciled ${running.length} interrupted sync(s) left running by a previous restart`,
		'Sync'
	);

	return running.length;
}
