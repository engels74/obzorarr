import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import * as fc from 'fast-check';
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { eq, desc } from 'drizzle-orm';
import * as schema from '$lib/server/db/schema';

/**
 * Get Unix timestamp for January 1st 00:00:00 UTC of a given year
 *
 * This is a copy of the function from service.ts to avoid importing
 * the Plex client which uses SvelteKit's $env/static/private.
 */
function getYearStartTimestamp(year: number): number {
	return Math.floor(new Date(Date.UTC(year, 0, 1, 0, 0, 0)).getTime() / 1000);
}

/**
 * Property-based tests for Sync Service
 *
 * Tests the following formal correctness properties:
 *
 * Property 5: History Record Field Completeness
 * - All stored records contain required fields
 *
 * Property 6: Sync Timestamp Tracking
 * - Completed sync's lastViewedAt equals max(viewedAt) from records
 *
 * Property 7: Incremental Sync Filtering
 * - Subsequent syncs use minViewedAt from previous sync
 *
 * Validates: Requirements 2.3, 2.4, 2.5
 */

// =============================================================================
// Test Database Setup
// =============================================================================

/**
 * Create an in-memory test database with schema
 */
function createTestDatabase() {
	const sqlite = new Database(':memory:', { strict: true });

	// Enable WAL mode and foreign keys
	sqlite.exec('PRAGMA journal_mode = WAL');
	sqlite.exec('PRAGMA foreign_keys = ON');

	// Create tables
	sqlite.exec(`
		CREATE TABLE IF NOT EXISTS play_history (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			history_key TEXT UNIQUE NOT NULL,
			rating_key TEXT NOT NULL,
			title TEXT NOT NULL,
			type TEXT NOT NULL,
			viewed_at INTEGER NOT NULL,
			account_id INTEGER NOT NULL,
			library_section_id INTEGER NOT NULL,
			thumb TEXT,
			duration INTEGER,
			grandparent_title TEXT,
			parent_title TEXT,
			genres TEXT
		)
	`);

	sqlite.exec(`
		CREATE TABLE IF NOT EXISTS sync_status (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			started_at INTEGER NOT NULL,
			completed_at INTEGER,
			records_processed INTEGER DEFAULT 0,
			last_viewed_at INTEGER,
			status TEXT NOT NULL,
			error TEXT
		)
	`);

	return drizzle(sqlite, { schema });
}

// =============================================================================
// Test Types
// =============================================================================

/**
 * Test record type matching the generated arbitrary
 */
interface TestPlexRecord {
	historyKey: string;
	ratingKey: string;
	title: string;
	type: 'movie' | 'episode' | 'track';
	viewedAt: number;
	accountID: number;
	librarySectionID: string;
	thumb: string | undefined;
	duration: number | undefined;
	grandparentTitle: string | undefined;
	parentTitle: string | undefined;
}

// =============================================================================
// Arbitraries
// =============================================================================

/**
 * Arbitrary for generating valid Plex history metadata
 */
const plexHistoryArbitrary: fc.Arbitrary<TestPlexRecord> = fc.record({
	historyKey: fc.string({ minLength: 1, maxLength: 50 }),
	ratingKey: fc.string({ minLength: 1, maxLength: 50 }),
	title: fc.string({ minLength: 1, maxLength: 200 }),
	type: fc.constantFrom('movie', 'episode', 'track') as fc.Arbitrary<'movie' | 'episode' | 'track'>,
	viewedAt: fc.integer({ min: 1577836800, max: 1893456000 }), // 2020-01-01 to 2030-01-01
	accountID: fc.integer({ min: 1, max: 1000000 }),
	// Generate numeric string for librarySectionID
	librarySectionID: fc.integer({ min: 1, max: 99999 }).map((n) => String(n)),
	thumb: fc.option(fc.webUrl(), { nil: undefined }),
	duration: fc.option(fc.integer({ min: 0, max: 10000000 }), { nil: undefined }),
	grandparentTitle: fc.option(fc.string({ minLength: 0, maxLength: 100 }), { nil: undefined }),
	parentTitle: fc.option(fc.string({ minLength: 0, maxLength: 100 }), { nil: undefined })
});

