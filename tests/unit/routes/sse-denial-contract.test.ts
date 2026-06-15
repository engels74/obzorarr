import { beforeEach, describe, expect, it } from 'bun:test';
import { join } from 'node:path';
import { AppSettingsKey, setAppSetting } from '$lib/server/admin/settings.service';
import { isAdminRouteId } from '$lib/server/auth/guards';
import {
	clearSyncProgress,
	startSyncProgress,
	updateSyncProgress
} from '$lib/server/sync/progress';
import { GET as adminLogsStreamGET } from '../../../src/routes/admin/logs/stream/+server';
import { GET as adminSyncStreamGET } from '../../../src/routes/admin/sync/stream/+server';
import { GET as apiSyncStatusStreamGET } from '../../../src/routes/api/sync/status/stream/+server';
import { resetSharedTestDb } from '../../helpers/db';

// ISSUE-008 — SSE denial contract.
//
// The denial responses for the three streaming endpoints are intentionally
// split and documented in hooks.server.ts / the api endpoint:
//   - admin streams (/admin/logs/stream, /admin/sync/stream): denied by the
//     `authorizationHandle` hook with a 303 for anonymous callers (to
//     '/?returnTo=<encodedPath>' for a safe path, else '/'), BEFORE the
//     endpoint's own requireAdmin 403 ever runs.
//   - /api/sync/status/stream: returns 401 JSON from its own handler once
//     onboarding is complete.
//
// The split is cosmetic for SSE consumers — a browser EventSource cannot read a
// 401 body or follow a 303, so both surface only as `onerror`; it is observable
// only to programmatic (curl/fetch) clients. These tests pin the observable
// contract so the split stays intentional, not accidental.

const PROJECT_ROOT = join(import.meta.dir, '..', '..', '..');

async function readSource(relPath: string): Promise<string> {
	return Bun.file(join(PROJECT_ROOT, relPath)).text();
}

type AnyGet = (args: { request: Request; locals: App.Locals }) => Promise<Response>;

function streamRequest(path: string): Request {
	return new Request(`http://localhost${path}`, { method: 'GET' });
}

async function expectStatus(get: AnyGet, locals: App.Locals, path: string): Promise<number> {
	try {
		const res = await get({ request: streamRequest(path), locals });
		return res.status;
	} catch (err) {
		// requireAdmin throws a SvelteKit HttpError with a numeric status.
		return (err as { status?: number }).status ?? 0;
	}
}

describe('ISSUE-008 — /api/sync/status/stream anon denial after onboarding', () => {
	beforeEach(resetSharedTestDb);

	it('returns 401 JSON for an anonymous caller once onboarding is complete', async () => {
		await setAppSetting(AppSettingsKey.ONBOARDING_COMPLETED, 'true');

		const res = await apiSyncStatusStreamGET({
			request: streamRequest('/api/sync/status/stream'),
			locals: {} as App.Locals
		} as Parameters<typeof apiSyncStatusStreamGET>[0]);

		expect(res.status).toBe(401);
		expect(res.headers.get('Content-Type')).toBe('application/json');
		expect(await res.json()).toMatchObject({ message: 'Unauthorized' });
	});
});

describe('ISSUE-008 — admin stream routes are admin-gated (hook 303 governs anon)', () => {
	// The observable anon denial for these routes is the hook 303; the endpoint
	// requireAdmin 403 is unreachable for anon because the hook fires first. We
	// assert (a) the routes are classified as admin routes so the hook governs
	// them, and (b) the endpoints' own requireAdmin denies non-admin as
	// defense-in-depth.
	beforeEach(resetSharedTestDb);

	it('classifies both admin stream route ids as admin routes', () => {
		expect(isAdminRouteId('/admin/logs/stream')).toBe(true);
		expect(isAdminRouteId('/admin/sync/stream')).toBe(true);
	});

	it('admin logs stream endpoint denies an anonymous caller (403 defense-in-depth)', async () => {
		const status = await expectStatus(
			adminLogsStreamGET as AnyGet,
			{} as App.Locals,
			'/admin/logs/stream'
		);
		expect(status).toBe(403);
	});

	it('admin sync stream endpoint denies an anonymous caller (403 defense-in-depth)', async () => {
		const status = await expectStatus(
			adminSyncStreamGET as AnyGet,
			{} as App.Locals,
			'/admin/sync/stream'
		);
		expect(status).toBe(403);
	});
});

