import { beforeEach, describe, expect, it } from 'bun:test';
import { db } from '$lib/server/db/client';
import { users } from '$lib/server/db/schema';
import { ShareMode } from '$lib/server/sharing/types';
import { actions } from '../../../src/routes/dashboard/settings/+page.server';
import { resetSharedTestDb } from '../../helpers/db';

// ISSUE-006 regression: form actions do NOT run the route's redirecting `load`,
// so a same-origin POST from an unauthenticated browser previously dereferenced
// `locals.user!.id` and 500'd with a TypeError. requireUserActions must turn that
// into a clean fail(401) for every user-only action while leaving the
// authenticated path untouched.

const USER_ID = 42;

const anonymousLocals = { user: undefined } as unknown as App.Locals;
const authedLocals = {
	user: { id: USER_ID, plexId: 100042, username: 'user-42', isAdmin: false }
} as App.Locals;

type UpdateShareModeAction = NonNullable<typeof actions.updateShareMode>;
type RegenerateTokenAction = NonNullable<typeof actions.regenerateToken>;
type UpdateLogoPreferenceAction = NonNullable<typeof actions.updateLogoPreference>;

function makeRequest(body?: FormData): Request {
	return new Request('https://obzorarr.example/dashboard/settings', {
		method: 'POST',
		body: body ?? new FormData()
	});
}

async function seedUser(): Promise<void> {
	await db.insert(users).values({
		id: USER_ID,
		plexId: 100042,
		accountId: 200042,
		username: 'user-42'
	});
}

describe('dashboard settings unauthenticated action guard (ISSUE-006)', () => {
	beforeEach(async () => {
		await resetSharedTestDb();
	});

	it('updateShareMode returns 401 (not a 500/TypeError) when locals.user is undefined', async () => {
		const updateShareMode = actions.updateShareMode as UpdateShareModeAction;
		const formData = new FormData();
		formData.set('mode', ShareMode.PUBLIC);
		const result = await updateShareMode({
			request: makeRequest(formData),
			locals: anonymousLocals
		} as unknown as Parameters<UpdateShareModeAction>[0]);
		expect((result as { status?: number }).status).toBe(401);
	});

	it('regenerateToken returns 401 when locals.user is undefined', async () => {
		const regenerateToken = actions.regenerateToken as RegenerateTokenAction;
		const result = await regenerateToken({
			locals: anonymousLocals
		} as unknown as Parameters<RegenerateTokenAction>[0]);
		expect((result as { status?: number }).status).toBe(401);
	});

	it('updateLogoPreference returns 401 when locals.user is undefined', async () => {
		const updateLogoPreference = actions.updateLogoPreference as UpdateLogoPreferenceAction;
		const formData = new FormData();
		formData.set('logoPreference', 'show');
		const result = await updateLogoPreference({
			request: makeRequest(formData),
			locals: anonymousLocals
		} as unknown as Parameters<UpdateLogoPreferenceAction>[0]);
		expect((result as { status?: number }).status).toBe(401);
	});

	it('passes the guard for an authenticated user (invalid mode -> 400, never 401)', async () => {
		// An invalid `mode` is rejected by the schema branch before any share-settings
		// lookup, so seeding a user is the only setup the pass-through path touches.
		await seedUser();

		const updateShareMode = actions.updateShareMode as UpdateShareModeAction;
		const formData = new FormData();
		formData.set('mode', 'not-a-real-mode');
		const result = await updateShareMode({
			request: makeRequest(formData),
			locals: authedLocals
		} as unknown as Parameters<UpdateShareModeAction>[0]);
		// Guard passed through to the handler, which rejects the bad mode with 400.
		expect((result as { status?: number }).status).toBe(400);
		expect((result as { status?: number }).status).not.toBe(401);
	});
});