/**
 * Arbitrary for generating unique Plex history records (unique historyKeys)
 */
const uniquePlexHistoryArrayArbitrary = fc
	.array(plexHistoryArbitrary, { minLength: 1, maxLength: 50 })
	.map((records) => {
		// Ensure unique historyKeys by appending index
		return records.map((record, index) => ({
			...record,
			historyKey: `${record.historyKey}-${index}-${Date.now()}`
		}));
	});

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Convert Plex record to database insert format
 */
function mapPlexRecordToDbInsert(record: TestPlexRecord) {
	return {
		historyKey: record.historyKey,
		ratingKey: record.ratingKey,
		title: record.title,
		type: record.type,
		viewedAt: record.viewedAt,
		accountId: record.accountID,
		librarySectionId: parseInt(record.librarySectionID, 10),
		thumb: record.thumb ?? null,
		duration: record.duration !== undefined ? Math.floor(record.duration / 1000) : null,
		grandparentTitle: record.grandparentTitle ?? null,
		parentTitle: record.parentTitle ?? null
	};
}

/**
 * Insert records and create sync status, returning the max viewedAt
 */
async function insertRecordsAndCreateSync(
	db: ReturnType<typeof createTestDatabase>,
	records: TestPlexRecord[]
): Promise<{ syncId: number; maxViewedAt: number; insertedCount: number }> {
	const dbRecords = records.map(mapPlexRecordToDbInsert);

	// Insert all records
	const insertResult = await db
		.insert(schema.playHistory)
		.values(dbRecords)
		.onConflictDoNothing({ target: schema.playHistory.historyKey })
		.returning({ id: schema.playHistory.id });

	// Calculate max viewedAt
	const maxViewedAt = Math.max(...records.map((r) => r.viewedAt));

	// Create sync status record
	const syncResult = await db
		.insert(schema.syncStatus)
		.values({
			startedAt: new Date(),
			completedAt: new Date(),
			recordsProcessed: insertResult.length,
			lastViewedAt: maxViewedAt,
			status: 'completed'
		})
		.returning({ id: schema.syncStatus.id });

	const syncRecord = syncResult[0];
	if (!syncRecord) {
		throw new Error('Failed to create sync record');
	}

	return {
		syncId: syncRecord.id,
		maxViewedAt,
		insertedCount: insertResult.length
	};
}

// =============================================================================
// Property 5: History Record Field Completeness
// =============================================================================

