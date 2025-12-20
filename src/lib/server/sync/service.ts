import { db } from '$lib/server/db/client';
import { playHistory, syncStatus } from '$lib/server/db/schema';
import { fetchAllHistory, fetchMetadataBatch } from '$lib/server/plex/client';
import type { ValidPlexHistoryMetadata } from '$lib/server/plex/types';
import { eq, desc, isNull } from 'drizzle-orm';
import type { StartSyncOptions, SyncResult, SyncProgress, SyncStatusRecord } from './types';
import { logger } from '$lib/server/logging';
import { invalidateCache } from '$lib/server/stats/engine';

/**
 * Sync Service
 *
 * Core sync logic for fetching play history from Plex and storing it
 * in the database. Supports both full backfill and incremental sync.
 *
 * Implements Requirements:
 * - 2.1: Fetch from Plex API /status/sessions/history/all
 * - 2.3: Store required fields in play_history table
 * - 2.4: Store timestamp of most recent viewedAt
 * - 2.5: Only fetch records with viewedAt > lastSyncTimestamp
 * - 2.6: Support backfilling from January 1st of a given year
 *
 * @module sync/service
 */

// =============================================================================
// Constants
// =============================================================================

/**
 * Default page size for fetching history
 */
const DEFAULT_PAGE_SIZE = 100;

/**
 * How often to update sync progress in database (every N pages)
 */
const PROGRESS_UPDATE_INTERVAL = 5;

// =============================================================================
// Error Types
// =============================================================================

/**
 * Custom error for sync operations
 */
