import { describe, expect, it } from 'bun:test';
import * as fc from 'fast-check';
import {
	calculateExpectedPages,
	fetchAllPaginatedWithStats,
	type PageFetcher,
	type PageResult,
	paginateAll
} from '$lib/server/plex/pagination';

/**
 * Property-based tests for Plex API pagination
 *
 * Feature: obzorarr, Property 4: Pagination Completeness
 * Validates: Requirements 2.2
 *
 * Property: For any total record count N and page size P, the Sync_Service
 * SHALL fetch exactly ceil(N/P) pages and retrieve all N records.
 *
 * This test verifies that the pagination implementation correctly handles
 * all combinations of total records and page sizes, ensuring no data loss.
 */

/**
 * Empty pagination still needs one request: the client cannot know `totalSize`
 * is zero until Plex returns the first page.
 */
function expectedApiCalls(totalRecords: number, pageSize: number): number {
	if (totalRecords === 0) {
		return 1;
	}
	return Math.ceil(totalRecords / pageSize);
}

interface TestItem {
	id: number;
	value: string;
}

function generateTestItems(count: number): TestItem[] {
	return Array.from({ length: count }, (_, i) => ({
		id: i + 1,
		value: `item-${i + 1}`
	}));
}

function createMockPageFetcher(
	allItems: TestItem[],
	_pageSize: number
): { fetcher: PageFetcher<TestItem>; getPagesFetched: () => number } {
	let pagesFetched = 0;

	const fetcher: PageFetcher<TestItem> = async (
		offset: number,
		requestedPageSize: number
	): Promise<PageResult<TestItem>> => {
		pagesFetched++;

		const startIndex = offset;
		const endIndex = Math.min(offset + requestedPageSize, allItems.length);
		const items = allItems.slice(startIndex, endIndex);

		return {
			items,
			totalSize: allItems.length,
			size: items.length,
			offset
		};
	};

	return {
		fetcher,
		getPagesFetched: () => pagesFetched
	};
}

