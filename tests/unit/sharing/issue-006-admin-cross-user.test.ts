import { beforeEach, describe, expect, it } from 'bun:test';
import { db } from '$lib/server/db/client';
import { shareSettings, users } from '$lib/server/db/schema';
import { setGlobalShareDefaults } from '$lib/server/sharing/service';
import { ShareMode } from '$lib/server/sharing/types';
import { load } from '../../../src/routes/wrapped/[year=year]/u/[identifier]/+page.server';
import { resetSharedTestDb } from '../../helpers/db';

// ISSUE-006 — the toggleLogo integer-id leak is fixed in the template via an
// absolute opaque form action (see tests/unit/admin/dogfood-ui-invariants.test.ts).
// Admins may inspect historical Wrapped data through a numeric URL, but the
// loader must never redirect them onto another user's private token URL or mint
// a slug/token as a write-on-GET.

type LoadArgs = Parameters<typeof load>[0];

const YEAR = 2026;
const ADMIN_ID = 1;
const OTHER_USER_ID = 7;

async function seedUser(userId: number, plexId: number, accountId: number): Promise<void> {
	await db.insert(users).values({
		id: userId,
		plexId,
		accountId,
		username: `user-${userId}`
	});
}

async function countShareRows(): Promise<number> {
	return (await db.select().from(shareSettings)).length;
}

async function invokeLoad(params: {
	identifier: string;
	currentUser: App.Locals['user'];
}): Promise<{ status?: number; redirectLocation?: string; threw: boolean }> {
	try {
		await load({
			params: { year: String(YEAR), identifier: params.identifier },
			locals: { user: params.currentUser },
			parent: async () => ({ availableYears: [YEAR] }),
			setHeaders: () => {}
		} as unknown as LoadArgs);
		return { threw: false };
	} catch (err) {
		const e = err as { status?: number; location?: string };
		return { threw: true, status: e.status, redirectLocation: e.location };
	}
}

describe('ISSUE-006 — admin viewing another user’s numeric PRIVATE_LINK URL', () => {
	beforeEach(async () => {
		await resetSharedTestDb();
		await seedUser(ADMIN_ID, 100001, 200001);
		await seedUser(OTHER_USER_ID, 100007, 200007);
		await setGlobalShareDefaults({
			defaultShareMode: ShareMode.PRIVATE_LINK,
			allowUserControl: false
		});
	});

	it('allows inspection without redirecting or minting a private link', async () => {
		const rowsBefore = await countShareRows();

		const result = await invokeLoad({
			identifier: String(OTHER_USER_ID),
			currentUser: { id: ADMIN_ID, plexId: 100001, username: 'admin', isAdmin: true }
		});

		expect(result.threw).toBe(false);
		expect(result.status).toBeUndefined();
		expect(result.redirectLocation).toBeUndefined();

		// No share_settings row is minted as a GET side effect.
		const rowsAfter = await countShareRows();
		expect(rowsAfter).toBe(rowsBefore);

		expect(
			(await db.select().from(shareSettings)).find(
				(row) => row.userId === OTHER_USER_ID && row.year === YEAR
			)
		).toBeUndefined();
	});
});