export class SyncError extends Error {
	constructor(
		message: string,
		public readonly syncId?: number,
		public readonly cause?: unknown
	) {
		super(message);
		this.name = 'SyncError';
	}
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get Unix timestamp for January 1st 00:00:00 UTC of a given year
 *
 * Used for backfill mode to fetch all history from the start of a year.
 *
 * @param year - The year to get the start timestamp for
 * @returns Unix timestamp in seconds
 */
export function getYearStartTimestamp(year: number): number {
	return Math.floor(new Date(Date.UTC(year, 0, 1, 0, 0, 0)).getTime() / 1000);
}

/**
 * Convert ValidPlexHistoryMetadata to database insert format
 *
 * Maps Plex API fields to database columns.
 * Implements Requirement 2.3: Store required fields.
 *
 * Note: Uses ValidPlexHistoryMetadata which guarantees ratingKey is present.
 */
function mapPlexRecordToDbInsert(record: ValidPlexHistoryMetadata) {
	return {
		historyKey: record.historyKey,
		ratingKey: record.ratingKey,
		title: record.title,
		type: record.type,
		viewedAt: record.viewedAt,
		accountId: record.accountID,
		librarySectionId: parseInt(record.librarySectionID, 10),
		thumb: record.thumb ?? null,
		// Convert duration from milliseconds to seconds if present
		duration: record.duration !== undefined ? Math.floor(record.duration / 1000) : null,
		grandparentTitle: record.grandparentTitle ?? null,
		parentTitle: record.parentTitle ?? null
	};
}

// =============================================================================
// Sync Status Functions
// =============================================================================

/**
 * Get the last successful sync status
 *
 * Used for incremental sync to determine the starting timestamp.
 *
 * @returns The last completed sync record, or null if none exists
 */
export async function getLastSuccessfulSync(): Promise<SyncStatusRecord | null> {
	const result = await db
		.select()
		.from(syncStatus)
		.where(eq(syncStatus.status, 'completed'))
		.orderBy(desc(syncStatus.completedAt))
		.limit(1);

	const record = result[0];
	if (!record) return null;

	return {
		id: record.id,
		startedAt: record.startedAt,
		completedAt: record.completedAt,
		recordsProcessed: record.recordsProcessed ?? 0,
		lastViewedAt: record.lastViewedAt,
		status: record.status as SyncStatusRecord['status'],
		error: record.error
	};
}

/**
 * Get the current running sync (if any)
 *
 * @returns The running sync record, or null if none is running
 */
export async function getRunningSync(): Promise<SyncStatusRecord | null> {
	const result = await db
		.select()
		.from(syncStatus)
		.where(eq(syncStatus.status, 'running'))
		.limit(1);

	const record = result[0];
	if (!record) return null;

	return {
		id: record.id,
		startedAt: record.startedAt,
		completedAt: record.completedAt,
		recordsProcessed: record.recordsProcessed ?? 0,
		lastViewedAt: record.lastViewedAt,
		status: record.status as SyncStatusRecord['status'],
		error: record.error
	};
}

/**
 * Check if a sync is currently running
 *
 * @returns True if a sync is in progress
 */
export async function isSyncRunning(): Promise<boolean> {
	const running = await getRunningSync();
	return running !== null;
}

/**
 * Create a new sync status record with 'running' status
 *
 * @returns The ID of the new sync record
 */
async function createSyncRecord(): Promise<number> {
	const result = await db
		.insert(syncStatus)
		.values({
			startedAt: new Date(),
			status: 'running',
			recordsProcessed: 0
		})
		.returning({ id: syncStatus.id });

	const record = result[0];
	if (!record) {
		throw new SyncError('Failed to create sync status record');
	}
	return record.id;
}

/**
 * Update sync status to completed
 *
 * Implements Requirement 2.4: Store timestamp of most recent viewedAt.
 */
async function completeSyncRecord(
	syncId: number,
	recordsProcessed: number,
	lastViewedAt: number | null
): Promise<void> {
	await db
		.update(syncStatus)
		.set({
			status: 'completed',
			completedAt: new Date(),
			recordsProcessed,
			lastViewedAt
		})
		.where(eq(syncStatus.id, syncId));
}

/**
 * Update sync status to failed
 */
async function failSyncRecord(syncId: number, error: string): Promise<void> {
	await db
		.update(syncStatus)
		.set({
			status: 'failed',
			completedAt: new Date(),
			error
		})
		.where(eq(syncStatus.id, syncId));
}

/**
 * Update records processed count during sync
 */
async function updateSyncProgress(syncId: number, recordsProcessed: number): Promise<void> {
	await db.update(syncStatus).set({ recordsProcessed }).where(eq(syncStatus.id, syncId));
}

// =============================================================================
// Core Sync Functions
// =============================================================================

/**
 * Insert a batch of play history records, handling duplicates gracefully
 *
 * Uses INSERT OR IGNORE (via onConflictDoNothing) to skip duplicate historyKeys
 * without failing the entire batch.
 *
 * @param records - Array of validated Plex history metadata records (with ratingKey guaranteed)
 * @returns Count of inserted and skipped records
 */
async function insertHistoryBatch(
	records: ValidPlexHistoryMetadata[]
): Promise<{ inserted: number; skipped: number }> {
	if (records.length === 0) {
		return { inserted: 0, skipped: 0 };
	}

	const dbRecords = records.map(mapPlexRecordToDbInsert);

	// Use onConflictDoNothing for upsert behavior on historyKey
	const result = await db
		.insert(playHistory)
		.values(dbRecords)
		.onConflictDoNothing({ target: playHistory.historyKey })
		.returning({ id: playHistory.id });

	const inserted = result.length;
	const skipped = records.length - inserted;

	return { inserted, skipped };
}

/**
 * Start a sync operation
 *
 * This is the main entry point for syncing play history from Plex.
 *
 * Implements Requirements:
 * - 2.1: Fetches from Plex API /status/sessions/history/all
 * - 2.3: Stores required fields in play_history table
 * - 2.4: Stores timestamp of most recent viewedAt
 * - 2.5: Uses minViewedAt for incremental sync
 * - 2.6: Supports backfilling from January 1st of a given year
 *
 * @param options - Sync options including backfillYear, signal, onProgress
 * @returns Result of the sync operation
 * @throws SyncError if a sync is already running
 */
export async function startSync(options: StartSyncOptions = {}): Promise<SyncResult> {
	const { backfillYear, signal, onProgress } = options;
	const startTime = Date.now();

	// Check if sync is already running
	if (await isSyncRunning()) {
		throw new SyncError('A sync operation is already in progress');
	}

	// Create sync status record
	const syncId = await createSyncRecord();

	let recordsProcessed = 0;
	let recordsInserted = 0;
	let recordsSkipped = 0;
	let maxViewedAt: number | null = null;
	let currentPage = 0;

	try {
		// Determine minViewedAt for filtering
		let minViewedAt: number | undefined;

		if (backfillYear !== undefined) {
			// Backfill mode: start from Jan 1 of the specified year
			// Implements Requirement 2.6
			minViewedAt = getYearStartTimestamp(backfillYear);
			logger.info(
				`Starting backfill from ${new Date(minViewedAt * 1000).toISOString()}`,
				`Sync-${syncId}`
			);
		} else {
			// Incremental mode: start from last successful sync's lastViewedAt
			// Implements Requirement 2.5
			const lastSync = await getLastSuccessfulSync();
			if (lastSync?.lastViewedAt) {
				minViewedAt = lastSync.lastViewedAt;
				logger.info(
					`Starting incremental sync from ${new Date(minViewedAt * 1000).toISOString()}`,
					`Sync-${syncId}`
				);
			} else {
				logger.info('No previous sync found, fetching all history', `Sync-${syncId}`);
			}
		}

		// Fetch and process history pages
		// Implements Requirement 2.1
		for await (const { items: page, skippedCount } of fetchAllHistory({
			pageSize: DEFAULT_PAGE_SIZE,
			minViewedAt,
			signal
		})) {
			currentPage++;

			// Accumulate items skipped due to missing required fields (validation)
			recordsSkipped += skippedCount;

			// Insert batch and track results
			// Implements Requirement 2.3
			const { inserted, skipped: dbSkipped } = await insertHistoryBatch(page);

			recordsProcessed += page.length;
			recordsInserted += inserted;
			recordsSkipped += dbSkipped;

			// Track maximum viewedAt for this sync
			// Implements Requirement 2.4
			for (const record of page) {
				if (maxViewedAt === null || record.viewedAt > maxViewedAt) {
					maxViewedAt = record.viewedAt;
				}
			}

			// Update progress in database periodically
			if (currentPage % PROGRESS_UPDATE_INTERVAL === 0) {
				await updateSyncProgress(syncId, recordsProcessed);
			}

			// Report progress via callback
			onProgress?.({
				recordsProcessed,
				recordsInserted,
				recordsSkipped,
				currentPage,
				isComplete: false
			});

			// Check for cancellation
			if (signal?.aborted) {
				throw new SyncError('Sync cancelled', syncId);
			}
		}

		// Complete the sync
		await completeSyncRecord(syncId, recordsProcessed, maxViewedAt);

		// Invalidate stats cache for affected years
		if (recordsInserted > 0) {
			const minYear = minViewedAt
				? new Date(minViewedAt * 1000).getUTCFullYear()
				: new Date().getUTCFullYear();
			const maxYear = maxViewedAt
				? new Date(maxViewedAt * 1000).getUTCFullYear()
				: new Date().getUTCFullYear();

			for (let year = minYear; year <= maxYear; year++) {
				await invalidateCache(undefined, year);
			}

			logger.info(`Invalidated stats cache for years ${minYear}-${maxYear}`, `Sync-${syncId}`);
		}

		// Enrich records with duration data from Plex metadata
		if (recordsInserted > 0) {
			logger.info('Starting duration enrichment...', `Sync-${syncId}`);
			const enrichResult = await enrichDurations({ signal });
			logger.info(
				`Duration enrichment: ${enrichResult.enriched} enriched, ${enrichResult.failed} failed`,
				`Sync-${syncId}`
			);

			// Invalidate cache again after enrichment to include duration data
			if (enrichResult.enriched > 0) {
				const enrichMinYear = minViewedAt
					? new Date(minViewedAt * 1000).getUTCFullYear()
					: new Date().getUTCFullYear();
				const enrichMaxYear = maxViewedAt
					? new Date(maxViewedAt * 1000).getUTCFullYear()
					: new Date().getUTCFullYear();

				for (let year = enrichMinYear; year <= enrichMaxYear; year++) {
					await invalidateCache(undefined, year);
				}
			}
		}

		// Final progress update
		onProgress?.({
			recordsProcessed,
			recordsInserted,
			recordsSkipped,
			currentPage,
			isComplete: true
		});

		const durationMs = Date.now() - startTime;
		logger.info(
			`Completed: ${recordsProcessed} processed, ${recordsInserted} inserted, ${recordsSkipped} skipped in ${durationMs}ms`,
			`Sync-${syncId}`
		);

		return {
			syncId,
			status: 'completed',
			recordsProcessed,
			recordsInserted,
			recordsSkipped,
			lastViewedAt: maxViewedAt,
			startedAt: new Date(startTime),
			completedAt: new Date(),
			durationMs
		};
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);

		// Mark sync as failed
		await failSyncRecord(syncId, errorMessage);

		logger.error(`Failed: ${errorMessage}`, `Sync-${syncId}`);

		return {
			syncId,
			status: 'failed',
			recordsProcessed,
			recordsInserted,
			recordsSkipped,
			lastViewedAt: null,
			startedAt: new Date(startTime),
			completedAt: new Date(),
			error: errorMessage,
			durationMs: Date.now() - startTime
		};
	}
}

