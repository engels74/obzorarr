import { PLEX_TOKEN, PLEX_SERVER_URL } from '$env/static/private';
import {
	PlexHistoryResponseSchema,
	PlexApiError,
	PlexValidationError,
	type PlexHistoryMetadata,
	type PlexHistoryResponse,
	type FetchHistoryOptions,
	type HistoryPageResult
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

	return {
		items: container.Metadata,
		totalSize: container.totalSize ?? container.size,
		offset: container.offset,
		size: container.size
	};
}

/**
 * Fetch all play history from Plex with automatic pagination
 *
 * This is an async generator that yields pages of history items.
 * Use this for memory-efficient processing of large history datasets.
 *
 * Implements Requirements 2.1 and 2.2:
 * - Fetches from /status/sessions/history/all
 * - Uses X-Plex-Container-Start and X-Plex-Container-Size for pagination
 *
 * @param options - Fetch options including page size and filters
 * @yields Arrays of PlexHistoryMetadata for each page
 *
 * @example
 * ```typescript
 * // Process all history pages
 * for await (const page of fetchAllHistory({ pageSize: 100 })) {
 *   for (const item of page) {
 *     console.log(item.title, item.viewedAt);
 *   }
 * }
 *
 * // Collect all items into a single array
 * const allItems: PlexHistoryMetadata[] = [];
 * for await (const page of fetchAllHistory()) {
 *   allItems.push(...page);
 * }
 * ```
 */
export async function* fetchAllHistory(
	options: FetchHistoryOptions = {}
): AsyncGenerator<PlexHistoryMetadata[], void, unknown> {
	const { pageSize = DEFAULT_PAGE_SIZE } = options;
	let offset = 0;
	let totalSize: number | undefined;

	do {
		const pageResult = await fetchHistoryPage(offset, options);

		// Update total size from first response
		if (totalSize === undefined) {
			totalSize = pageResult.totalSize;
		}

		// Yield the items from this page
		if (pageResult.items.length > 0) {
			yield pageResult.items;
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
 * @returns Array of all history metadata items
 *
 * @example
 * ```typescript
 * const history = await fetchAllHistoryArray({ minViewedAt: 1704067200 });
 * console.log(`Fetched ${history.length} records`);
 * ```
 */
export async function fetchAllHistoryArray(
	options: FetchHistoryOptions = {}
): Promise<PlexHistoryMetadata[]> {
	const allItems: PlexHistoryMetadata[] = [];

	for await (const page of fetchAllHistory(options)) {
		allItems.push(...page);
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
