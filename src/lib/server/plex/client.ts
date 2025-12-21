import { PLEX_TOKEN, PLEX_SERVER_URL } from '$env/static/private';
import {
	PlexHistoryResponseSchema,
	PlexLibraryMetadataResponseSchema,
	PlexApiError,
	PlexValidationError,
	hasRequiredFields,
	type ValidPlexHistoryMetadata,
	type FetchHistoryOptions,
	type HistoryPageResult,
	type HistoryPageWithStats
} from './types';

/**
 * Plex API Client
 *
 * Provides type-safe communication with Plex Media Server.
 * Uses $env/static/private for secure token storage.
 *
 * @module plex/client
 */

// =============================================================================
// Constants
// =============================================================================

/**
 * Standard headers for all Plex API requests
 * Per bun-svelte-pro.md and Plex API documentation
 */
const PLEX_HEADERS = {
	Accept: 'application/json',
	'X-Plex-Token': PLEX_TOKEN,
	'X-Plex-Client-Identifier': 'obzorarr',
	'X-Plex-Product': 'Obzorarr',
	'X-Plex-Version': '1.0.0'
} as const;

/**
 * Default page size for paginated requests
 */
const DEFAULT_PAGE_SIZE = 100;

/**
 * Play history endpoint
 */
const HISTORY_ENDPOINT = '/status/sessions/history/all';

// =============================================================================
// Generic Request Function
// =============================================================================

/**
 * Make a request to the Plex API
 *
 * Handles authentication, JSON parsing, and error handling.
 * Does NOT perform response validation - caller should validate with Zod.
 *
 * @param endpoint - API endpoint path (e.g., '/status/sessions/history/all')
 * @param params - Optional URL search parameters
 * @param signal - Optional abort signal for cancellation
 * @returns Raw JSON response from Plex
 * @throws PlexApiError on network or HTTP errors
 *
 * @example
 * ```typescript
 * const response = await plexRequest<PlexHistoryResponse>('/status/sessions/history/all');
 * ```
 */
export async function plexRequest<T>(
	endpoint: string,
	params?: URLSearchParams,
	signal?: AbortSignal
): Promise<T> {
	// Build URL with optional query parameters
	const url = new URL(endpoint, PLEX_SERVER_URL);
	if (params) {
		params.forEach((value, key) => {
			url.searchParams.set(key, value);
		});
	}

	try {
		const response = await fetch(url.toString(), {
			method: 'GET',
			headers: PLEX_HEADERS,
			signal
		});

		if (!response.ok) {
			throw new PlexApiError(
				`Plex API error: ${response.status} ${response.statusText}`,
				response.status,
				endpoint
			);
		}

		const data = await response.json();
		return data as T;
	} catch (error) {
		// Re-throw PlexApiError as-is
		if (error instanceof PlexApiError) {
			throw error;
		}

		// Handle abort
		if (error instanceof Error && error.name === 'AbortError') {
			throw new PlexApiError('Request aborted', undefined, endpoint, error);
		}

		// Wrap other errors
		throw new PlexApiError(
			`Failed to fetch from Plex: ${error instanceof Error ? error.message : 'Unknown error'}`,
			undefined,
			endpoint,
			error
		);
	}
}

// =============================================================================
// History Fetching
// =============================================================================

/**
 * Fetch a single page of play history from Plex
 *
 * @param offset - Starting offset for pagination
 * @param options - Fetch options including page size and filters
 * @returns Validated page result with items and pagination info
 * @throws PlexApiError on network/HTTP errors
 * @throws PlexValidationError on response validation failure
 */
