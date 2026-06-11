import { beforeEach, describe, expect, it } from 'bun:test';
import { insertLog, queryLogs } from '$lib/server/logging/service';
import { resetSharedTestDb } from '../../helpers/db';

// ISSUE-006 lock-in regression test.
//
// Reported symptom: "log search is case-sensitive". Empirically it is NOT — the
// server-side filter uses SQL `LIKE`, and bun:sqlite's `LIKE` is ASCII
// case-insensitive by default. This test locks that behavior in so a future
// change (e.g. swapping LIKE for GLOB, or adding a binary collation) cannot
// silently make search case-sensitive again.
//
// NOTE: no source change / no `COLLATE NOCASE` is added — that would be a no-op
// for the reported symptom (LIKE already folds ASCII case). ASCII-only folding
// is what SQLite provides; Unicode (non-ASCII) case-folding, if ever desired, is
// a separate, explicitly-designed change.

const LEVEL = 'INFO';

describe('ISSUE-006 — log search is case-insensitive (ASCII, lock-in)', () => {
	beforeEach(async () => {
		await resetSharedTestDb();
		await insertLog({ level: LEVEL, message: 'error happened' });
		await insertLog({ level: LEVEL, message: 'Error happened' });
		await insertLog({ level: LEVEL, message: 'ERROR happened' });
		await insertLog({ level: LEVEL, message: 'unrelated' });
	});

	it('matches all three mixed-case rows when searching uppercase ERROR', async () => {
		const result = await queryLogs({ search: 'ERROR' });
		expect(result.totalCount).toBe(3);
		const messages = result.logs.map((l) => l.message).sort();
		expect(messages).toEqual(['ERROR happened', 'Error happened', 'error happened']);
		expect(messages).not.toContain('unrelated');
	});

	it('matches all three mixed-case rows when searching lowercase error', async () => {
		const result = await queryLogs({ search: 'error' });
		expect(result.totalCount).toBe(3);
		const messages = result.logs.map((l) => l.message).sort();
		expect(messages).toEqual(['ERROR happened', 'Error happened', 'error happened']);
		expect(messages).not.toContain('unrelated');
	});

	it('excludes non-matching rows for an unrelated term', async () => {
		const result = await queryLogs({ search: 'unrelated' });
		expect(result.totalCount).toBe(1);
		expect(result.logs[0]?.message).toBe('unrelated');
	});
});
