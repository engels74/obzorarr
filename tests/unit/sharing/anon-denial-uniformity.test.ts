import { beforeEach, describe, expect, it } from 'bun:test';
import { db } from '$lib/server/db/client';
import { shareSettings, users } from '$lib/server/db/schema';
import { getShareIdentifier, setGlobalShareDefaults } from '$lib/server/sharing/service';
import { ShareMode, ShareModeSource, WRAPPED_NOT_FOUND_MESSAGE } from '$lib/server/sharing/types';
import { load } from '../../../src/routes/wrapped/[year=year]/u/[identifier]/+page.server';
import { resetSharedTestDb } from '../../helpers/db';

// ISSUE-009: anonymous-denial uniformity across ALL token-path exits + the slug
// path. For an anonymous caller, every "cannot view" outcome must return a
// byte-identical 404 + WRAPPED_NOT_FOUND_MESSAGE so existence cannot be inferred.
// The three token-path exits that previously diverged:
//   1. valid-token-wrong-year (was a distinguishable 404 message, OUTSIDE the catch)
//   2. InvalidShareTokenError (was a distinguishable 404 message)
//   3. ShareAccessDeniedError (was a 403 with an oauth-floor hint)
// The slug path was already uniform; this test locks all four together.
//
// Scope of the guarantee: response CONTENT (HTTP status + body) only. Timing is
// explicitly out of scope. Authenticated callers retain the differentiated
// 403/404 (membership already proves access) — asserted below so the narrowing
// does not silently over-reach.

type LoadArgs = Parameters<typeof load>[0];

const YEAR = 2024;
const OTHER_YEAR = 2023;
const USER_ID = 42;

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

