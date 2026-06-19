import { beforeEach, describe, expect, it } from 'bun:test';
import { ShareMode } from '$lib/server/sharing/types';
import { actions } from '../../../src/routes/wrapped/[year=year]/u/[identifier]/+page.server';
import { resetSharedTestDb } from '../../helpers/db';

// ISSUE-001 regression: SvelteKit form actions do NOT run the route's `load`,
// so a same-origin POST from an unauthenticated browser must be rejected by each
// action's own inline `!locals.user` guard rather than dereferencing `locals.user`
// and 500'ing with a TypeError. The dogfood-logged TypeErrors on this surface were
// stale (pre-ISSUE-006 build); the guards below are already correct. This test
// locks that in so removing any guard fails CI instead of regressing to a 500.
//
// Recorded `locals.user` deref sweep (verified against source) — all surfaces
// self-guard before dereferencing the user:
// | Surface                              | Deref site            | Guard                                   |
// | dashboard/settings load              | +page.server.ts:55    | !locals.user -> 303 at L41-47           |
// | dashboard/settings actions           | L108/158/198          | requireUserActions -> fail(401)         |
// | dashboard/+layout load               | L18-34                | !locals.user -> 303 at L7               |
// | wrapped/[identifier] actions         | L387/405/427/486      | inline !locals.user -> fail(401) (here) |
// | admin/+layout, admin/wrapped         | locals.user!.id       | authorizationHandle gates /admin/**     |
// | api/security/dismiss-csrf-warning    | :11/18                | !locals.user -> 401 at :7               |
// | api/security/reverse-proxy-diagnostic| :33                   | !locals.user -> 401 at :16              |
// | api/onboarding/servers/select/test   | .isAdmin/.username    | !locals.user / !isAdmin -> 401/403      |
// | onboarding/plex actions              | :116/180/318          | !locals.user -> fail at L68/162/187/228 |
// | onboarding/settings actions          | :369/408              | locals.user?.isAdmin optional-chain     |
// | auth/plex/redirect, root +page.server| :9 / :23              | load behind redirecting guards          |

const anonymousLocals = { user: undefined } as unknown as App.Locals;
const authedLocals = {
	user: { id: 42, plexId: 100042, username: 'user-42', isAdmin: false }
} as App.Locals;

type ToggleLogoAction = NonNullable<typeof actions.toggleLogo>;
type UpdateShareModeAction = NonNullable<typeof actions.updateShareMode>;
type RegenerateTokenAction = NonNullable<typeof actions.regenerateToken>;

function makeRequest(body?: FormData): Request {
	return new Request('https://obzorarr.example/wrapped/2024/u/42', {
		method: 'POST',
		body: body ?? new FormData()
	});
}

describe('wrapped [identifier] unauthenticated action guard (ISSUE-001)', () => {
	beforeEach(async () => {
		await resetSharedTestDb();
	});

	it('toggleLogo returns 401 (not a 500/TypeError) when locals.user is undefined', async () => {
		const toggleLogo = actions.toggleLogo as ToggleLogoAction;
		const result = await toggleLogo({
			request: makeRequest(),
			params: { year: '2024', identifier: '42' },
			locals: anonymousLocals
		} as unknown as Parameters<ToggleLogoAction>[0]);
		expect((result as { status?: number }).status).toBe(401);
	});

	it('updateShareMode returns 401 when locals.user is undefined', async () => {
		const updateShareMode = actions.updateShareMode as UpdateShareModeAction;
		const formData = new FormData();
		formData.set('mode', ShareMode.PUBLIC);
		const result = await updateShareMode({
			request: makeRequest(formData),
			params: { year: '2024', identifier: '42' },
			locals: anonymousLocals
		} as unknown as Parameters<UpdateShareModeAction>[0]);
		expect((result as { status?: number }).status).toBe(401);
	});

	it('regenerateToken returns 401 when locals.user is undefined', async () => {
		const regenerateToken = actions.regenerateToken as RegenerateTokenAction;
		const result = await regenerateToken({
			params: { year: '2024', identifier: '42' },
			locals: anonymousLocals
		} as unknown as Parameters<RegenerateTokenAction>[0]);
		expect((result as { status?: number }).status).toBe(401);
	});

	// For an authenticated user the guard passes through; an invalid `year` param is
	// rejected by the next check with 400, proving the user guard never short-circuits
	// a legitimate session to 401. The invalid-year branch sits immediately after the
	// user guard in all three actions, so it isolates the guard without touching the DB.
	it('toggleLogo passes the guard for an authenticated user (invalid year -> 400, never 401)', async () => {
		const toggleLogo = actions.toggleLogo as ToggleLogoAction;
		const result = await toggleLogo({
			request: makeRequest(),
			params: { year: 'not-a-year', identifier: '42' },
			locals: authedLocals
		} as unknown as Parameters<ToggleLogoAction>[0]);
		expect((result as { status?: number }).status).toBe(400);
		expect((result as { status?: number }).status).not.toBe(401);
	});

	it('updateShareMode passes the guard for an authenticated user (invalid year -> 400, never 401)', async () => {
		const updateShareMode = actions.updateShareMode as UpdateShareModeAction;
		const formData = new FormData();
		formData.set('mode', ShareMode.PUBLIC);
		const result = await updateShareMode({
			request: makeRequest(formData),
			params: { year: 'not-a-year', identifier: '42' },
			locals: authedLocals
		} as unknown as Parameters<UpdateShareModeAction>[0]);
		expect((result as { status?: number }).status).toBe(400);
		expect((result as { status?: number }).status).not.toBe(401);
	});

	it('regenerateToken passes the guard for an authenticated user (invalid year -> 400, never 401)', async () => {
		const regenerateToken = actions.regenerateToken as RegenerateTokenAction;
		const result = await regenerateToken({
			params: { year: 'not-a-year', identifier: '42' },
			locals: authedLocals
		} as unknown as Parameters<RegenerateTokenAction>[0]);
		expect((result as { status?: number }).status).toBe(400);
		expect((result as { status?: number }).status).not.toBe(401);
	});
});
