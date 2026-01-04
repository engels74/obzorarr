/**
 * Unit tests for Plex Pagination Module
 *
 * Tests the generic pagination implementation for Plex API.
 */

import { describe, expect, it } from 'bun:test';
import {
	calculateExpectedPages,
	fetchAllPaginated,
	fetchAllPaginatedWithStats,
	type PageFetcher,
	type PageResult,
	paginateAll
} from '$lib/server/plex/pagination';

// =============================================================================
// Test Helpers
// =============================================================================

interface TestItem {
	id: number;
	name: string;
}

/**
 * Create a mock page fetcher that returns items from a predefined dataset
 */
function createMockFetcher(items: TestItem[]): PageFetcher<TestItem> {
	return async (offset: number, pageSize: number): Promise<PageResult<TestItem>> => {
		const pageItems = items.slice(offset, offset + pageSize);
		return {
			items: pageItems,
			totalSize: items.length,
			size: pageItems.length,
			offset
		};
	};
}

/**
 * Generate test items
 */
function generateItems(count: number): TestItem[] {
	return Array.from({ length: count }, (_, i) => ({
		id: i + 1,
		name: `Item ${i + 1}`
	}));
}

// =============================================================================
// paginateAll Tests
// =============================================================================

describe('paginateAll', () => {
	describe('input validation', () => {
		it('throws error when pageSize is 0', async () => {
			const fetcher = createMockFetcher([]);

			await expect(async () => {
				// eslint-disable-next-line @typescript-eslint/no-unused-vars
				for await (const _page of paginateAll(fetcher, 0)) {
					// Should not reach here
				}
			}).toThrow('pageSize must be greater than 0');
		});

		it('throws error when pageSize is negative', async () => {
			const fetcher = createMockFetcher([]);

			await expect(async () => {
				// eslint-disable-next-line @typescript-eslint/no-unused-vars
				for await (const _page of paginateAll(fetcher, -1)) {
					// Should not reach here
				}
			}).toThrow('pageSize must be greater than 0');
		});

		it('accepts positive pageSize', async () => {
			const fetcher = createMockFetcher(generateItems(5));
			const pages: TestItem[][] = [];

			for await (const { items } of paginateAll(fetcher, 10)) {
				pages.push(items);
			}

			expect(pages.length).toBe(1);
			expect(pages[0]?.length).toBe(5);
		});
	});

	describe('pagination behavior', () => {
		it('yields single page when items fit in one page', async () => {
			const items = generateItems(5);
			const fetcher = createMockFetcher(items);
			const pages: { items: TestItem[]; pageNumber: number }[] = [];

			for await (const page of paginateAll(fetcher, 10)) {
				pages.push(page);
			}

			expect(pages.length).toBe(1);
			expect(pages[0]?.pageNumber).toBe(1);
			expect(pages[0]?.items.length).toBe(5);
		});

		it('yields multiple pages when items exceed page size', async () => {
			const items = generateItems(25);
			const fetcher = createMockFetcher(items);
			const pages: { items: TestItem[]; pageNumber: number; offset: number }[] = [];

			for await (const page of paginateAll(fetcher, 10)) {
				pages.push(page);
			}

			expect(pages.length).toBe(3);
			expect(pages[0]?.pageNumber).toBe(1);
			expect(pages[0]?.offset).toBe(0);
			expect(pages[0]?.items.length).toBe(10);

			expect(pages[1]?.pageNumber).toBe(2);
			expect(pages[1]?.offset).toBe(10);
			expect(pages[1]?.items.length).toBe(10);

			expect(pages[2]?.pageNumber).toBe(3);
			expect(pages[2]?.offset).toBe(20);
			expect(pages[2]?.items.length).toBe(5);
		});

		it('handles empty result set', async () => {
			const fetcher = createMockFetcher([]);
			const pages: TestItem[][] = [];

			for await (const { items } of paginateAll(fetcher, 10)) {
				pages.push(items);
			}

			expect(pages.length).toBe(1);
			expect(pages[0]?.length).toBe(0);
		});

		it('handles exact page boundary', async () => {
			const items = generateItems(20);
			const fetcher = createMockFetcher(items);
			const pages: TestItem[][] = [];

			for await (const { items: pageItems } of paginateAll(fetcher, 10)) {
				pages.push(pageItems);
			}

			expect(pages.length).toBe(2);
			expect(pages[0]?.length).toBe(10);
			expect(pages[1]?.length).toBe(10);
		});
	});
});

