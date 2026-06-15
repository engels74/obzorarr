import { beforeEach, describe, expect, it } from 'bun:test';
import { db } from '$lib/server/db/client';
import { users } from '$lib/server/db/schema';
import { setGlobalShareDefaults } from '$lib/server/sharing/service';
import { ShareMode, WRAPPED_NOT_FOUND_MESSAGE } from '$lib/server/sharing/types';
import { load } from '../../../src/routes/wrapped/[year=year]/u/[identifier]/+page.server';
import { resetSharedTestDb } from '../../helpers/db';

// ISSUE-011: integer-identifier path (/wrapped/{year}/u/{id}) must resolve to
// the uniform anti-enumeration 404 for any caller who is NOT the owner or an
// admin. This pins the DF-04 / ISSUE-004 behavior:
//
//   - anonymous caller + integer id            → uniform 404 (no existence signal)
//   - authenticated non-owner member + int id  → uniform 404 (no member-walk)
//   - owner herself + integer id               → allowed (200)
//   - admin + integer id                       → allowed (200)
//
// This is a regression guard only — no behavior change.

type LoadArgs = Parameters<typeof load>[0];

const YEAR = 2024;
const OWNER_ID = 10;
const OTHER_USER_ID = 20;

interface TestUser {
	id: number;
	plexId: number;
	username: string;
	isAdmin: boolean;
}

async function seedUser(userId: number): Promise<void> {
	await db.insert(users).values({
		id: userId,
		plexId: 100000 + userId,
		accountId: 200000 + userId,
		username: `user-${userId}`
	});
}

async function invokeLoad(params: {
	year: number;
	identifier: string;
	currentUser?: TestUser;
}): Promise<unknown> {
	return load({
		params: { year: String(params.year), identifier: params.identifier },
		locals: params.currentUser ? { user: params.currentUser } : {},
		parent: async () => ({ availableYears: [params.year] }),
		setHeaders: () => {}
	} as unknown as LoadArgs);
}

async function captureFailure(params: {
	year: number;
	identifier: string;
	currentUser?: TestUser;
}): Promise<{ status?: number; message?: string }> {
	try {
		await invokeLoad(params);
		expect.unreachable(`Expected load to fail for identifier "${params.identifier}"`);
		return {};
	} catch (err) {
		const e = err as { status?: number; body?: { message?: string } };
		return { status: e.status, message: e.body?.message };
	}
}

describe('wrapped/[year]/u/[identifier]: ISSUE-011 integer-id uniform-404 for non-owner/anon', () => {
	beforeEach(async () => {
		await resetSharedTestDb();
		await seedUser(OWNER_ID);
		await seedUser(OTHER_USER_ID);
		// Use a permissive floor so the mode itself doesn't block anything —
		// integer-id gating is purely about ownership, not share mode.
		await setGlobalShareDefaults({
			defaultShareMode: ShareMode.PUBLIC,
			allowUserControl: false
		});
	});

	it('returns the uniform 404 + WRAPPED_NOT_FOUND_MESSAGE for an anonymous caller', async () => {
		const outcome = await captureFailure({
			year: YEAR,
			identifier: String(OWNER_ID)
		});
		expect(outcome.status).toBe(404);
		expect(outcome.message).toBe(WRAPPED_NOT_FOUND_MESSAGE);
	});

	it('returns the uniform 404 + WRAPPED_NOT_FOUND_MESSAGE for an authenticated non-owner member', async () => {
		const outcome = await captureFailure({
			year: YEAR,
			identifier: String(OWNER_ID),
			currentUser: {
				id: OTHER_USER_ID,
				plexId: 100000 + OTHER_USER_ID,
				username: `user-${OTHER_USER_ID}`,
				isAdmin: false
			}
		});
		expect(outcome.status).toBe(404);
		expect(outcome.message).toBe(WRAPPED_NOT_FOUND_MESSAGE);
	});

	it('returns the uniform 404 for a non-positive or non-safe integer (garbage numeric ids)', async () => {
		for (const badId of ['0', '-1', String(Number.MAX_SAFE_INTEGER + 1)]) {
			const outcome = await captureFailure({ year: YEAR, identifier: badId });
			expect(outcome.status).toBe(404);
			expect(outcome.message).toBe(WRAPPED_NOT_FOUND_MESSAGE);
		}
	});

	it('allows the owner to access their own integer-id path (positive control)', async () => {
		// The owner reaches the page through the numeric id; the load returns data.
		const data = (await invokeLoad({
			year: YEAR,
			identifier: String(OWNER_ID),
			currentUser: {
				id: OWNER_ID,
				plexId: 100000 + OWNER_ID,
				username: `user-${OWNER_ID}`,
				isAdmin: false
			}
		})) as { userId: number };
		expect(data.userId).toBe(OWNER_ID);
	});

	it('allows an admin to access any integer-id path (positive control)', async () => {
		const data = (await invokeLoad({
			year: YEAR,
			identifier: String(OWNER_ID),
			currentUser: {
				id: OTHER_USER_ID,
				plexId: 100000 + OTHER_USER_ID,
				username: `user-${OTHER_USER_ID}`,
				isAdmin: true
			}
		})) as { userId: number };
		expect(data.userId).toBe(OWNER_ID);
	});
});
