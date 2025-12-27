import { db } from '$lib/server/db/client';
import { playHistory, syncStatus, metadataCache } from '$lib/server/db/schema';
import { fetchAllHistory, fetchMetadataBatch } from '$lib/server/plex/client';
import type { ValidPlexHistoryMetadata } from '$lib/server/plex/types';
import { eq, desc, isNull, or, inArray, count } from 'drizzle-orm';
import type { StartSyncOptions, SyncResult, SyncProgress, SyncStatusRecord } from './types';
import { logger } from '$lib/server/logging';
import { invalidateCache } from '$lib/server/stats/engine';
import { syncPlexAccounts } from './plex-accounts.service';

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
		// Sync Plex server members first to ensure usernames are available for stats
		// This populates the plex_accounts table with all server members (owner + shared users)
		try {
			await syncPlexAccounts();
		} catch (error) {
			// Log but don't fail the sync if Plex accounts sync fails
			logger.warn(
				`Failed to sync Plex accounts: ${error instanceof Error ? error.message : 'Unknown error'}. Top Contributors may show generic usernames.`,
				`Sync-${syncId}`
			);
		}

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

		// Enrich records with metadata (duration, genres) from Plex
		if (recordsInserted > 0) {
			logger.info('Starting metadata enrichment...', `Sync-${syncId}`);

			// Signal phase change to enriching
			onProgress?.({
				recordsProcessed,
				recordsInserted,
				recordsSkipped,
				currentPage,
				isComplete: false,
				phase: 'enriching',
				enrichmentTotal: 0,
				enrichmentProcessed: 0
			});

			// Track last logged percentage for 5% interval logging
			let lastLoggedPercent = -5;

			const enrichResult = await enrichMetadata({
				signal,
				onProgress: (processed, total) => {
					const percent = total > 0 ? Math.round((processed / total) * 100) : 0;

					// Log at 5% intervals (5%, 10%, 15%, ... 100%)
					if (percent >= lastLoggedPercent + 5 || processed === total) {
						logger.info(
							`Enriched ${processed.toLocaleString()}/${total.toLocaleString()} (${percent}%)`,
							'Enrichment'
						);
						lastLoggedPercent = percent;
					}

					// Update external progress callback on every batch
					onProgress?.({
						recordsProcessed,
						recordsInserted,
						recordsSkipped,
						currentPage,
						isComplete: false,
						phase: 'enriching',
						enrichmentTotal: total,
						enrichmentProcessed: processed
					});
				}
			});

			logger.info(
				`Metadata enrichment: ${enrichResult.enriched} enriched, ${enrichResult.failed} failed`,
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

		// Complete the sync record in database (after enrichment)
		await completeSyncRecord(syncId, recordsProcessed, maxViewedAt);

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
 * Pagination options for sync history
 */
export interface SyncHistoryPaginationOptions {
	/** Page number (1-indexed) */
	page?: number;
	/** Number of records per page */
	pageSize?: number;
}

/**
 * Paginated sync history result
 */
export interface PaginatedSyncHistory {
	/** Array of sync status records for the current page */
	items: SyncStatusRecord[];
	/** Total number of sync records */
	total: number;
	/** Current page number (1-indexed) */
	page: number;
	/** Number of records per page */
	pageSize: number;
	/** Total number of pages */
	totalPages: number;
}

/**
 * Get total count of sync history records
 *
 * @returns Total number of sync status records
 */
export async function getSyncHistoryCount(): Promise<number> {
	const result = await db.select({ count: count() }).from(syncStatus);
	return result[0]?.count ?? 0;
}

/**
 * Get sync history with pagination (most recent first)
 *
 * @param options - Pagination options (page, pageSize)
 * @returns Paginated sync history with items and metadata
 */
export async function getSyncHistory(
	options: SyncHistoryPaginationOptions = {}
): Promise<PaginatedSyncHistory> {
	const { page = 1, pageSize = 15 } = options;

	// Calculate offset
	const offset = (page - 1) * pageSize;

	// Get total count and items in parallel
	const [totalResult, results] = await Promise.all([
		db.select({ count: count() }).from(syncStatus),
		db.select().from(syncStatus).orderBy(desc(syncStatus.startedAt)).limit(pageSize).offset(offset)
	]);

	const total = totalResult[0]?.count ?? 0;
	const totalPages = Math.ceil(total / pageSize);

	const items = results.map((record) => ({
		id: record.id,
		startedAt: record.startedAt,
		completedAt: record.completedAt,
		recordsProcessed: record.recordsProcessed ?? 0,
		lastViewedAt: record.lastViewedAt,
		status: record.status as SyncStatusRecord['status'],
		error: record.error
	}));

	return {
		items,
		total,
		page,
		pageSize,
		totalPages
	};
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
// Metadata Enrichment (Duration and Genres)
// =============================================================================

/**
 * Options for metadata enrichment
 */
export interface EnrichMetadataOptions {
	/** Number of records to process per batch (default: 50) */
	batchSize?: number;
	/** Abort signal for cancellation */
	signal?: AbortSignal;
	/** Progress callback */
	onProgress?: (processed: number, total: number) => void;
}

/**
 * Result of metadata enrichment
 */
export interface EnrichMetadataResult {
	/** Number of records successfully enriched */
	enriched: number;
	/** Number of records where metadata fetch failed */
	failed: number;
}

/**
 * Enrich play history records with metadata from Plex library
 *
 * The Plex history endpoint does not include duration or genres.
 * This function fetches metadata from the library metadata endpoint
 * for records that are missing duration or genres data.
 *
 * Optimizations:
 * - Deduplicates by ratingKey to avoid redundant API calls
 * - Uses metadata cache to avoid refetching known metadata
 * - Batches database updates for efficiency
 *
 * @param options - Enrichment options
 * @returns Count of enriched and failed records
 */
export async function enrichMetadata(
	options: EnrichMetadataOptions = {}
): Promise<EnrichMetadataResult> {
	const { batchSize = 50, signal, onProgress } = options;

	// 1. Query records needing enrichment (uses partial index if available)
	const records = await db
		.select({
			id: playHistory.id,
			ratingKey: playHistory.ratingKey,
			duration: playHistory.duration,
			genres: playHistory.genres
		})
		.from(playHistory)
		.where(or(isNull(playHistory.duration), isNull(playHistory.genres)));

	if (records.length === 0) {
		return { enriched: 0, failed: 0 };
	}

	// 2. Deduplicate by ratingKey - group records that share the same media
	const ratingKeyToRecords = new Map<string, typeof records>();
	for (const record of records) {
		const existing = ratingKeyToRecords.get(record.ratingKey) ?? [];
		existing.push(record);
		ratingKeyToRecords.set(record.ratingKey, existing);
	}

	const uniqueRatingKeys = Array.from(ratingKeyToRecords.keys());
	logger.info(
		`Found ${records.length} records needing enrichment (${uniqueRatingKeys.length} unique media items)`,
		'Enrichment'
	);

	// 3. Check metadata cache first
	const cached = await db
		.select()
		.from(metadataCache)
		.where(inArray(metadataCache.ratingKey, uniqueRatingKeys));

	const cachedMap = new Map(cached.map((c) => [c.ratingKey, c]));
	const needsFetch = uniqueRatingKeys.filter((rk) => !cachedMap.has(rk));

	logger.info(`Cache: ${cached.length} hits, ${needsFetch.length} need API fetch`, 'Enrichment');

	// 4. Fetch metadata from Plex API for missing keys only
	let totalProcessed = 0;

	if (needsFetch.length > 0) {
		for (let i = 0; i < needsFetch.length; i += batchSize) {
			if (signal?.aborted) {
				logger.info('Metadata enrichment cancelled', 'Enrichment');
				break;
			}

			const batch = needsFetch.slice(i, i + batchSize);
			const metadataMap = await fetchMetadataBatch(batch, signal);

			// 5. Update cache with fetched metadata
			const cacheEntries = batch.map((rk) => {
				const data = metadataMap.get(rk);
				return {
					ratingKey: rk,
					duration: data?.duration ?? null,
					genres: data?.genres?.length ? JSON.stringify(data.genres) : null,
					fetchedAt: Math.floor(Date.now() / 1000),
					fetchFailed: data === null
				};
			});

			// Upsert cache entries
			for (const entry of cacheEntries) {
				await db
					.insert(metadataCache)
					.values(entry)
					.onConflictDoUpdate({
						target: metadataCache.ratingKey,
						set: {
							duration: entry.duration,
							genres: entry.genres,
							fetchedAt: entry.fetchedAt,
							fetchFailed: entry.fetchFailed
						}
					});

				// Also add to cachedMap for the update phase
				cachedMap.set(entry.ratingKey, entry);
			}

			totalProcessed += batch.length;
			onProgress?.(totalProcessed, needsFetch.length);
		}
	}

	// 6. Batch update play_history records
	// Group records by their update values for efficient batch updates
	const updateBatches = new Map<string, number[]>(); // "duration|genres" -> [record ids]
	let enriched = 0;
	let failed = 0;

	for (const [ratingKey, recordGroup] of ratingKeyToRecords) {
		const metadata = cachedMap.get(ratingKey);
		if (!metadata || metadata.fetchFailed) {
			failed += recordGroup.length;
			continue;
		}

		for (const record of recordGroup) {
			const updates: { duration?: number; genres?: string } = {};

			if (record.duration === null && metadata.duration != null) {
				updates.duration = metadata.duration;
			}

			if (record.genres === null && metadata.genres != null) {
				updates.genres = metadata.genres;
			}

			if (Object.keys(updates).length > 0) {
				// Create a key for grouping records with same update values
				const key = `${updates.duration ?? 'null'}|${updates.genres ?? 'null'}`;
				const ids = updateBatches.get(key) ?? [];
				ids.push(record.id);
				updateBatches.set(key, ids);
				enriched++;
			} else {
				// Metadata had no useful data for this record
				failed++;
			}
		}
	}

	// Execute batched updates - one UPDATE per unique combination of values
	for (const [key, ids] of updateBatches) {
		const parts = key.split('|');
		const durStr = parts[0] ?? 'null';
		const genStr = parts[1] ?? 'null';
		const updates: { duration?: number; genres?: string } = {};

		if (durStr !== 'null') {
			updates.duration = parseInt(durStr, 10);
		}
		if (genStr !== 'null') {
			updates.genres = genStr;
		}

		await db.update(playHistory).set(updates).where(inArray(playHistory.id, ids));
	}

	logger.info(
		`Enrichment complete: ${enriched} enriched, ${failed} failed, ${updateBatches.size} batch updates`,
		'Enrichment'
	);

	return { enriched, failed };
}

/**
 * @deprecated Use enrichMetadata instead
 * Kept for backwards compatibility
 */
export async function enrichDurations(
	options: EnrichMetadataOptions = {}
): Promise<EnrichMetadataResult> {
	return enrichMetadata(options);
}
