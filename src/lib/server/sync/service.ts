import { db } from '$lib/server/db/client';
import { playHistory, syncStatus, metadataCache } from '$lib/server/db/schema';
import { fetchAllHistory, fetchMetadataBatch } from '$lib/server/plex/client';
import type { ValidPlexHistoryMetadata } from '$lib/server/plex/types';
import { eq, desc, isNull, or, inArray, count } from 'drizzle-orm';
import type { StartSyncOptions, SyncResult, SyncProgress, SyncStatusRecord } from './types';
import { logger } from '$lib/server/logging';
import { invalidateCache } from '$lib/server/stats/engine';
import { syncPlexAccounts } from './plex-accounts.service';

const DEFAULT_PAGE_SIZE = 100;
const PROGRESS_UPDATE_INTERVAL = 5;

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

/** Get Unix timestamp for January 1st 00:00:00 UTC of a given year */
export function getYearStartTimestamp(year: number): number {
	return Math.floor(new Date(Date.UTC(year, 0, 1, 0, 0, 0)).getTime() / 1000);
}

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

export async function isSyncRunning(): Promise<boolean> {
	const running = await getRunningSync();
	return running !== null;
}

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

async function updateSyncProgress(syncId: number, recordsProcessed: number): Promise<void> {
	await db.update(syncStatus).set({ recordsProcessed }).where(eq(syncStatus.id, syncId));
}

/** Insert batch using onConflictDoNothing to skip duplicate historyKeys */
async function insertHistoryBatch(
	records: ValidPlexHistoryMetadata[]
): Promise<{ inserted: number; skipped: number }> {
	if (records.length === 0) {
		return { inserted: 0, skipped: 0 };
	}

	const dbRecords = records.map(mapPlexRecordToDbInsert);
	const result = await db
		.insert(playHistory)
		.values(dbRecords)
		.onConflictDoNothing({ target: playHistory.historyKey })
		.returning({ id: playHistory.id });

	const inserted = result.length;
	const skipped = records.length - inserted;

	return { inserted, skipped };
}