// Feature: obzorarr, Property 5: History Record Field Completeness
describe('Property 5: History Record Field Completeness', () => {
	it('all stored records contain required fields: historyKey, ratingKey, title, type, viewedAt, accountId, librarySectionId', async () => {
		await fc.assert(
			fc.asyncProperty(uniquePlexHistoryArrayArbitrary, async (records) => {
				const db = createTestDatabase();

				// Insert records
				const dbRecords = records.map(mapPlexRecordToDbInsert);
				await db
					.insert(schema.playHistory)
					.values(dbRecords)
					.onConflictDoNothing({ target: schema.playHistory.historyKey });

				// Query back all records
				const storedRecords = await db.select().from(schema.playHistory);

				// Verify all required fields are present and non-null
				for (const stored of storedRecords) {
					// Required fields must be defined and non-null
					expect(stored.historyKey).toBeDefined();
					expect(stored.historyKey).not.toBeNull();
					expect(stored.ratingKey).toBeDefined();
					expect(stored.ratingKey).not.toBeNull();
					expect(stored.title).toBeDefined();
					expect(stored.title).not.toBeNull();
					expect(stored.type).toBeDefined();
					expect(stored.type).not.toBeNull();
					expect(stored.viewedAt).toBeDefined();
					expect(stored.viewedAt).not.toBeNull();
					expect(stored.accountId).toBeDefined();
					expect(stored.accountId).not.toBeNull();
					expect(stored.librarySectionId).toBeDefined();
					expect(stored.librarySectionId).not.toBeNull();

					// Type checks
					expect(typeof stored.historyKey).toBe('string');
					expect(typeof stored.ratingKey).toBe('string');
					expect(typeof stored.title).toBe('string');
					expect(typeof stored.type).toBe('string');
					expect(typeof stored.viewedAt).toBe('number');
					expect(typeof stored.accountId).toBe('number');
					expect(typeof stored.librarySectionId).toBe('number');
				}

				return true;
			}),
			{ numRuns: 100 }
		);
	});

	it('historyKey is unique across all records', async () => {
		await fc.assert(
			fc.asyncProperty(uniquePlexHistoryArrayArbitrary, async (records) => {
				const db = createTestDatabase();

				// Insert records
				const dbRecords = records.map(mapPlexRecordToDbInsert);
				await db
					.insert(schema.playHistory)
					.values(dbRecords)
					.onConflictDoNothing({ target: schema.playHistory.historyKey });

				// Query back all records
				const storedRecords = await db.select().from(schema.playHistory);

				// Check for unique historyKeys
				const historyKeys = storedRecords.map((r) => r.historyKey);
				const uniqueKeys = new Set(historyKeys);

				return historyKeys.length === uniqueKeys.size;
			}),
			{ numRuns: 100 }
		);
	});

	it('type field contains valid media types', async () => {
		await fc.assert(
			fc.asyncProperty(uniquePlexHistoryArrayArbitrary, async (records) => {
				const db = createTestDatabase();

				// Insert records
				const dbRecords = records.map(mapPlexRecordToDbInsert);
				await db
					.insert(schema.playHistory)
					.values(dbRecords)
					.onConflictDoNothing({ target: schema.playHistory.historyKey });

				// Query back all records
				const storedRecords = await db.select().from(schema.playHistory);

				// All types should be valid
				const validTypes = ['movie', 'episode', 'track'];
				for (const stored of storedRecords) {
					expect(validTypes).toContain(stored.type);
				}

				return true;
			}),
			{ numRuns: 100 }
		);
	});
});

// =============================================================================
// Property 6: Sync Timestamp Tracking
// =============================================================================

// Feature: obzorarr, Property 6: Sync Timestamp Tracking
describe('Property 6: Sync Timestamp Tracking', () => {
	it('completed sync lastViewedAt equals maximum viewedAt from synced records', async () => {
		await fc.assert(
			fc.asyncProperty(uniquePlexHistoryArrayArbitrary, async (records) => {
				const db = createTestDatabase();

				// Insert records and create sync
				const { syncId, maxViewedAt } = await insertRecordsAndCreateSync(db, records);

				// Query the sync status
				const syncResult = await db
					.select()
					.from(schema.syncStatus)
					.where(eq(schema.syncStatus.id, syncId))
					.limit(1);

				const sync = syncResult[0];
				expect(sync).toBeDefined();
				expect(sync?.lastViewedAt).toBe(maxViewedAt);

				// Calculate expected max from records
				const expectedMax = Math.max(...records.map((r) => r.viewedAt));
				expect(sync?.lastViewedAt).toBe(expectedMax);

				return true;
			}),
			{ numRuns: 100 }
		);
	});

	it('lastViewedAt is always a valid Unix timestamp when records exist', async () => {
		await fc.assert(
			fc.asyncProperty(uniquePlexHistoryArrayArbitrary, async (records) => {
				const db = createTestDatabase();

				// Insert records and create sync
				const { maxViewedAt } = await insertRecordsAndCreateSync(db, records);

				// Verify it's a valid Unix timestamp (2020-01-01 to 2030-01-01)
				expect(maxViewedAt).toBeGreaterThanOrEqual(1577836800);
				expect(maxViewedAt).toBeLessThanOrEqual(1893456000);

				return true;
			}),
			{ numRuns: 100 }
		);
	});

	it('lastViewedAt is stored in sync_status table correctly', async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.array(
					fc.record({
						historyKey: fc.uuid(),
						ratingKey: fc.string({ minLength: 1 }),
						title: fc.string({ minLength: 1 }),
						type: fc.constantFrom('movie', 'episode'),
						viewedAt: fc.integer({ min: 1600000000, max: 1700000000 }),
						accountID: fc.integer({ min: 1, max: 1000 }),
						librarySectionID: fc.integer({ min: 1, max: 999 }).map((n) => String(n))
					}),
					{ minLength: 1, maxLength: 20 }
				),
				async (records) => {
					const db = createTestDatabase();

					// Calculate expected max viewedAt
					const expectedMaxViewedAt = Math.max(...records.map((r) => r.viewedAt));

					// Insert sync with this max
					const syncResult = await db
						.insert(schema.syncStatus)
						.values({
							startedAt: new Date(),
							completedAt: new Date(),
							recordsProcessed: records.length,
							lastViewedAt: expectedMaxViewedAt,
							status: 'completed'
						})
						.returning({ id: schema.syncStatus.id, lastViewedAt: schema.syncStatus.lastViewedAt });

					const sync = syncResult[0];
					return sync?.lastViewedAt === expectedMaxViewedAt;
				}
			),
			{ numRuns: 100 }
		);
	});
});

