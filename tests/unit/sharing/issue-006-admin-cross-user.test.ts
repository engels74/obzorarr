import { beforeEach, describe, expect, it } from 'bun:test';
import { db } from '$lib/server/db/client';
import { shareSettings, users } from '$lib/server/db/schema';
import { setGlobalShareDefaults } from '$lib/server/sharing/service';
import { ShareMode, ShareModeSource } from '$lib/server/sharing/types';
import { load } from '../../../src/routes/wrapped/[year=year]/u/[identifier]/+page.server';
import { resetSharedTestDb } from '../../helpers/db';

// ISSUE-006 — the toggleLogo integer-id leak is fixed in the template via an
// absolute opaque form action (see tests/unit/admin/dogfood-ui-invariants.test.ts).
// The chosen fix deliberately does NOT add a load-level redirect, because an
// admin GET of another user's numeric PRIVATE_LINK URL must never 307 onto that
// user's secret token URL (address-bar/history/Referer leak) nor mint a
// slug/token as a write-on-GET.
//
// This test locks in that safe load behavior: an admin viewing another user's
// numeric PRIVATE_LINK URL is denied with the byte-identical anti-enumeration
// 404 (owner/admin must use the token URL), with NO redirect and NO share row
// minted as a side effect.

type LoadArgs = Parameters<typeof load>[0];

const YEAR = 2026;
const ADMIN_ID = 1;
const OTHER_USER_ID = 7;
const OTHER_USER_TOKEN = '550e8400-e29b-41d4-a716-446655440000';

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
		// The other user is PRIVATE_LINK with an EXISTING token (the realistic
		// state for a private-link user — the token is the link).
		await db.insert(shareSettings).values({
			userId: OTHER_USER_ID,
			year: YEAR,
			mode: ShareMode.PRIVATE_LINK,
			modeSource: ShareModeSource.EXPLICIT,
			shareToken: OTHER_USER_TOKEN,
			canUserControl: false
		});
	});

	it('denies with a 404 (no redirect) and mints no share row', async () => {
		const rowsBefore = await countShareRows();

		const result = await invokeLoad({
			identifier: String(OTHER_USER_ID),
			currentUser: { id: ADMIN_ID, plexId: 100001, username: 'admin', isAdmin: true }
		});

		// Denied via the anti-enumeration 404 — NOT a 3xx redirect.
		expect(result.threw).toBe(true);
		expect(result.status).toBe(404);
		expect(result.status).not.toBe(307);
		// No Location header carrying the other user's token URL.
		expect(result.redirectLocation).toBeUndefined();

		// No share_settings row minted as a GET side effect (ensurePublicSlug /
		// ensureShareToken must not fire on this denied load).
		const rowsAfter = await countShareRows();
		expect(rowsAfter).toBe(rowsBefore);

		// The other user's token is untouched (not regenerated).
		const otherRow = (await db.select().from(shareSettings)).find(
			(r) => r.userId === OTHER_USER_ID && r.year === YEAR
		);
		expect(otherRow?.shareToken).toBe(OTHER_USER_TOKEN);
	});
});