async function fetchHistoryPage(
	offset: number,
	options: FetchHistoryOptions = {}
): Promise<HistoryPageResult> {
	const {
		pageSize = DEFAULT_PAGE_SIZE,
		minViewedAt,
		accountId,
		librarySectionId,
		signal
	} = options;

	// Build query parameters
	const params = new URLSearchParams();
	params.set('X-Plex-Container-Start', String(offset));
	params.set('X-Plex-Container-Size', String(pageSize));

	// Add optional filters
	if (minViewedAt !== undefined) {
		// Filter for records viewed after this timestamp
		params.set('viewedAt>', String(minViewedAt));
	}

	if (accountId !== undefined) {
		params.set('accountID', String(accountId));
	}

	if (librarySectionId !== undefined) {
		params.set('librarySectionID', String(librarySectionId));
	}

	// Make request
	const rawResponse = await plexRequest<unknown>(HISTORY_ENDPOINT, params, signal);

	// Validate response with Zod
	const result = PlexHistoryResponseSchema.safeParse(rawResponse);

	if (!result.success) {
		throw new PlexValidationError(
			`Invalid Plex history response: ${result.error.message}`,
			result.error
		);
	}

	const container = result.data.MediaContainer;

	// Filter out items without required fields (deleted media, corrupted entries, etc.)
	const rawItems = container.Metadata;
	const validItems = rawItems.filter(hasRequiredFields);

	// Log filtered items for visibility
	const skippedCount = rawItems.length - validItems.length;
	if (skippedCount > 0) {
		console.warn(
			`[Plex] Skipped ${skippedCount} history items without required fields (ratingKey/title)`
		);
	}

	return {
		items: validItems,
		totalSize: container.totalSize ?? container.size,
		offset: container.offset,
		size: container.size,
		skippedCount
	};
}

/**
 * Fetch all play history from Plex with automatic pagination
 *
 * This is an async generator that yields pages of history items with stats.
 * Use this for memory-efficient processing of large history datasets.
 *
 * Implements Requirements 2.1 and 2.2:
 * - Fetches from /status/sessions/history/all
 * - Uses X-Plex-Container-Start and X-Plex-Container-Size for pagination
 *
 * @param options - Fetch options including page size and filters
 * @yields Objects with items array and skippedCount for each page
 *
 * @example
 * ```typescript
 * // Process all history pages
 * for await (const { items, skippedCount } of fetchAllHistory({ pageSize: 100 })) {
 *   for (const item of items) {
 *     console.log(item.title, item.viewedAt);
 *   }
 *   console.log(`Skipped ${skippedCount} items without required fields`);
 * }
 *
 * // Collect all items into a single array
 * const allItems: ValidPlexHistoryMetadata[] = [];
 * for await (const { items } of fetchAllHistory()) {
 *   allItems.push(...items);
 * }
 * ```
 */
export async function* fetchAllHistory(
	options: FetchHistoryOptions = {}
): AsyncGenerator<HistoryPageWithStats, void, unknown> {
	const { pageSize = DEFAULT_PAGE_SIZE } = options;
	let offset = 0;
	let totalSize: number | undefined;

	do {
		const pageResult = await fetchHistoryPage(offset, options);

		// Update total size from first response
		if (totalSize === undefined) {
			totalSize = pageResult.totalSize;
		}

		// Yield the items and skipped count from this page
		// Always yield to propagate skipped count even if no valid items
		if (pageResult.items.length > 0 || pageResult.skippedCount > 0) {
			yield {
				items: pageResult.items,
				skippedCount: pageResult.skippedCount
			};
		}

		// Move to next page
		offset += pageResult.size;

		// Continue until we've fetched all records
		// Guard against empty pages causing infinite loops
	} while (offset < (totalSize ?? 0) && offset > 0);
}

/**
 * Fetch all play history as a single array
 *
 * Convenience function that collects all pages into a single array.
 * Use fetchAllHistory() generator for memory-efficient processing of large datasets.
 *
 * @param options - Fetch options including page size and filters
 * @returns Array of all validated history metadata items (with ratingKey guaranteed)
 *
 * @example
 * ```typescript
 * const history = await fetchAllHistoryArray({ minViewedAt: 1704067200 });
 * console.log(`Fetched ${history.length} records`);
 * ```
 */