describe('ISSUE-008 — denial-contract rationale is documented in source', () => {
	it('hooks.server.ts authorizationHandle records the 303-vs-401 rationale', async () => {
		const src = await readSource('src/hooks.server.ts');
		// The rationale sits in a block comment immediately preceding the handler.
		const commentIdx = src.indexOf('ISSUE-008 — SSE denial contract');
		expect(commentIdx).toBeGreaterThan(-1);
		const handlerIdx = src.indexOf('const authorizationHandle');
		expect(handlerIdx).toBeGreaterThan(commentIdx);
		const rationale = src.slice(commentIdx, handlerIdx);
		expect(rationale).toContain('EventSource');
		// The admin-stream denial remains a 303 (redirectResponse) inside the handler.
		const handlerBody = src.slice(handlerIdx, handlerIdx + 1600);
		expect(handlerBody).toContain('redirectResponse');
	});

	it('/api/sync/status/stream records the 401-vs-303 rationale near its 401', async () => {
		const src = await readSource('src/routes/api/sync/status/stream/+server.ts');
		expect(src).toContain('ISSUE-008');
		expect(src).toContain('status: 401');
	});
});

// ISSUE-007 — /api/sync/status/stream is member-visible BY DESIGN.
//
// Unlike the admin stream routes, this endpoint is deliberately reachable by any
// authenticated user (member or admin) because the non-admin `/wrapped` layout
// live-sync indicator consumes it via `src/lib/stores/sync-status.svelte.ts`.
// These tests pin that intent: anonymous is denied post-onboarding, any
// authenticated user is allowed, the admin streams stay admin-only, and the SSE
// payload carries ONLY the simplifyProgress shape (no PII).

const MEMBER_LOCALS = {
	user: { id: 1, username: 'member', isAdmin: false }
} as unknown as App.Locals;

/**
 * Read the first SSE frame off an event-stream Response body and parse its JSON
 * `data:` payload. The endpoint emits a `connected` frame synchronously at
 * stream start, so a single read is sufficient.
 */
async function firstStreamFrame(res: Response): Promise<Record<string, unknown>> {
	const reader = res.body?.getReader();
	if (!reader) throw new Error('expected a readable SSE body');
	const decoder = new TextDecoder();
	let buffer = '';
	try {
		// The `connected` frame is enqueued from the stream's async `start`, so the
		// first read may resolve before any chunk arrives; accumulate until a full
		// `data:` line appears. The endpoint enqueues plain strings, but tolerate
		// byte chunks too.
		for (let i = 0; i < 10; i++) {
			const { value, done } = await reader.read();
			if (typeof value === 'string') buffer += value;
			else if (value) buffer += decoder.decode(value, { stream: true });
			const line = buffer.split('\n').find((l) => l.startsWith('data: '));
			if (line) return JSON.parse(line.slice('data: '.length));
			if (done) break;
		}
		throw new Error(`no data frame in stream: ${buffer}`);
	} finally {
		await reader.cancel();
	}
}

describe('ISSUE-007 — /api/sync/status/stream member-visibility contract', () => {
	beforeEach(resetSharedTestDb);

	it('returns 401 for an anonymous caller once onboarding is complete', async () => {
		await setAppSetting(AppSettingsKey.ONBOARDING_COMPLETED, 'true');

		const res = await apiSyncStatusStreamGET({
			request: streamRequest('/api/sync/status/stream'),
			locals: {} as App.Locals
		} as Parameters<typeof apiSyncStatusStreamGET>[0]);

		expect(res.status).toBe(401);
	});

	it('allows an authenticated non-admin caller (200 / text/event-stream)', async () => {
		await setAppSetting(AppSettingsKey.ONBOARDING_COMPLETED, 'true');

		const res = await apiSyncStatusStreamGET({
			request: streamRequest('/api/sync/status/stream'),
			locals: MEMBER_LOCALS
		} as Parameters<typeof apiSyncStatusStreamGET>[0]);

		try {
			expect(res.status).toBe(200);
			expect(res.headers.get('Content-Type')).toBe('text/event-stream');
		} finally {
			await res.body?.cancel();
		}
	});

	it('classifies the member endpoint route id as NOT an admin route', () => {
		// Defends the "member-visible by design" intent against an accidental move
		// under /admin where the authorization hook would gate it.
		expect(isAdminRouteId('/api/sync/status/stream')).toBe(false);
	});

	it('keeps the admin sync/logs streams admin-only (member is denied)', async () => {
		const syncStatusCode = await expectStatus(
			adminSyncStreamGET as AnyGet,
			MEMBER_LOCALS,
			'/admin/sync/stream'
		);
		const logsStatusCode = await expectStatus(
			adminLogsStreamGET as AnyGet,
			MEMBER_LOCALS,
			'/admin/logs/stream'
		);
		expect(syncStatusCode).toBe(403);
		expect(logsStatusCode).toBe(403);
	});

	it('documents member-visibility and the live-sync consumer in source', async () => {
		const src = await readSource('src/routes/api/sync/status/stream/+server.ts');
		expect(src).toContain('MEMBER-VISIBLE BY DESIGN');
		expect(src).toContain('src/lib/stores/sync-status.svelte.ts');
	});
});

