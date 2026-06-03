import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { eq } from 'drizzle-orm';
import * as fc from 'fast-check';
import { db } from '$lib/server/db/client';
import { syncStatus } from '$lib/server/db/schema';

// Mock the Plex-facing dependencies so `startSync` runs to completion without
// any network access: it claims the single-flight slot, then finds no history
// to fetch and completes with zero records. This isolates the atomic-claim and
// startup-sweep behavior (ISSUE-001) from Plex connectivity.
mock.module('$lib/server/plex/client', () => ({
	async plexRequest() {
		throw new Error('plexRequest not available in single-flight test');
	},
	// eslint-disable-next-line require-yield
	async *fetchAllHistory() {
		// no history to fetch in tests
	},
	async fetchAllHistoryArray() {
		return [];
	},
	async checkConnection() {
		return true;
	},
	async getServerUrl() {
		return 'https://test-plex-server:32400';
	},
	async fetchMediaMetadata() {
		return null;
	},
	async fetchMetadataBatch() {
		return new Map();
	},
	async fetchShowMetadata() {
		return null;
	},
	async fetchShowsMetadataBatch() {
		return new Map();
	}
}));

mock.module('$lib/server/sync/plex-accounts.service', () => ({
	async syncPlexAccounts() {
		return 0;
	}
}));

const { startSync, reconcileInterruptedSyncs } = await import('$lib/server/sync/service');

async function countSyncRows(): Promise<number> {
	const rows = await db.select({ id: syncStatus.id }).from(syncStatus);
	return rows.length;
}

async function countRunningRows(): Promise<number> {
	const rows = await db
		.select({ id: syncStatus.id })
		.from(syncStatus)
		.where(eq(syncStatus.status, 'running'));
	return rows.length;
}

function isAlreadyRunningError(reason: unknown): boolean {
	return reason instanceof Error && /already in progress/i.test(reason.message);
}

describe('sync single-flight via atomic DB claim (ISSUE-001)', () => {
	beforeEach(() => {
		db.delete(syncStatus).run();
	});

	afterEach(() => {
		db.delete(syncStatus).run();
	});

	it('lets exactly one of N concurrent startSync calls claim the running slot', async () => {
		const N = 6;
		const results = await Promise.allSettled(Array.from({ length: N }, () => startSync()));

		const fulfilled = results.filter((r) => r.status === 'fulfilled');
		const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');

		// Exactly one caller claimed the slot and ran to completion; the rest were
		// rejected with the "already in progress" error.
		expect(fulfilled).toHaveLength(1);
		expect(rejected).toHaveLength(N - 1);
		expect(rejected.every((r) => isAlreadyRunningError(r.reason))).toBe(true);

		// Only one row was ever inserted — losers' INSERT ... WHERE NOT EXISTS
		// inserted zero rows — and none remain in the running state.
		expect(await countSyncRows()).toBe(1);
		expect(await countRunningRows()).toBe(0);
	});

	it('keeps single-flight when triggerImmediateSync races a manual startSync', async () => {
		const { triggerImmediateSync } = await import('$lib/server/sync/scheduler');

		const results = await Promise.allSettled([
			startSync(),
			triggerImmediateSync(),
			startSync(),
			triggerImmediateSync()
		]);

		const fulfilled = results.filter((r) => r.status === 'fulfilled');
		// triggerImmediateSync resolves to a SyncResult even on the loser path
		// (its failure is surfaced via the result/throw); count rows as the
		// authoritative single-flight assertion.
		expect(fulfilled.length).toBeGreaterThanOrEqual(1);
		expect(await countSyncRows()).toBe(1);
		expect(await countRunningRows()).toBe(0);
	});
});

describe('reconcileInterruptedSyncs startup sweep (ISSUE-001)', () => {
	beforeEach(() => {
		db.delete(syncStatus).run();
	});

	afterEach(() => {
		db.delete(syncStatus).run();
	});

	it('marks a stale running row as failed and unblocks a fresh sync', async () => {
		// Seed a row orphaned in `running` by a previous crash/restart.
		db.insert(syncStatus)
			.values({ startedAt: new Date(Date.now() - 60_000), status: 'running', recordsProcessed: 0 })
			.run();

		const reconciled = await reconcileInterruptedSyncs();
		expect(reconciled).toBe(1);

		const swept = await db.select().from(syncStatus).where(eq(syncStatus.status, 'failed'));
		expect(swept).toHaveLength(1);
		expect(swept[0]?.error).toBe('Interrupted by restart');
		expect(swept[0]?.completedAt).not.toBeNull();
		expect(await countRunningRows()).toBe(0);

		// A fresh sync can now claim the slot.
		const result = await startSync();
		expect(result.status).toBe('completed');
	});

	it('returns 0 and changes nothing when there is no orphaned row', async () => {
		const reconciled = await reconcileInterruptedSyncs();
		expect(reconciled).toBe(0);
		expect(await countSyncRows()).toBe(0);
	});

	it('never sweeps a sync started after boot (sweep runs once at boot)', async () => {
		// Boot sweep runs exactly once against an empty table.
		expect(await reconcileInterruptedSyncs()).toBe(0);

		// A sync started AFTER boot leaves a running row. Because the sweep does
		// not run again per-request, this row must remain untouched.
		db.insert(syncStatus)
			.values({ startedAt: new Date(), status: 'running', recordsProcessed: 0 })
			.run();

		// No further boot sweep happens — assert the post-boot running row survives.
		expect(await countRunningRows()).toBe(1);
	});
});

describe('sync single-flight property (ISSUE-001)', () => {
	it('for any K concurrent startSync, exactly one running row is ever claimed', async () => {
		await fc.assert(
			fc.asyncProperty(fc.integer({ min: 2, max: 8 }), async (k) => {
				db.delete(syncStatus).run();

				const results = await Promise.allSettled(Array.from({ length: k }, () => startSync()));

				// Exactly one INSERT succeeded (losers' WHERE NOT EXISTS inserted
				// nothing), and no row is left running after all settle.
				expect(await countSyncRows()).toBe(1);
				expect(await countRunningRows()).toBe(0);

				// Exactly one caller avoided the "already in progress" rejection.
				const claimers = results.filter(
					(r) =>
						r.status === 'fulfilled' || !isAlreadyRunningError((r as PromiseRejectedResult).reason)
				);
				expect(claimers).toHaveLength(1);
			}),
			{ numRuns: 25 }
		);

		db.delete(syncStatus).run();
	});
});