export async function startSync(options: StartSyncOptions = {}): Promise<SyncResult> {
	const { backfillYear, signal, onProgress } = options;
	const startTime = Date.now();

	if (await isSyncRunning()) {
		throw new SyncError('A sync operation is already in progress');
	}

	const syncId = await createSyncRecord();

	let recordsProcessed = 0;
	let recordsInserted = 0;
	let recordsSkipped = 0;
	let maxViewedAt: number | null = null;
	let currentPage = 0;

	try {
		// Sync Plex accounts first to ensure usernames are available for stats
		try {
			await syncPlexAccounts();
		} catch (error) {
			logger.warn(
				`Failed to sync Plex accounts: ${error instanceof Error ? error.message : 'Unknown error'}. Top Contributors may show generic usernames.`,
				`Sync-${syncId}`
			);
		}

		let minViewedAt: number | undefined;

		if (backfillYear !== undefined) {
			minViewedAt = getYearStartTimestamp(backfillYear);
			logger.info(
				`Starting backfill from ${new Date(minViewedAt * 1000).toISOString()}`,
				`Sync-${syncId}`
			);
		} else {
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

		for await (const { items: page, skippedCount } of fetchAllHistory({
			pageSize: DEFAULT_PAGE_SIZE,
			minViewedAt,
			signal
		})) {
			currentPage++;
			recordsSkipped += skippedCount;

			const { inserted, skipped: dbSkipped } = await insertHistoryBatch(page);
			recordsProcessed += page.length;
			recordsInserted += inserted;
			recordsSkipped += dbSkipped;

			for (const record of page) {
				if (maxViewedAt === null || record.viewedAt > maxViewedAt) {
					maxViewedAt = record.viewedAt;
				}
			}

			if (currentPage % PROGRESS_UPDATE_INTERVAL === 0) {
				await updateSyncProgress(syncId, recordsProcessed);
			}

			onProgress?.({
				recordsProcessed,
				recordsInserted,
				recordsSkipped,
				currentPage,
				isComplete: false
			});

			if (signal?.aborted) {
				throw new SyncError('Sync cancelled', syncId);
			}
		}

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

		if (recordsInserted > 0) {
			logger.info('Starting metadata enrichment...', `Sync-${syncId}`);

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

			let lastLoggedPercent = -5;
			const enrichResult = await enrichMetadata({
				signal,
				onProgress: (processed, total) => {
					const percent = total > 0 ? Math.round((processed / total) * 100) : 0;

					if (percent >= lastLoggedPercent + 5 || processed === total) {
						logger.info(
							`Enriched ${processed.toLocaleString()}/${total.toLocaleString()} (${percent}%)`,
							'Enrichment'
						);
						lastLoggedPercent = percent;
					}

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

		await completeSyncRecord(syncId, recordsProcessed, maxViewedAt);

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

export interface SyncHistoryPaginationOptions {
	page?: number;
	pageSize?: number;
}

export interface PaginatedSyncHistory {
	items: SyncStatusRecord[];
	total: number;
	page: number;
	pageSize: number;
	totalPages: number;
}

export async function getSyncHistoryCount(): Promise<number> {
	const result = await db.select({ count: count() }).from(syncStatus);
	return result[0]?.count ?? 0;
}

export async function getSyncHistory(
	options: SyncHistoryPaginationOptions = {}
): Promise<PaginatedSyncHistory> {
	const { page = 1, pageSize = 15 } = options;
	const offset = (page - 1) * pageSize;

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

export async function getPlayHistoryCount(): Promise<number> {
	const result = await db.select({ id: playHistory.id }).from(playHistory);
	return result.length;
}

export interface EnrichMetadataOptions {
	batchSize?: number;
	signal?: AbortSignal;
	onProgress?: (processed: number, total: number) => void;
}

export interface EnrichMetadataResult {
	enriched: number;
	failed: number;
}

/**
 * Enrich play history records with metadata from Plex library.
 * Deduplicates by ratingKey and uses metadata cache to avoid redundant API calls.
 */
export async function enrichMetadata(
	options: EnrichMetadataOptions = {}
): Promise<EnrichMetadataResult> {
	const { batchSize = 50, signal, onProgress } = options;

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

	const cached = await db
		.select()
		.from(metadataCache)
		.where(inArray(metadataCache.ratingKey, uniqueRatingKeys));

	const cachedMap = new Map(cached.map((c) => [c.ratingKey, c]));
	const needsFetch = uniqueRatingKeys.filter((rk) => !cachedMap.has(rk));

	logger.info(`Cache: ${cached.length} hits, ${needsFetch.length} need API fetch`, 'Enrichment');

	let totalProcessed = 0;

	if (needsFetch.length > 0) {
		for (let i = 0; i < needsFetch.length; i += batchSize) {
			if (signal?.aborted) {
				logger.info('Metadata enrichment cancelled', 'Enrichment');
				break;
			}

			const batch = needsFetch.slice(i, i + batchSize);
			const metadataMap = await fetchMetadataBatch(batch, signal);

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

				cachedMap.set(entry.ratingKey, entry);
			}

			totalProcessed += batch.length;
			onProgress?.(totalProcessed, needsFetch.length);
		}
	}

	const updateBatches = new Map<string, number[]>();
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
				const key = `${updates.duration ?? 'null'}|${updates.genres ?? 'null'}`;
				const ids = updateBatches.get(key) ?? [];
				ids.push(record.id);
				updateBatches.set(key, ids);
				enriched++;
			} else {
				failed++;
			}
		}
	}

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

/** @deprecated Use enrichMetadata instead */
export async function enrichDurations(
	options: EnrichMetadataOptions = {}
): Promise<EnrichMetadataResult> {
	return enrichMetadata(options);
}
