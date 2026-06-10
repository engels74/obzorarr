import { db } from '$lib/server/db/client';
import {
	appSettings,
	cachedStats,
	customSlides,
	logs,
	metadataCache,
	pinTransactions,
	playHistory,
	plexAccounts,
	sessions,
	shareSettings,
	slideConfig,
	syncStatus,
	users
} from '$lib/server/db/schema';
import { clearSyncProgress } from '$lib/server/sync/progress';

export const sharedTestDbTables = {
	appSettings,
	cachedStats,
	customSlides,
	logs,
	metadataCache,
	pinTransactions,
	playHistory,
	plexAccounts,
	sessions,
	shareSettings,
	slideConfig,
	syncStatus,
	users
} as const;

/**
 * Reset every table created by tests/setup.ts for tests that use the shared
 * app DB singleton. Keep the order foreign-key safe: child/share rows go before
 * users even though most test DDL intentionally keeps reduced constraints.
 *
 * Also clears the in-memory sync-progress global (`progress.ts`). It is the
 * companion to the `sync_status` table — `getSyncStatus()` reads both — but it
 * is module state that survives DB wipes. Tests that exercise the real
 * `startBackgroundSync()` path leave it set to a `running` snapshot, which then
 * leaks into later files (e.g. the wrapped-layout sync-status gate) depending on
 * file execution order. Resetting it here keeps it in lockstep with the table.
 */
export async function resetSharedTestDb(): Promise<void> {
	clearSyncProgress();
	await db.delete(shareSettings);
	await db.delete(cachedStats);
	await db.delete(playHistory);
	await db.delete(syncStatus);
	await db.delete(metadataCache);
	await db.delete(sessions);
	await db.delete(pinTransactions);
	await db.delete(logs);
	await db.delete(plexAccounts);
	await db.delete(customSlides);
	await db.delete(slideConfig);
	await db.delete(appSettings);
	await db.delete(users);
}