export async function fetchAllHistoryArray(
	options: FetchHistoryOptions = {}
): Promise<ValidPlexHistoryMetadata[]> {
	const allItems: ValidPlexHistoryMetadata[] = [];

	for await (const { items } of fetchAllHistory(options)) {
		allItems.push(...items);
	}

	return allItems;
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Check if the Plex server is reachable and authenticated
 *
 * @returns true if server responds successfully, false otherwise
 */
export async function checkConnection(): Promise<boolean> {
	try {
		// Use a lightweight endpoint to check connectivity
		await plexRequest<unknown>('/');
		return true;
	} catch {
		return false;
	}
}

/**
 * Get the configured Plex server URL (for display/debugging)
 *
 * Note: Does NOT expose the token, only the server URL.
 */
export function getServerUrl(): string {
	return PLEX_SERVER_URL;
}

// =============================================================================
// Metadata Fetching (for duration and genre enrichment)
// =============================================================================

/**
 * Concurrency limit for metadata batch requests
 */
const METADATA_CONCURRENCY = 5;

/**
 * Enrichment data returned from Plex metadata endpoint
 *
 * Contains additional metadata that is not available in the history endpoint,
 * including duration and genres for statistics calculation.
 */
export interface EnrichmentData {
	/** Duration in seconds, or null if not available */
	duration: number | null;
	/** Array of genre names (e.g., ["Action", "Drama"]) */
	genres: string[];
}

/**
 * Fetch metadata for a single media item from Plex library
 *
 * Retrieves duration and genres which are not available in the history endpoint.
 *
 * @param ratingKey - The rating key of the media item
 * @param signal - Optional abort signal for cancellation
 * @returns EnrichmentData with duration and genres, or null if fetch failed
 */
export async function fetchMediaMetadata(
	ratingKey: string,
	signal?: AbortSignal
): Promise<EnrichmentData | null> {
	try {
		const response = await plexRequest<unknown>(
			`/library/metadata/${ratingKey}`,
			undefined,
			signal
		);

		const result = PlexLibraryMetadataResponseSchema.safeParse(response);
		if (!result.success) {
			return null;
		}

		const item = result.data.MediaContainer.Metadata[0];
		if (!item) {
			return null;
		}

		return {
			// Convert from milliseconds to seconds
			duration: item.duration ? Math.floor(item.duration / 1000) : null,
			// Extract genre names from tag objects
			genres: item.Genre?.map((g) => g.tag) ?? []
		};
	} catch {
		return null;
	}
}

/**
 * Fetch metadata for multiple media items with concurrency control
 *
 * Makes parallel requests to the Plex library metadata endpoint,
 * limited to METADATA_CONCURRENCY concurrent requests to avoid
 * overwhelming the server.
 *
 * @param ratingKeys - Array of rating keys to fetch metadata for
 * @param signal - Optional abort signal for cancellation
 * @returns Map of ratingKey to EnrichmentData (null if unavailable)
 *
 * @example
 * ```typescript
 * const metadata = await fetchMetadataBatch(['12345', '67890']);
 * const data = metadata.get('12345'); // { duration: 7200, genres: ["Action"] } or null
 * ```
 */
export async function fetchMetadataBatch(
	ratingKeys: string[],
	signal?: AbortSignal
): Promise<Map<string, EnrichmentData | null>> {
	const results = new Map<string, EnrichmentData | null>();

	if (ratingKeys.length === 0) {
		return results;
	}

	// Process in batches with concurrency limit
	for (let i = 0; i < ratingKeys.length; i += METADATA_CONCURRENCY) {
		// Check for cancellation before each batch
		if (signal?.aborted) {
			break;
		}

		const batch = ratingKeys.slice(i, i + METADATA_CONCURRENCY);
		const promises = batch.map(async (ratingKey) => {
			const metadata = await fetchMediaMetadata(ratingKey, signal);
			results.set(ratingKey, metadata);
		});

		await Promise.all(promises);
	}

	return results;
}