// =============================================================================
// fetchAllPaginated Tests
// =============================================================================

describe('fetchAllPaginated', () => {
	it('collects all items from multiple pages', async () => {
		const items = generateItems(25);
		const fetcher = createMockFetcher(items);

		const result = await fetchAllPaginated(fetcher, 10);

		expect(result.items.length).toBe(25);
		expect(result.pagesFetched).toBe(3);
	});

	it('handles single page', async () => {
		const items = generateItems(5);
		const fetcher = createMockFetcher(items);

		const result = await fetchAllPaginated(fetcher, 10);

		expect(result.items.length).toBe(5);
		expect(result.pagesFetched).toBe(1);
	});

	it('handles empty result set', async () => {
		const fetcher = createMockFetcher([]);

		const result = await fetchAllPaginated(fetcher, 10);

		expect(result.items.length).toBe(0);
		expect(result.pagesFetched).toBe(1);
	});

	it('preserves item order across pages', async () => {
		const items = generateItems(25);
		const fetcher = createMockFetcher(items);

		const result = await fetchAllPaginated(fetcher, 10);

		for (let i = 0; i < result.items.length; i++) {
			expect(result.items[i]?.id).toBe(i + 1);
		}
	});

	it('reports totalSize equal to items.length', async () => {
		const items = generateItems(15);
		const fetcher = createMockFetcher(items);

		const result = await fetchAllPaginated(fetcher, 10);

		expect(result.totalSize).toBe(result.items.length);
	});
});

// =============================================================================
// fetchAllPaginatedWithStats Tests
// =============================================================================

describe('fetchAllPaginatedWithStats', () => {
	it('throws error when pageSize is 0', async () => {
		const fetcher = createMockFetcher([]);

		await expect(fetchAllPaginatedWithStats(fetcher, 0)).rejects.toThrow(
			'pageSize must be greater than 0'
		);
	});

	it('throws error when pageSize is negative', async () => {
		const fetcher = createMockFetcher([]);

		await expect(fetchAllPaginatedWithStats(fetcher, -5)).rejects.toThrow(
			'pageSize must be greater than 0'
		);
	});

	it('reports accurate totalSize from API', async () => {
		const items = generateItems(25);
		const fetcher = createMockFetcher(items);

		const result = await fetchAllPaginatedWithStats(fetcher, 10);

		expect(result.totalSize).toBe(25);
		expect(result.items.length).toBe(25);
		expect(result.pagesFetched).toBe(3);
	});

	it('handles empty result set', async () => {
		const fetcher = createMockFetcher([]);

		const result = await fetchAllPaginatedWithStats(fetcher, 10);

		expect(result.totalSize).toBe(0);
		expect(result.items.length).toBe(0);
		expect(result.pagesFetched).toBe(1);
	});

	it('handles single page', async () => {
		const items = generateItems(5);
		const fetcher = createMockFetcher(items);

		const result = await fetchAllPaginatedWithStats(fetcher, 10);

		expect(result.totalSize).toBe(5);
		expect(result.items.length).toBe(5);
		expect(result.pagesFetched).toBe(1);
	});
});

// =============================================================================
// calculateExpectedPages Tests
// =============================================================================

describe('calculateExpectedPages', () => {
	it('returns 0 for zero records', () => {
		expect(calculateExpectedPages(0, 10)).toBe(0);
	});

	it('returns 0 for negative records', () => {
		expect(calculateExpectedPages(-5, 10)).toBe(0);
	});

	it('returns 1 for records less than page size', () => {
		expect(calculateExpectedPages(5, 10)).toBe(1);
	});

	it('returns 1 for records equal to page size', () => {
		expect(calculateExpectedPages(10, 10)).toBe(1);
	});

	it('returns correct count for exact multiple', () => {
		expect(calculateExpectedPages(30, 10)).toBe(3);
	});

	it('rounds up for non-exact multiple', () => {
		expect(calculateExpectedPages(25, 10)).toBe(3);
		expect(calculateExpectedPages(21, 10)).toBe(3);
		expect(calculateExpectedPages(29, 10)).toBe(3);
	});

	it('throws error for zero page size', () => {
		expect(() => calculateExpectedPages(10, 0)).toThrow('pageSize must be greater than 0');
	});

	it('throws error for negative page size', () => {
		expect(() => calculateExpectedPages(10, -1)).toThrow('pageSize must be greater than 0');
	});
});
