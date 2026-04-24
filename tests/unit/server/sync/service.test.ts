import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { desc } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { syncStatus } from '$lib/server/db/schema';

mock.module('$lib/server/plex/client', () => ({
	async *fetchAllHistory() {
		yield { items: [], skippedCount: 0 };
	},
	fetchMetadataBatch: async () => new Map(),
	fetchShowsMetadataBatch: async () => new Map(),
	fetchMediaMetadata: async () => null,
	fetchShowMetadata: async () => null,
	fetchAllHistoryArray: async () => [],
	plexRequest: async () => ({})
}));

mock.module('$lib/server/sync/plex-accounts.service', () => ({
	syncPlexAccounts: async () => {}
}));

const { startSync } = await import('$lib/server/sync/service');

describe('startSync cancellation', () => {
	beforeEach(async () => {
		await db.delete(syncStatus);
	});

	it('persists cancelled status with completedAt when the signal aborts', async () => {
		const controller = new AbortController();
		controller.abort();

		const result = await startSync({ signal: controller.signal });

		expect(result.status).toBe('cancelled');

		const rows = await db.select().from(syncStatus).orderBy(desc(syncStatus.id)).limit(1);
		const row = rows[0];
		expect(row).toBeDefined();
		expect(row?.status).toBe('cancelled');
		expect(row?.completedAt).not.toBeNull();
		expect(row?.error).toBeNull();
		// lastViewedAt should be persisted even for cancelled syncs (null when aborted before any pages)
		expect(row?.lastViewedAt).toBeNull();
	});
});
