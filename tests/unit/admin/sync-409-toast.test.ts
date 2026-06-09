import { beforeEach, describe, expect, it } from 'bun:test';
import { join } from 'node:path';
import { db } from '$lib/server/db/client';
import { syncStatus } from '$lib/server/db/schema';
import { stopSyncScheduler } from '$lib/server/sync/scheduler';
import { actions } from '../../../src/routes/admin/sync/+page.server';
import { resetSharedTestDb } from '../../helpers/db';

// DF-08 source-guard + integration test.
//
// Integration: a second concurrent startSync must return HTTP 409 with the
// "already in progress" error payload when a running syncStatus row exists.
//
// Source-guard: +page.svelte must wire handleFormToast(form) so the 409
// surfaces as a toast (not a silent failure). The $effect wiring is the only
// mechanism that bridges the fail(409, ...) response to the toast.

const PROJECT_ROOT = join(import.meta.dir, '..', '..', '..');

async function readSource(relPath: string): Promise<string> {
	return Bun.file(join(PROJECT_ROOT, relPath)).text();
}

const adminLocals = {
	user: { id: 1, plexId: 1, username: 'admin', isAdmin: true }
} as unknown as App.Locals;

type StartSyncAction = NonNullable<typeof actions.startSync>;

function runStartSync() {
	const request = new Request('http://localhost/admin/sync?/startSync', {
		method: 'POST',
		body: new FormData()
	});
	const handler = actions.startSync as StartSyncAction;
	return handler({ request, locals: adminLocals } as Parameters<StartSyncAction>[0]);
}

describe('DF-08 — startSync returns 409 when a sync is already running', () => {
	beforeEach(async () => {
		await resetSharedTestDb();
		stopSyncScheduler();
	});

	it('returns HTTP 409 with an "already in progress" error when a running syncStatus row exists', async () => {
		// Seed a running sync row so isSyncRunning() returns true.
		await db.insert(syncStatus).values({
			startedAt: new Date(Date.now() - 5000),
			status: 'running',
			recordsProcessed: 0
		});

		const result = (await runStartSync()) as { status?: number; data?: { error?: string } };

		expect(result.status).toBe(409);
		expect(result.data?.error).toMatch(/already in progress|already running/i);
	});

	it('returns a started=true success payload when no sync is running', async () => {
		// No running row → startBackgroundSync should launch (or at least not 409).
		// We only assert it is NOT a 409 conflict here; the full sync lifecycle
		// is covered in tests/unit/sync/.
		const result = (await runStartSync()) as {
			status?: number;
			started?: boolean;
			success?: boolean;
		};
		// Must not be a 409 conflict.
		expect(result.status).not.toBe(409);
	});
});

describe('DF-08 source-guard — sync +page.svelte wires handleFormToast(form)', () => {
	const SYNC_PAGE = 'src/routes/admin/sync/+page.svelte';

	it('imports handleFormToast', async () => {
		const src = await readSource(SYNC_PAGE);
		expect(src).toContain("import { handleFormToast } from '$lib/utils/form-toast'");
	});

	it('calls handleFormToast(form) inside a $effect so 409 responses surface as toasts', async () => {
		const src = await readSource(SYNC_PAGE);
		// The $effect block that calls handleFormToast(form) is the wiring that
		// bridges fail(409, { error }) to the toast system. If it is removed the
		// 409 response will be silently discarded.
		expect(src).toMatch(
			/\$effect\s*\(\s*\(\s*\)\s*=>\s*\{[\s\S]*?handleFormToast\s*\(\s*form\s*\)/
		);
	});
});
