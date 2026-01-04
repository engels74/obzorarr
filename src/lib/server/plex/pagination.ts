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

		if (totalSize === undefined) {
			totalSize = pageResult.totalSize;
		}

		pageNumber++;

		yield {
			items: pageResult.items,
			pageNumber,
			offset
		};

		offset += pageResult.size;
	} while (offset < (totalSize ?? 0) && offset > 0);
}

export async function fetchAllPaginated<T>(
	fetchPage: PageFetcher<T>,
	pageSize: number
): Promise<PaginationResult<T>> {
	const allItems: T[] = [];
	let pagesFetched = 0;
	const _totalSize = 0;

	for await (const { items } of paginateAll(fetchPage, pageSize)) {
		allItems.push(...items);
		pagesFetched++;
	}

	return {
		items: allItems,
		pagesFetched,
		totalSize: allItems.length
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

		if (pagesFetched === 0) {
			totalSize = pageResult.totalSize;
		}

		allItems.push(...pageResult.items);
		pagesFetched++;

		offset += pageResult.size;
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
