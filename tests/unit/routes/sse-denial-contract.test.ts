import { beforeEach, describe, expect, it } from 'bun:test';
import { join } from 'node:path';
import { AppSettingsKey, setAppSetting } from '$lib/server/admin/settings.service';
import { isAdminRouteId } from '$lib/server/auth/guards';
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