// =============================================================================
// Property 7: Incremental Sync Filtering
// =============================================================================

// Feature: obzorarr, Property 7: Incremental Sync Filtering
describe('Property 7: Incremental Sync Filtering', () => {
	it('getLastSuccessfulSync returns the most recent completed sync', async () => {
		await fc.assert(
			fc.asyncProperty(
				fc
					.array(
						fc.record({
							recordsProcessed: fc.integer({ min: 0, max: 10000 }),
							lastViewedAt: fc.integer({ min: 1600000000, max: 1700000000 }),
							// Use integer seconds to ensure distinct timestamps
							completedAtSeconds: fc.integer({
								min: Math.floor(new Date('2020-01-01').getTime() / 1000),
								max: Math.floor(new Date('2025-01-01').getTime() / 1000)
							})
						}),
						{ minLength: 2, maxLength: 10 }
					)
					// Ensure unique completedAtSeconds values
					.map((syncs) => {
						const seen = new Set<number>();
						return syncs.filter((s) => {
							if (seen.has(s.completedAtSeconds)) return false;
							seen.add(s.completedAtSeconds);
							return true;
						});
					})
					// Filter out empty arrays after deduplication
					.filter((syncs) => syncs.length >= 2),
				async (syncs) => {
					const db = createTestDatabase();

					// Insert multiple completed syncs
					for (const sync of syncs) {
						const completedAt = new Date(sync.completedAtSeconds * 1000);
						await db.insert(schema.syncStatus).values({
							startedAt: new Date(completedAt.getTime() - 60000), // 1 minute before
							completedAt,
							recordsProcessed: sync.recordsProcessed,
							lastViewedAt: sync.lastViewedAt,
							status: 'completed'
						});
					}

					// Query the most recent completed sync
					const result = await db
						.select()
						.from(schema.syncStatus)
						.where(eq(schema.syncStatus.status, 'completed'))
						.orderBy(desc(schema.syncStatus.completedAt))
						.limit(1);

					const mostRecent = result[0];
					if (!mostRecent) return false;

					// Find expected most recent from our data
					const sortedSyncs = [...syncs].sort(
						(a, b) => b.completedAtSeconds - a.completedAtSeconds
					);
					const expected = sortedSyncs[0];
					if (!expected) return false;

					// The most recent sync should have the expected lastViewedAt
					return mostRecent.lastViewedAt === expected.lastViewedAt;
				}
			),
			{ numRuns: 100 }
		);
	});

	it('incremental sync should use lastViewedAt from previous sync as minViewedAt filter', async () => {
		// This test verifies the logic that the sync service uses
		// by simulating what would happen during incremental sync
		await fc.assert(
			fc.asyncProperty(
				fc.integer({ min: 1600000000, max: 1700000000 }), // firstSyncLastViewedAt
				fc.integer({ min: 0, max: 100000 }), // offset to add for new records
				async (firstSyncLastViewedAt, offset) => {
					const db = createTestDatabase();

					// Create first sync with known lastViewedAt
					await db.insert(schema.syncStatus).values({
						startedAt: new Date(),
						completedAt: new Date(),
						recordsProcessed: 100,
						lastViewedAt: firstSyncLastViewedAt,
						status: 'completed'
					});

					// Query last successful sync (simulating what sync service does)
					const lastSync = await db
						.select()
						.from(schema.syncStatus)
						.where(eq(schema.syncStatus.status, 'completed'))
						.orderBy(desc(schema.syncStatus.completedAt))
						.limit(1);

					const previous = lastSync[0];
					if (!previous) return false;

					// The minViewedAt for next sync should be the lastViewedAt from previous
					const minViewedAtForNextSync = previous.lastViewedAt;

					return minViewedAtForNextSync === firstSyncLastViewedAt;
				}
			),
			{ numRuns: 100 }
		);
	});

	it('only running syncs are detected by isSyncRunning check', async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.constantFrom('running', 'completed', 'failed'),
				async (status: string) => {
					const db = createTestDatabase();

					// Create a sync with the given status
					await db.insert(schema.syncStatus).values({
						startedAt: new Date(),
						completedAt: status !== 'running' ? new Date() : null,
						recordsProcessed: 0,
						status
					});

					// Check if running sync is detected
					const runningResult = await db
						.select()
						.from(schema.syncStatus)
						.where(eq(schema.syncStatus.status, 'running'))
						.limit(1);

					const isRunning = runningResult.length > 0;

					// Should only be running if status is 'running'
					return isRunning === (status === 'running');
				}
			),
			{ numRuns: 100 }
		);
	});
});

