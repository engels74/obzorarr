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
 */
export async function resetSharedTestDb(): Promise<void> {
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
