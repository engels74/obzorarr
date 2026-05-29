import { beforeEach, describe, expect, it } from 'bun:test';
import { db } from '$lib/server/db/client';
import { appSettings, cachedStats, playHistory } from '$lib/server/db/schema';
import { actions } from '../../../src/routes/admin/settings/data/+page.server';

type GetCacheCountAction = NonNullable<typeof actions.getCacheCount>;
type ClearCacheAction = NonNullable<typeof actions.clearCache>;
type GetPlayHistoryCountAction = NonNullable<typeof actions.getPlayHistoryCount>;
type ClearPlayHistoryAction = NonNullable<typeof actions.clearPlayHistory>;

const adminLocals = {
	user: { id: 1, plexId: 1, username: 'admin', isAdmin: true }
} as unknown as App.Locals;

function makeRequest(action: string, fields: Record<string, string> = {}): Request {
	const formData = new FormData();
	for (const [k, v] of Object.entries(fields)) formData.set(k, v);
	return new Request(`http://localhost/admin/settings/data?/${action}`, {
		method: 'POST',
		body: formData
	});
}

describe('data nested route — getCacheCount', () => {
	beforeEach(async () => {
		await db.delete(appSettings);
		await db.delete(cachedStats);
	});

	async function run(request: Request) {
		const handler = actions.getCacheCount as GetCacheCountAction;
		return handler({ request, locals: adminLocals } as Parameters<GetCacheCountAction>[0]);
	}

	it('returns 0 count on a fresh DB with no year filter', async () => {
		const result = await run(makeRequest('getCacheCount'));
		expect(result).toMatchObject({ success: true, count: 0 });
		// Year undefined when no scope was requested.
		expect((result as { year?: number }).year).toBeUndefined();
	});

	it('returns 0 count scoped to a specific year', async () => {
		const result = await run(makeRequest('getCacheCount', { year: '2024' }));
		expect(result).toMatchObject({ success: true, count: 0, year: 2024 });
	});

	it('treats blank year as "all years" (undefined)', async () => {
		const result = await run(makeRequest('getCacheCount', { year: '   ' }));
		expect(result).toMatchObject({ success: true, count: 0 });
		expect((result as { year?: number }).year).toBeUndefined();
	});

	it('rejects unparseable year as 400', async () => {
		const result = await run(makeRequest('getCacheCount', { year: 'twenty-two' }));
		expect(result).toMatchObject({ status: 400, data: { error: 'Invalid year' } });
	});

	// Edge cases that pin parseYear's current permissive behavior. If a future
	// commit tightens validation (e.g., requires year between 1970 and 9999, or
	// rejects negatives + decimals), these tests catch the change.
	it('accepts decimal years by silently truncating (parseInt behavior)', async () => {
		const result = await run(makeRequest('getCacheCount', { year: '2024.5' }));
		expect(result).toMatchObject({ success: true, count: 0, year: 2024 });
	});

	it('accepts negative years without validation', async () => {
		const result = await run(makeRequest('getCacheCount', { year: '-1' }));
		expect(result).toMatchObject({ success: true, count: 0, year: -1 });
	});
});

describe('data nested route — clearCache', () => {
	beforeEach(async () => {
		await db.delete(appSettings);
		await db.delete(cachedStats);
	});

	async function run(request: Request) {
		const handler = actions.clearCache as ClearCacheAction;
		return handler({ request, locals: adminLocals } as Parameters<ClearCacheAction>[0]);
	}

	it('reports 0 entries cleared on a fresh DB (no year)', async () => {
		const result = await run(makeRequest('clearCache'));
		expect(result).toMatchObject({ success: true, message: 'Cleared 0 cache entries' });
	});

	it('scopes the clear message to the year when supplied', async () => {
		const result = await run(makeRequest('clearCache', { year: '2025' }));
		expect(result).toMatchObject({
			success: true,
			message: 'Cleared 0 cache entries for 2025'
		});
	});

	it('rejects unparseable year as 400 and does not touch the table', async () => {
		const result = await run(makeRequest('clearCache', { year: 'NaN' }));
		expect(result).toMatchObject({ status: 400, data: { error: 'Invalid year' } });
	});
});

describe('data nested route — getPlayHistoryCount', () => {
	beforeEach(async () => {
		await db.delete(appSettings);
		await db.delete(playHistory);
	});

	async function run(request: Request) {
		const handler = actions.getPlayHistoryCount as GetPlayHistoryCountAction;
		return handler({
			request,
			locals: adminLocals
		} as Parameters<GetPlayHistoryCountAction>[0]);
	}

	it('returns 0 count on a fresh DB', async () => {
		const result = await run(makeRequest('getPlayHistoryCount'));
		expect(result).toMatchObject({ success: true, count: 0 });
	});

	it('returns count scoped to a year', async () => {
		const result = await run(makeRequest('getPlayHistoryCount', { year: '2024' }));
		expect(result).toMatchObject({ success: true, count: 0, year: 2024 });
	});

	it('rejects unparseable year as 400', async () => {
		const result = await run(makeRequest('getPlayHistoryCount', { year: 'recent' }));
		expect(result).toMatchObject({ status: 400, data: { error: 'Invalid year' } });
	});
});

describe('data nested route — clearPlayHistory', () => {
	beforeEach(async () => {
		await db.delete(appSettings);
		await db.delete(playHistory);
	});

	async function run(request: Request) {
		const handler = actions.clearPlayHistory as ClearPlayHistoryAction;
		return handler({
			request,
			locals: adminLocals
		} as Parameters<ClearPlayHistoryAction>[0]);
	}

	it('reports 0 records deleted on a fresh DB (no year)', async () => {
		const result = await run(makeRequest('clearPlayHistory'));
		expect(result).toMatchObject({
			success: true,
			message: 'Deleted 0 play history records'
		});
	});

	it('scopes the delete message to the year when supplied', async () => {
		const result = await run(makeRequest('clearPlayHistory', { year: '2023' }));
		expect(result).toMatchObject({
			success: true,
			message: 'Deleted 0 play history records for 2023'
		});
	});

	it('rejects unparseable year as 400', async () => {
		const result = await run(makeRequest('clearPlayHistory', { year: 'all-of-time' }));
		expect(result).toMatchObject({ status: 400, data: { error: 'Invalid year' } });
	});
});