describe('Property 4: Pagination Completeness', () => {
	describe('Page count calculation', () => {
		it('calculateExpectedPages returns ceil(N/P) for any N and P', () => {
			fc.assert(
				fc.property(
					fc.integer({ min: 0, max: 10000 }),
					fc.integer({ min: 1, max: 500 }),
					(totalRecords, pageSize) => {
						const expected = totalRecords === 0 ? 0 : Math.ceil(totalRecords / pageSize);
						const actual = calculateExpectedPages(totalRecords, pageSize);
						return actual === expected;
					}
				),
				{ numRuns: 100 }
			);
		});
	});

	describe('Pagination completeness via generator', () => {
		it('fetches expected number of pages for any N records and page size P', async () => {
			await fc.assert(
				fc.asyncProperty(
					fc.integer({ min: 0, max: 1000 }),
					fc.integer({ min: 1, max: 100 }),
					async (totalRecords, pageSize) => {
						const allItems = generateTestItems(totalRecords);
						const { fetcher, getPagesFetched } = createMockPageFetcher(allItems, pageSize);

						const collectedItems: TestItem[] = [];
						for await (const { items } of paginateAll(fetcher, pageSize)) {
							collectedItems.push(...items);
						}

						const expected = expectedApiCalls(totalRecords, pageSize);
						const actualPages = getPagesFetched();

						return actualPages === expected;
					}
				),
				{ numRuns: 100 }
			);
		});

		it('retrieves exactly N records with no loss', async () => {
			await fc.assert(
				fc.asyncProperty(
					fc.integer({ min: 0, max: 1000 }),
					fc.integer({ min: 1, max: 100 }),
					async (totalRecords, pageSize) => {
						const allItems = generateTestItems(totalRecords);
						const { fetcher } = createMockPageFetcher(allItems, pageSize);

						const collectedItems: TestItem[] = [];
						for await (const { items } of paginateAll(fetcher, pageSize)) {
							collectedItems.push(...items);
						}

						return collectedItems.length === totalRecords;
					}
				),
				{ numRuns: 100 }
			);
		});

		it('retrieves items in correct order with no duplicates', async () => {
			await fc.assert(
				fc.asyncProperty(
					fc.integer({ min: 1, max: 500 }),
					fc.integer({ min: 1, max: 50 }),
					async (totalRecords, pageSize) => {
						const allItems = generateTestItems(totalRecords);
						const { fetcher } = createMockPageFetcher(allItems, pageSize);

						const collectedItems: TestItem[] = [];
						for await (const { items } of paginateAll(fetcher, pageSize)) {
							collectedItems.push(...items);
						}

						const idsInOrder = collectedItems.every((item, index) => item.id === index + 1);

						const uniqueIds = new Set(collectedItems.map((item) => item.id));
						const noDuplicates = uniqueIds.size === collectedItems.length;

						return idsInOrder && noDuplicates;
					}
				),
				{ numRuns: 100 }
			);
		});
	});

	describe('Pagination completeness via fetchAllPaginatedWithStats', () => {
		it('returns correct pagesFetched count for any N and P', async () => {
			await fc.assert(
				fc.asyncProperty(
					fc.integer({ min: 0, max: 1000 }),
					fc.integer({ min: 1, max: 100 }),
					async (totalRecords, pageSize) => {
						const allItems = generateTestItems(totalRecords);
						const { fetcher } = createMockPageFetcher(allItems, pageSize);

						const result = await fetchAllPaginatedWithStats(fetcher, pageSize);

						const expected = expectedApiCalls(totalRecords, pageSize);
						return result.pagesFetched === expected;
					}
				),
				{ numRuns: 100 }
			);
		});

		it('returns all items with correct totalSize', async () => {
			await fc.assert(
				fc.asyncProperty(
					fc.integer({ min: 0, max: 1000 }),
					fc.integer({ min: 1, max: 100 }),
					async (totalRecords, pageSize) => {
						const allItems = generateTestItems(totalRecords);
						const { fetcher } = createMockPageFetcher(allItems, pageSize);

						const result = await fetchAllPaginatedWithStats(fetcher, pageSize);

						return result.items.length === totalRecords && result.totalSize === totalRecords;
					}
				),
				{ numRuns: 100 }
			);
		});
	});

	describe('Edge cases', () => {
		it('handles zero records correctly', async () => {
			const allItems: TestItem[] = [];
			const pageSize = 10;
			const { fetcher, getPagesFetched } = createMockPageFetcher(allItems, pageSize);

			const collectedItems: TestItem[] = [];
			for await (const { items } of paginateAll(fetcher, pageSize)) {
				collectedItems.push(...items);
			}

			expect(collectedItems.length).toBe(0);
			expect(getPagesFetched()).toBe(1);
		});

		it('handles records less than page size (single page)', async () => {
			const totalRecords = 5;
			const pageSize = 10;
			const allItems = generateTestItems(totalRecords);
			const { fetcher, getPagesFetched } = createMockPageFetcher(allItems, pageSize);

			const collectedItems: TestItem[] = [];
			for await (const { items } of paginateAll(fetcher, pageSize)) {
				collectedItems.push(...items);
			}

			expect(collectedItems.length).toBe(totalRecords);
			expect(getPagesFetched()).toBe(1);
		});

		it('handles records exactly equal to page size', async () => {
			const pageSize = 10;
			const totalRecords = pageSize;
			const allItems = generateTestItems(totalRecords);
			const { fetcher, getPagesFetched } = createMockPageFetcher(allItems, pageSize);

			const collectedItems: TestItem[] = [];
			for await (const { items } of paginateAll(fetcher, pageSize)) {
				collectedItems.push(...items);
			}

			expect(collectedItems.length).toBe(totalRecords);
			expect(getPagesFetched()).toBe(1);
		});

		it('handles records exactly divisible by page size (multiple pages)', async () => {
			const pageSize = 10;
			const totalRecords = 30;
			const allItems = generateTestItems(totalRecords);
			const { fetcher, getPagesFetched } = createMockPageFetcher(allItems, pageSize);

			const collectedItems: TestItem[] = [];
			for await (const { items } of paginateAll(fetcher, pageSize)) {
				collectedItems.push(...items);
			}

			expect(collectedItems.length).toBe(totalRecords);
			expect(getPagesFetched()).toBe(3);
		});

		it('handles records not divisible by page size (partial last page)', async () => {
			const pageSize = 10;
			const totalRecords = 25;
			const allItems = generateTestItems(totalRecords);
			const { fetcher, getPagesFetched } = createMockPageFetcher(allItems, pageSize);

			const collectedItems: TestItem[] = [];
			for await (const { items } of paginateAll(fetcher, pageSize)) {
				collectedItems.push(...items);
			}

			expect(collectedItems.length).toBe(totalRecords);
			expect(getPagesFetched()).toBe(3);
		});

		it('throws error for invalid page size (zero)', () => {
			expect(() => calculateExpectedPages(100, 0)).toThrow('pageSize must be greater than 0');
		});

		it('throws error for invalid page size (negative)', () => {
			expect(() => calculateExpectedPages(100, -1)).toThrow('pageSize must be greater than 0');
		});
	});

	describe('Large dataset handling', () => {
		it('correctly paginates large datasets', async () => {
			const totalRecords = 5000;
			const pageSize = 100;
			const allItems = generateTestItems(totalRecords);
			const { fetcher } = createMockPageFetcher(allItems, pageSize);

			const result = await fetchAllPaginatedWithStats(fetcher, pageSize);

			expect(result.items.length).toBe(totalRecords);
			expect(result.pagesFetched).toBe(50);
			expect(result.totalSize).toBe(totalRecords);
		});
	});
});

describe('Pagination utility functions', () => {
	describe('calculateExpectedPages', () => {
		it('returns 0 for zero records', () => {
			expect(calculateExpectedPages(0, 10)).toBe(0);
		});

		it('returns 1 for records less than page size', () => {
			expect(calculateExpectedPages(5, 10)).toBe(1);
		});

		it('returns 1 for records equal to page size', () => {
			expect(calculateExpectedPages(10, 10)).toBe(1);
		});

		it('returns correct count for exact division', () => {
			expect(calculateExpectedPages(100, 10)).toBe(10);
		});

		it('returns ceiling for non-exact division', () => {
			expect(calculateExpectedPages(101, 10)).toBe(11);
			expect(calculateExpectedPages(99, 10)).toBe(10);
		});
	});
});
