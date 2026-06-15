import { beforeEach, describe, expect, it } from 'bun:test';
import { insertLog, queryLogs } from '$lib/server/logging/service';
import { resetSharedTestDb } from '../../helpers/db';

// ISSUE-009 regression test.
//
// Log search now matches message OR source. Previously only the message column
// was searched; this test pins the widened behavior so a future change cannot
// silently revert to message-only search.

describe('ISSUE-009 — log search matches message OR source', () => {
	beforeEach(async () => {
		await resetSharedTestDb();
	});

	it('returns rows whose source matches the search term (not present in message)', async () => {
		await insertLog({ level: 'INFO', message: 'something happened', source: 'plex-sync' });
		await insertLog({ level: 'INFO', message: 'something happened', source: 'auth' });
		await insertLog({ level: 'INFO', message: 'unrelated' });

		const result = await queryLogs({ search: 'plex' });
		expect(result.totalCount).toBe(1);
		expect(result.logs[0]?.source).toBe('plex-sync');
	});

	it('returns rows whose message matches the search term (source is null)', async () => {
		await insertLog({ level: 'INFO', message: 'sync started' });
		await insertLog({ level: 'INFO', message: 'auth failed' });

		const result = await queryLogs({ search: 'sync' });
		expect(result.totalCount).toBe(1);
		expect(result.logs[0]?.message).toBe('sync started');
	});

	it('returns rows matching either message or source with the same term', async () => {
		await insertLog({ level: 'INFO', message: 'scheduler tick', source: 'scheduler' });
		await insertLog({ level: 'WARN', message: 'scheduler overdue', source: 'watchdog' });
		await insertLog({ level: 'INFO', message: 'unrelated', source: 'auth' });

		const result = await queryLogs({ search: 'scheduler' });
		expect(result.totalCount).toBe(2);
		const messages = result.logs.map((l) => l.message).sort();
		expect(messages).toEqual(['scheduler overdue', 'scheduler tick']);
	});

	it('AND-combines free-text search with the level filter', async () => {
		await insertLog({ level: 'INFO', message: 'plex ok', source: 'plex-sync' });
		await insertLog({ level: 'ERROR', message: 'plex failed', source: 'plex-sync' });
		await insertLog({ level: 'INFO', message: 'auth ok', source: 'auth' });

		const result = await queryLogs({ search: 'plex', levels: ['ERROR'] });
		expect(result.totalCount).toBe(1);
		expect(result.logs[0]?.message).toBe('plex failed');
	});

	it('AND-combines free-text search with the source-dropdown filter (eq)', async () => {
		await insertLog({ level: 'INFO', message: 'token rotated', source: 'auth' });
		await insertLog({ level: 'INFO', message: 'token expired', source: 'plex-sync' });
		await insertLog({ level: 'INFO', message: 'other', source: 'auth' });

		// source dropdown pins "auth"; free-text "token" narrows within auth rows only
		const result = await queryLogs({ search: 'token', source: 'auth' });
		expect(result.totalCount).toBe(1);
		expect(result.logs[0]?.message).toBe('token rotated');
		expect(result.logs[0]?.source).toBe('auth');
	});

	it('source-only search via source-dropdown still works independently (no regression)', async () => {
		await insertLog({ level: 'INFO', message: 'msg a', source: 'auth' });
		await insertLog({ level: 'INFO', message: 'msg b', source: 'plex-sync' });

		const result = await queryLogs({ source: 'auth' });
		expect(result.totalCount).toBe(1);
		expect(result.logs[0]?.source).toBe('auth');
	});
});
