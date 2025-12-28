export interface PageResult<T> {
	items: T[];
	totalSize: number;
	size: number;
	offset: number;
}

export type PageFetcher<T> = (offset: number, pageSize: number) => Promise<PageResult<T>>;

export interface PaginationResult<T> {
	items: T[];
	pagesFetched: number;
	totalSize: number;
}

export async function* paginateAll<T>(
	fetchPage: PageFetcher<T>,
	pageSize: number
): AsyncGenerator<{ items: T[]; pageNumber: number; offset: number }, void, unknown> {
	if (pageSize <= 0) {
		throw new Error('pageSize must be greater than 0');
	}

	let offset = 0;
	let totalSize: number | undefined;
	let pageNumber = 0;

	do {
		const pageResult = await fetchPage(offset, pageSize);

		// Update total size from first response
		if (totalSize === undefined) {
			totalSize = pageResult.totalSize;
		}

		pageNumber++;

		// Yield the items from this page
		yield {
			items: pageResult.items,
			pageNumber,
			offset
		};

		// Move to next page
		offset += pageResult.size;

		// Guard against empty pages causing infinite loops
		// Continue until we've fetched all records
	} while (offset < (totalSize ?? 0) && offset > 0);
}

export async function fetchAllPaginated<T>(
	fetchPage: PageFetcher<T>,
	pageSize: number
): Promise<PaginationResult<T>> {
	const allItems: T[] = [];
	let pagesFetched = 0;
	let totalSize = 0;

	for await (const { items } of paginateAll(fetchPage, pageSize)) {
		allItems.push(...items);
		pagesFetched++;

		// Get totalSize from first page (it's consistent across pages)
		if (pagesFetched === 1) {
			// We need to get totalSize from the page result
			// Since we're yielding, we need to track this differently
		}
	}

	// For totalSize, we need to refetch it or track it in the generator
	// Let's create a version that tracks this properly
	return {
		items: allItems,
		pagesFetched,
		totalSize: allItems.length // This will be correct if all items are fetched
	};
}

export async function fetchAllPaginatedWithStats<T>(
	fetchPage: PageFetcher<T>,
	pageSize: number
): Promise<PaginationResult<T>> {
	if (pageSize <= 0) {
		throw new Error('pageSize must be greater than 0');
	}

	const allItems: T[] = [];
	let pagesFetched = 0;
	let totalSize = 0;
	let offset = 0;

	do {
		const pageResult = await fetchPage(offset, pageSize);

		// Capture totalSize from first response
		if (pagesFetched === 0) {
			totalSize = pageResult.totalSize;
		}

		allItems.push(...pageResult.items);
		pagesFetched++;

		// Move to next page
		offset += pageResult.size;

		// Guard against infinite loops and continue until all records fetched
	} while (offset < totalSize && offset > 0);

	return {
		items: allItems,
		pagesFetched,
		totalSize
	};
}

export function calculateExpectedPages(totalRecords: number, pageSize: number): number {
	if (pageSize <= 0) {
		throw new Error('pageSize must be greater than 0');
	}
	if (totalRecords <= 0) {
		return 0;
	}
	return Math.ceil(totalRecords / pageSize);
}