/**
 * Get sync history (most recent first)
 *
 * @param limit - Maximum number of records to return
 * @returns Array of sync status records
 */
export async function getSyncHistory(limit: number = 10): Promise<SyncStatusRecord[]> {
	const results = await db
		.select()
		.from(syncStatus)
		.orderBy(desc(syncStatus.startedAt))
		.limit(limit);

	return results.map((record) => ({
		id: record.id,
		startedAt: record.startedAt,
		completedAt: record.completedAt,
		recordsProcessed: record.recordsProcessed ?? 0,
		lastViewedAt: record.lastViewedAt,
		status: record.status as SyncStatusRecord['status'],
		error: record.error
	}));
}

/**
 * Get total play history record count
 *
 * @returns Total number of records in play_history table
 */
export async function getPlayHistoryCount(): Promise<number> {
	const result = await db.select({ id: playHistory.id }).from(playHistory);
	return result.length;
}

// =============================================================================
// Duration Enrichment
// =============================================================================

/**
 * Options for duration enrichment
 */
export interface EnrichDurationsOptions {
	/** Number of records to process per batch (default: 50) */
	batchSize?: number;
	/** Abort signal for cancellation */
	signal?: AbortSignal;
	/** Progress callback */
	onProgress?: (processed: number, total: number) => void;
}

