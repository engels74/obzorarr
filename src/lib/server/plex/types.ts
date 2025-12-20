import { z } from 'zod';

/**
 * Plex API Types and Zod Schemas
 *
 * These types are used for:
 * 1. Type-safe Plex API communication
 * 2. Runtime validation of API responses
 * 3. Play history data extraction
 *
 * Based on Plex Media Server OpenAPI specification.
 */

// =============================================================================
// Error Types
// =============================================================================

/**
 * Custom error for Plex API failures
 */
export class PlexApiError extends Error {
	constructor(
		message: string,
		public readonly statusCode?: number,
		public readonly endpoint?: string,
		public readonly cause?: unknown
	) {
		super(message);
		this.name = 'PlexApiError';
	}
}

/**
 * Custom error for Plex response validation failures
 */
export class PlexValidationError extends Error {
	constructor(
		message: string,
		public readonly cause?: unknown
	) {
		super(message);
		this.name = 'PlexValidationError';
	}
}

// =============================================================================
// Zod Schemas for Plex History API
// =============================================================================

/**
 * Individual play history metadata item from Plex
 *
 * Contains information about a single play event including:
 * - Media identification (historyKey, ratingKey)
 * - Content info (title, type, thumb)
 * - Playback context (viewedAt, accountID, librarySectionID)
 * - Episode-specific fields (grandparentTitle, parentTitle)
 */
export const PlexHistoryMetadataSchema = z.object({
	// Required identification fields
	historyKey: z.string(),
	ratingKey: z.string(),
	librarySectionID: z.union([z.string(), z.number()]).transform((val) => String(val)),

	// Content information
	title: z.string(),
	type: z.string(),

	// Playback information
	viewedAt: z.number().int(),
	accountID: z.number().int(),

	// Optional fields
	key: z.string().optional(),
	thumb: z.string().optional().nullable(),
	originallyAvailableAt: z.string().optional(),
	deviceID: z.number().int().optional(),

	// Duration in milliseconds (optional - not always present in history)
	duration: z.number().int().optional(),

	// Episode-specific fields
	grandparentTitle: z.string().optional(), // Show name for episodes
	parentTitle: z.string().optional(), // Season name for episodes
	grandparentKey: z.string().optional(),
	parentKey: z.string().optional(),
	grandparentThumb: z.string().optional(),
	parentThumb: z.string().optional(),

	// Additional metadata
	index: z.number().int().optional(), // Episode number
	parentIndex: z.number().int().optional(), // Season number
	year: z.number().int().optional(),
	contentRating: z.string().optional()
});

/**
 * Plex MediaContainer wrapper for history responses
 *
 * Contains pagination information and the array of metadata items.
 */
export const PlexMediaContainerSchema = z.object({
	// Pagination fields
	size: z.number().int(),
	totalSize: z.number().int().optional(),
	offset: z.number().int().optional().default(0),

	// Metadata array (may be empty or missing if no results)
	Metadata: z.array(PlexHistoryMetadataSchema).optional().default([])
});

/**
 * Root response object from Plex history endpoint
 */
export const PlexHistoryResponseSchema = z.object({
	MediaContainer: PlexMediaContainerSchema
});

// =============================================================================
// TypeScript Types (inferred from Zod schemas)
// =============================================================================

export type PlexHistoryMetadata = z.infer<typeof PlexHistoryMetadataSchema>;
export type PlexMediaContainer = z.infer<typeof PlexMediaContainerSchema>;
export type PlexHistoryResponse = z.infer<typeof PlexHistoryResponseSchema>;

// =============================================================================
// Fetch Options
// =============================================================================

/**
 * Options for fetchAllHistory function
 */
export interface FetchHistoryOptions {
	/**
	 * Number of records to fetch per page
	 * @default 100
	 */
	pageSize?: number;

	/**
	 * Minimum viewedAt timestamp (Unix seconds) for incremental sync
	 * Only fetch records viewed after this timestamp
	 */
	minViewedAt?: number;

	/**
	 * Filter by specific Plex account ID
	 */
	accountId?: number;

	/**
	 * Filter by library section ID
	 */
	librarySectionId?: number;

	/**
	 * Abort signal for cancellation
	 */
	signal?: AbortSignal;
}

/**
 * Result of a single page fetch
 */
export interface HistoryPageResult {
	/**
	 * Array of history metadata items for this page
	 */
	items: PlexHistoryMetadata[];

	/**
	 * Total number of records available
	 */
	totalSize: number;

	/**
	 * Current offset in the result set
	 */
	offset: number;

	/**
	 * Number of items in this page
	 */
	size: number;
}
