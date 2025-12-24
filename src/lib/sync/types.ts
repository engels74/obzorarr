/**
 * Shared Sync Types
 *
 * Client-safe type definitions for the sync progress system.
 * These types can be imported in both client and server code.
 *
 * @module sync/types
 */

// =============================================================================
// Types
// =============================================================================

/**
 * Live sync progress status values
 */
export type LiveSyncStatus = 'running' | 'completed' | 'failed' | 'cancelled';

/**
 * Sync operation phase
 */
export type SyncPhase = 'fetching' | 'enriching';

/**
 * Live sync progress data
 */
export interface LiveSyncProgress {
	/** Database ID of the sync record */
	syncId: number;
	/** Current sync status */
	status: LiveSyncStatus;
	/** Number of records fetched from Plex */
	recordsProcessed: number;
	/** Number of new records inserted */
	recordsInserted: number;
	/** Number of duplicate records skipped */
	recordsSkipped: number;
	/** Current page number being processed */
	currentPage: number;
	/** When the sync started */
	startedAt: Date;
	/** Error message if sync failed */
	error?: string;
	/** Current phase of the sync operation */
	phase?: SyncPhase;
	/** Total records needing enrichment (only during enriching phase) */
	enrichmentTotal?: number;
	/** Records processed during enrichment (only during enriching phase) */
	enrichmentProcessed?: number;
}