async function seedShareSettings(options: {
	userId: number;
	year: number;
	mode: (typeof ShareMode)[keyof typeof ShareMode];
	token: string | null;
}): Promise<void> {
	await db.insert(shareSettings).values({
		userId: options.userId,
		year: options.year,
		mode: options.mode,
		modeSource: ShareModeSource.EXPLICIT,
		shareToken: options.token,
		canUserControl: false
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
		expect.unreachable(`Expected load to fail for "${params.identifier}"`);
		return {};
	} catch (err) {
		const e = err as { status?: number; body?: { message?: string } };
		return { status: e.status, message: e.body?.message };
	}
}

// Well-formed (UUID v4) test tokens. Deliberately low-entropy repeated-nibble
// values so the secret scanner does not flag them as real credentials; only the
// UUID v4 shape matters to isValidTokenFormat.
const UNKNOWN_TOKEN = '11111111-1111-4111-8111-111111111111';
const REVOKED_TOKEN = '22222222-2222-4222-8222-222222222222';
const WRONG_YEAR_TOKEN = '33333333-3333-4333-8333-333333333333';
const OAUTH_BLOCKED_TOKEN = '44444444-4444-4444-8444-444444444444';

describe('wrapped/[year]/u/[identifier]: ISSUE-009 anonymous-denial uniformity', () => {
	beforeEach(async () => {
		await resetSharedTestDb();
		await seedUser(USER_ID);
	});

	it('returns byte-identical 404 + WRAPPED_NOT_FOUND_MESSAGE across all six anonymous denial cases', async () => {
		// Case 1: non-existent token (well-formed UUID, never minted).
		await setGlobalShareDefaults({
			defaultShareMode: ShareMode.PRIVATE_LINK,
			allowUserControl: false
		});
		const nonExistentToken = await captureFailure({ year: YEAR, identifier: UNKNOWN_TOKEN });

		// Case 2: a second unknown token (the "revoked" shape — same Invalid path).
		const revokedToken = await captureFailure({ year: YEAR, identifier: REVOKED_TOKEN });

		// Case 3: oauth-floor-blocked token — a valid private-link token whose
		// effective mode the floor raises to private-oauth; anonymous is gated.
		await seedShareSettings({
			userId: USER_ID,
			year: YEAR,
			mode: ShareMode.PRIVATE_LINK,
			token: OAUTH_BLOCKED_TOKEN
		});
		await setGlobalShareDefaults({
			defaultShareMode: ShareMode.PRIVATE_OAUTH,
			allowUserControl: false
		});
		const oauthBlockedToken = await captureFailure({ year: YEAR, identifier: OAUTH_BLOCKED_TOKEN });

		// Case 4: valid token for the WRONG year (the line-126 exit). Floor PUBLIC so
		// the token still resolves; the year mismatch is what denies it.
		await setGlobalShareDefaults({
			defaultShareMode: ShareMode.PUBLIC,
			allowUserControl: false
		});
		await seedShareSettings({
			userId: USER_ID,
			year: YEAR,
			mode: ShareMode.PRIVATE_LINK,
			token: WRONG_YEAR_TOKEN
		});
		const wrongYearToken = await captureFailure({ year: OTHER_YEAR, identifier: WRONG_YEAR_TOKEN });

		// Case 5: non-existent slug (non-token, non-numeric garbage identifier).
		const nonExistentSlug = await captureFailure({
			year: YEAR,
			identifier: 'definitely-not-a-real-identifier'
		});

		// Case 6: access-denied slug — a private-oauth page reached anonymously via
		// its real opaque slug.
		const DENIED_USER = 77;
		await seedUser(DENIED_USER);
		await seedShareSettings({
			userId: DENIED_USER,
			year: YEAR,
			mode: ShareMode.PRIVATE_OAUTH,
			token: null
		});
		const deniedSlugId = await getShareIdentifier(DENIED_USER, YEAR);
		const accessDeniedSlug = await captureFailure({ year: YEAR, identifier: deniedSlugId });

		const all = [
			nonExistentToken,
			revokedToken,
			oauthBlockedToken,
			wrongYearToken,
			nonExistentSlug,
			accessDeniedSlug
		];

		for (const outcome of all) {
			expect(outcome.status).toBe(404);
			expect(outcome.message).toBe(WRAPPED_NOT_FOUND_MESSAGE);
		}
	});

	it('still resolves a valid share-link token for an anonymous viewer (positive, 200)', async () => {
		const VALID_TOKEN = '55555555-5555-4555-8555-555555555555';
		await setGlobalShareDefaults({
			defaultShareMode: ShareMode.PRIVATE_LINK,
			allowUserControl: false
		});
		await seedShareSettings({
			userId: USER_ID,
			year: YEAR,
			mode: ShareMode.PRIVATE_LINK,
			token: VALID_TOKEN
		});

		const data = (await invokeLoad({ year: YEAR, identifier: VALID_TOKEN })) as {
			userId: number;
		};
		expect(data.userId).toBe(USER_ID);
	});

	it('still resolves a public page for an anonymous viewer via its opaque slug (positive, 200)', async () => {
		await setGlobalShareDefaults({
			defaultShareMode: ShareMode.PUBLIC,
			allowUserControl: false
		});
		await seedShareSettings({
			userId: USER_ID,
			year: YEAR,
			mode: ShareMode.PUBLIC,
			token: null
		});
		const slug = await getShareIdentifier(USER_ID, YEAR);

		const data = (await invokeLoad({ year: YEAR, identifier: slug })) as { userId: number };
		expect(data.userId).toBe(USER_ID);
	});

	it('keeps the differentiated 404 message for an AUTHENTICATED caller on an unknown token (divergence preserved)', async () => {
		await setGlobalShareDefaults({
			defaultShareMode: ShareMode.PRIVATE_LINK,
			allowUserControl: false
		});

		const outcome = await captureFailure({
			year: YEAR,
			identifier: UNKNOWN_TOKEN,
			currentUser: { id: 5, plexId: 100005, username: 'user-5', isAdmin: false }
		});

		expect(outcome.status).toBe(404);
		// Authenticated callers keep the legacy differentiated message, NOT the
		// anonymous anti-enumeration body.
		expect(outcome.message).toBe('This share link is invalid, expired, or has been revoked.');
		expect(outcome.message).not.toBe(WRAPPED_NOT_FOUND_MESSAGE);
	});

	it('resolves an oauth-floor-blocked token for an AUTHENTICATED member (positive, 200)', async () => {
		await seedShareSettings({
			userId: USER_ID,
			year: YEAR,
			mode: ShareMode.PRIVATE_LINK,
			token: OAUTH_BLOCKED_TOKEN
		});
		await setGlobalShareDefaults({
			defaultShareMode: ShareMode.PRIVATE_OAUTH,
			allowUserControl: false
		});

		const data = (await invokeLoad({
			year: YEAR,
			identifier: OAUTH_BLOCKED_TOKEN,
			currentUser: { id: 5, plexId: 100005, username: 'user-5', isAdmin: false }
		})) as { userId: number };
		expect(data.userId).toBe(USER_ID);
	});
});