/**
 * Result of duration enrichment
 */
export interface EnrichDurationsResult {
	/** Number of records successfully enriched with duration */
	enriched: number;
	/** Number of records where duration fetch failed */
	failed: number;
}

/**
 * Enrich play history records with duration from Plex library metadata
 *
 * The Plex history endpoint does not include duration for each play.
 * This function fetches duration from the library metadata endpoint
 * for records that are missing duration data.
 *
 * @param options - Enrichment options
 * @returns Count of enriched and failed records
 */
export async function enrichDurations(
	options: EnrichDurationsOptions = {}
): Promise<EnrichDurationsResult> {
	const { batchSize = 50, signal, onProgress } = options;

	// Get records with NULL duration
	const records = await db
		.select({ id: playHistory.id, ratingKey: playHistory.ratingKey })
		.from(playHistory)
		.where(isNull(playHistory.duration));

	if (records.length === 0) {
		return { enriched: 0, failed: 0 };
	}

	logger.info(`Found ${records.length} records needing duration enrichment`, 'Enrichment');

	let enriched = 0;
	let failed = 0;

	// Process in batches
	for (let i = 0; i < records.length; i += batchSize) {
		// Check for cancellation before each batch
		if (signal?.aborted) {
			logger.info('Duration enrichment cancelled', 'Enrichment');
			break;
		}

		const batch = records.slice(i, i + batchSize);
		const ratingKeys = batch.map((r) => r.ratingKey);

		// Fetch durations from Plex
		const durations = await fetchMetadataBatch(ratingKeys, signal);

		// Update records with durations
		for (const record of batch) {
			const duration = durations.get(record.ratingKey);
			if (duration !== null && duration !== undefined) {
				await db.update(playHistory).set({ duration }).where(eq(playHistory.id, record.id));
				enriched++;
			} else {
				failed++;
			}
		}

		// Report progress
		onProgress?.(i + batch.length, records.length);
	}

	return { enriched, failed };
}