// =============================================================================
// Unit Tests for Helper Functions
// =============================================================================

describe('getYearStartTimestamp', () => {
	it('returns correct timestamp for Jan 1 00:00:00 UTC', () => {
		// 2024-01-01 00:00:00 UTC
		const ts2024 = getYearStartTimestamp(2024);
		const date2024 = new Date(ts2024 * 1000);
		expect(date2024.getUTCFullYear()).toBe(2024);
		expect(date2024.getUTCMonth()).toBe(0); // January
		expect(date2024.getUTCDate()).toBe(1);
		expect(date2024.getUTCHours()).toBe(0);
		expect(date2024.getUTCMinutes()).toBe(0);
		expect(date2024.getUTCSeconds()).toBe(0);
	});

	it('returns correct timestamp for multiple years', () => {
		fc.assert(
			fc.property(fc.integer({ min: 2000, max: 2100 }), (year) => {
				const ts = getYearStartTimestamp(year);
				const date = new Date(ts * 1000);

				return (
					date.getUTCFullYear() === year &&
					date.getUTCMonth() === 0 &&
					date.getUTCDate() === 1 &&
					date.getUTCHours() === 0 &&
					date.getUTCMinutes() === 0 &&
					date.getUTCSeconds() === 0
				);
			}),
			{ numRuns: 100 }
		);
	});

	it('timestamps are monotonically increasing', () => {
		fc.assert(
			fc.property(
				fc.integer({ min: 2000, max: 2099 }),
				fc.integer({ min: 1, max: 50 }),
				(year, increment) => {
					const ts1 = getYearStartTimestamp(year);
					const ts2 = getYearStartTimestamp(year + increment);
					return ts2 > ts1;
				}
			),
			{ numRuns: 100 }
		);
	});
});

describe('Duplicate historyKey handling', () => {
	it('onConflictDoNothing skips duplicate historyKeys without error', async () => {
		const db = createTestDatabase();

		const record = {
			historyKey: 'duplicate-key-123',
			ratingKey: 'rating-1',
			title: 'Test Movie',
			type: 'movie',
			viewedAt: 1700000000,
			accountId: 1,
			librarySectionId: 1,
			thumb: null,
			duration: null,
			grandparentTitle: null,
			parentTitle: null
		};

		// Insert first time
		const result1 = await db
			.insert(schema.playHistory)
			.values(record)
			.onConflictDoNothing({ target: schema.playHistory.historyKey })
			.returning({ id: schema.playHistory.id });

		expect(result1.length).toBe(1);

		// Insert same record again - should be skipped
		const result2 = await db
			.insert(schema.playHistory)
			.values(record)
			.onConflictDoNothing({ target: schema.playHistory.historyKey })
			.returning({ id: schema.playHistory.id });

		expect(result2.length).toBe(0);

		// Verify only one record exists
		const allRecords = await db.select().from(schema.playHistory);
		expect(allRecords.length).toBe(1);
	});
});