describe('ISSUE-007 — SSE payload do-not-widen invariant', () => {
	// The emitted frames must carry ONLY the simplifyProgress shape plus the
	// envelope; no PII (titles, usernames, account IDs, tokens) and no error
	// bodies may leak. simplifyProgress lives in the endpoint module and reduces
	// the rich LiveSyncProgress down to: { phase, recordsProcessed,
	// recordsInserted, enrichmentTotal, enrichmentProcessed }.
	const ALLOWED_ENVELOPE_KEYS = ['type', 'inProgress', 'progress'];
	const ALLOWED_PROGRESS_KEYS = [
		'phase',
		'recordsProcessed',
		'recordsInserted',
		'enrichmentTotal',
		'enrichmentProcessed'
	];
	const FORBIDDEN_KEY_FRAGMENTS = [
		'title',
		'user',
		'name',
		'account',
		'token',
		'email',
		'error',
		'syncid',
		'startedat',
		'currentpage',
		'recordsskipped'
	];

	beforeEach(() => {
		resetSharedTestDb();
		clearSyncProgress();
	});

	it('emits only the simplifyProgress shape on a running-sync frame', async () => {
		await setAppSetting(AppSettingsKey.ONBOARDING_COMPLETED, 'true');

		// Drive a realistic running progress with rich/sensitive-adjacent fields
		// populated; simplifyProgress must strip everything outside its shape.
		startSyncProgress(42);
		updateSyncProgress({
			phase: 'enriching',
			recordsProcessed: 7,
			recordsInserted: 3,
			recordsSkipped: 4,
			currentPage: 2,
			enrichmentTotal: 10,
			enrichmentProcessed: 5,
			error: 'should-never-be-exposed'
		});

		const res = await apiSyncStatusStreamGET({
			request: streamRequest('/api/sync/status/stream'),
			locals: MEMBER_LOCALS
		} as Parameters<typeof apiSyncStatusStreamGET>[0]);

		try {
			const frame = await firstStreamFrame(res);

			// Envelope keys are exactly the allowed set.
			expect(Object.keys(frame).sort()).toEqual([...ALLOWED_ENVELOPE_KEYS].sort());
			expect(frame.type).toBe('connected');
			expect(frame.inProgress).toBe(true);

			const progress = frame.progress as Record<string, unknown>;
			expect(progress).not.toBeNull();
			// Progress keys are a subset of the allowed simplifyProgress shape.
			for (const key of Object.keys(progress)) {
				expect(ALLOWED_PROGRESS_KEYS).toContain(key);
			}
			expect(progress.phase).toBe('enriching');

			// No forbidden substring appears anywhere in the serialized frame.
			const serialized = JSON.stringify(frame).toLowerCase();
			for (const fragment of FORBIDDEN_KEY_FRAGMENTS) {
				expect(serialized).not.toContain(fragment);
			}
			expect(serialized).not.toContain('should-never-be-exposed');
		} finally {
			// firstStreamFrame already cancels the reader (and thus the stream).
			clearSyncProgress();
		}
	});

	it('emits a null progress envelope when no sync is in flight', async () => {
		await setAppSetting(AppSettingsKey.ONBOARDING_COMPLETED, 'true');
		clearSyncProgress();

		const res = await apiSyncStatusStreamGET({
			request: streamRequest('/api/sync/status/stream'),
			locals: MEMBER_LOCALS
		} as Parameters<typeof apiSyncStatusStreamGET>[0]);

		try {
			const frame = await firstStreamFrame(res);
			expect(Object.keys(frame).sort()).toEqual([...ALLOWED_ENVELOPE_KEYS].sort());
			expect(frame.type).toBe('connected');
			expect(frame.progress).toBeNull();
		} finally {
			// firstStreamFrame already cancels the reader (and thus the stream).
			clearSyncProgress();
		}
	});
});
