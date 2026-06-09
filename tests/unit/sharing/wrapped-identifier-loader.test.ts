import { beforeEach, describe, expect, it } from 'bun:test';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { shareSettings, users } from '$lib/server/db/schema';
import {
	getOwnerWrappedHref,
	getShareIdentifier,
	isValidSlugFormat,
	setGlobalShareDefaults
} from '$lib/server/sharing/service';
import { ShareMode, ShareModeSource } from '$lib/server/sharing/types';
import { load as loadServerWrapped } from '../../../src/routes/wrapped/[year=year]/+page.server';
import { actions, load } from '../../../src/routes/wrapped/[year=year]/u/[identifier]/+page.server';
import { resetSharedTestDb } from '../../helpers/db';

type LoadArgs = Parameters<typeof load>[0];
type ServerLoadArgs = Parameters<typeof loadServerWrapped>[0];

/**
 * Regression tests for private-link cross-year token leak.
 * See security audit Fix #1.
 *
 * When a visitor loads a wrapped page via a share token for year Y, the
 * loader must NOT embed tokens for other years in its response (previously
 * it looked up each year's share_settings and exposed every existing token).
 */

const ORIGIN_YEAR = 2024;
const OTHER_YEAR = 2023;

const CURRENT_YEAR_TOKEN = '550e8400-e29b-41d4-a716-446655440000';
const OTHER_YEAR_TOKEN_FOR_PRESEED = '660e8400-e29b-41d4-a716-446655440111';

async function seedUser(userId: number, plexId: number, accountId: number): Promise<void> {
	await db.insert(users).values({
		id: userId,
		plexId,
		accountId,
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

async function getStoredToken(userId: number, year: number): Promise<string | null> {
	const row = await db
		.select({ token: shareSettings.shareToken })
		.from(shareSettings)
		.where(and(eq(shareSettings.userId, userId), eq(shareSettings.year, year)))
		.limit(1);
	return row[0]?.token ?? null;
}

type LoadData = Extract<Awaited<ReturnType<typeof load>>, { yearIdentifiers?: unknown }>;

interface TestUser {
	id: number;
	plexId: number;
	username: string;
	isAdmin: boolean;
}

async function invokeLoad(params: {
	year: number;
	identifier: string;
	availableYears: number[];
	currentUser?: TestUser;
	headers?: Record<string, string>;
}): Promise<LoadData> {
	const result = await load({
		params: { year: String(params.year), identifier: params.identifier },
		locals: params.currentUser ? { user: params.currentUser } : {},
		parent: async () => ({ availableYears: params.availableYears }),
		setHeaders: (values: Record<string, string>) => {
			if (params.headers) Object.assign(params.headers, values);
		}
	} as unknown as LoadArgs);
	return result as LoadData;
}

async function expectLoadStatus(
	params: {
		year: number;
		identifier: string;
		availableYears?: number[];
		currentUser?: TestUser;
	},
	expectedStatus: number
): Promise<void> {
	try {
		await invokeLoad({
			year: params.year,
			identifier: params.identifier,
			availableYears: params.availableYears ?? [params.year],
			currentUser: params.currentUser
		});
		expect.unreachable(`Expected status ${expectedStatus} for ${params.year}/${params.identifier}`);
	} catch (err) {
		expect((err as { status?: number }).status).toBe(expectedStatus);
	}
}

async function expectServerWrappedStatus(year: string, expectedStatus: number): Promise<void> {
	try {
		await loadServerWrapped({
			params: { year },
			locals: {},
			setHeaders: () => {}
		} as unknown as ServerLoadArgs);
		expect.unreachable(`Expected server wrapped status ${expectedStatus} for ${year}`);
	} catch (err) {
		expect((err as { status?: number }).status).toBe(expectedStatus);
	}
}

describe('wrapped/[year=year] loader: year bounds', () => {
	it('returns 404 for years outside the supported range', async () => {
		await expectServerWrappedStatus('1999', 404);
		await expectServerWrappedStatus('2101', 404);
	});

	it('sets no-store cache control on user wrapped loads', async () => {
		const headers: Record<string, string> = {};

		try {
			await invokeLoad({
				year: 1999,
				identifier: '1',
				availableYears: [1999],
				headers
			});
			expect.unreachable('Expected user wrapped load to throw');
		} catch (err) {
			expect((err as { status?: number }).status).toBe(404);
		}

		expect(headers['cache-control']).toBe('no-store');
	});
});

describe('wrapped/[year=year]/u/[identifier] loader: cross-year token isolation', () => {
	const USER_ID = 42;

	beforeEach(async () => {
		await resetSharedTestDb();

		await seedUser(USER_ID, 100042, 200042);
		await setGlobalShareDefaults({
			defaultShareMode: ShareMode.PRIVATE_LINK,
			allowUserControl: false
		});
		await seedShareSettings({
			userId: USER_ID,
			year: ORIGIN_YEAR,
			mode: ShareMode.PRIVATE_LINK,
			token: CURRENT_YEAR_TOKEN
		});
	});

	it('yearIdentifiers maps the visited year to the presented token and omits other private-link years (no token leak, DF-04)', async () => {
		// Preseed another year's token — loader must not expose it to token visitors,
		// and (DF-04) must not fall back to the numeric id for a non-owner either.
		await seedShareSettings({
			userId: USER_ID,
			year: OTHER_YEAR,
			mode: ShareMode.PRIVATE_LINK,
			token: OTHER_YEAR_TOKEN_FOR_PRESEED
		});

		const data = await invokeLoad({
			year: ORIGIN_YEAR,
			identifier: CURRENT_YEAR_TOKEN,
			availableYears: [ORIGIN_YEAR, OTHER_YEAR]
		});

		expect(data.yearIdentifiers).toBeDefined();
		expect(data.yearIdentifiers?.[ORIGIN_YEAR]).toBe(CURRENT_YEAR_TOKEN);
		// DF-04: a non-owner viewer never gets the numeric id (it no longer resolves
		// for them) nor another year's private-link token — that year is omitted.
		expect(data.yearIdentifiers?.[OTHER_YEAR]).toBeUndefined();
	});

	it('does not mint a share token or slug for years other than the visited one', async () => {
		// Other year has NO share_settings row at all — the loader must not call any
		// minting path (getOrCreateShareSettings / ensurePublicSlug) for it.
		expect(await getStoredToken(USER_ID, OTHER_YEAR)).toBeNull();

		const data = await invokeLoad({
			year: ORIGIN_YEAR,
			identifier: CURRENT_YEAR_TOKEN,
			availableYears: [ORIGIN_YEAR, OTHER_YEAR]
		});

		expect(data.yearIdentifiers?.[OTHER_YEAR]).toBeUndefined();
		const rows = await db
			.select()
			.from(shareSettings)
			.where(and(eq(shareSettings.userId, USER_ID), eq(shareSettings.year, OTHER_YEAR)));
		expect(rows.length).toBe(0);
	});
});

/**
 * Regression tests for the shareToken payload gating fix (security audit Fix #1).
 *
 * The wrapped loader must only embed shareSettings.shareToken in the response
 * when BOTH:
 *   1. The viewer is the owner or an admin, AND
 *   2. The effective share mode is private-link.
 *
 * Anonymous viewers, authenticated non-owners, and even owners viewing in a
 * widened mode must receive shareToken: null in the payload.
 */
describe('wrapped/[year=year]/u/[identifier] loader: identifier validation (F-303)', () => {
	const USER_ID = 2;

	beforeEach(async () => {
		await resetSharedTestDb();

		await seedUser(USER_ID, 100002, 200002);
		await setGlobalShareDefaults({
			defaultShareMode: ShareMode.PUBLIC,
			allowUserControl: false
		});
	});

	async function expectStatus(
		identifier: string,
		expectedStatus: number,
		params: { availableYears?: number[] } = {}
	): Promise<void> {
		try {
			await invokeLoad({
				year: ORIGIN_YEAR,
				identifier,
				availableYears: params.availableYears ?? [ORIGIN_YEAR]
			});
			expect.unreachable(`Expected status ${expectedStatus} for identifier "${identifier}"`);
		} catch (err) {
			const status = (err as { status?: number }).status;
			expect(status).toBe(expectedStatus);
		}
	}

	it('returns 404 for a mangled UUID that parseInt would coerce to a numeric prefix', async () => {
		await expectStatus('2a155c58-MANGLED-0000-0000-000000000000', 404);
	});

	it('returns 404 for a numeric-prefixed alphanumeric identifier', async () => {
		await expectStatus('2abc', 404);
	});

	it('returns 404 for a whitespace identifier', async () => {
		await expectStatus(' ', 404);
		await expectStatus('   ', 404);
	});

	it('returns 404 for a negative numeric identifier', async () => {
		await expectStatus('-5', 404);
	});

	it('returns 404 for a private-link numeric URL without a token', async () => {
		await setGlobalShareDefaults({
			defaultShareMode: ShareMode.PRIVATE_LINK,
			allowUserControl: false
		});
		await seedShareSettings({
			userId: USER_ID,
			year: ORIGIN_YEAR,
			mode: ShareMode.PRIVATE_LINK,
			token: '550e8400-e29b-41d4-a716-446655441111'
		});

		await expectStatus(String(USER_ID), 404);
	});

	it('returns 404 for a well-formed but unknown private-link token', async () => {
		await setGlobalShareDefaults({
			defaultShareMode: ShareMode.PRIVATE_LINK,
			allowUserControl: false
		});

		await expectStatus('550e8400-e29b-41d4-a716-446655449999', 404);
	});

	it('returns 404 for an anonymous viewer on a valid numeric id in private-oauth mode (ISSUE-001 uniform-404)', async () => {
		// F-015/ISSUE-001 uniform-404 contract: a logged-out viewer hitting a valid
		// user's numeric wrapped URL while the effective mode is private-oauth must
		// get a 404 that is byte-identical to the non-existent-id 404, so existence
		// cannot be enumerated. (Reversed from the previous 403 "sign in" contract,
		// which leaked existence: private-oauth -> 403 but non-existent -> 404 told
		// an attacker which numeric ids were real.) Authenticated callers keep the
		// 403/404 split — see the contract block below.
		await setGlobalShareDefaults({
			defaultShareMode: ShareMode.PRIVATE_OAUTH,
			allowUserControl: false
		});

		await expectStatus(String(USER_ID), 404);
	});

	it('resolves a numeric identifier for the owner but 404s anonymous numeric (DF-04 owner/admin-only)', async () => {
		// Anonymous numeric is a uniform 404 — the integer id is owner/admin-only.
		await expectStatus(String(USER_ID), 404);

		// The owner viewing their own numeric URL still resolves.
		const data = await invokeLoad({
			year: ORIGIN_YEAR,
			identifier: String(USER_ID),
			availableYears: [ORIGIN_YEAR],
			currentUser: { id: USER_ID, plexId: 100002, username: `user-${USER_ID}`, isAdmin: false }
		});
		expect(data.userId).toBe(USER_ID);
	});

	it('resolves a public page for anyone via its opaque slug (DF-04)', async () => {
		const slug = await getShareIdentifier(USER_ID, ORIGIN_YEAR);
		expect(isValidSlugFormat(slug)).toBe(true);

		const data = await invokeLoad({
			year: ORIGIN_YEAR,
			identifier: slug,
			availableYears: [ORIGIN_YEAR]
		});
		expect(data.userId).toBe(USER_ID);
	});

	it('resolves a valid UUID share token to the matching user', async () => {
		const VALID_TOKEN = '550e8400-e29b-41d4-a716-446655441234';
		await setGlobalShareDefaults({
			defaultShareMode: ShareMode.PRIVATE_LINK,
			allowUserControl: false
		});
		await seedShareSettings({
			userId: USER_ID,
			year: ORIGIN_YEAR,
			mode: ShareMode.PRIVATE_LINK,
			token: VALID_TOKEN
		});

		const data = await invokeLoad({
			year: ORIGIN_YEAR,
			identifier: VALID_TOKEN,
			availableYears: [ORIGIN_YEAR]
		});
		expect(data.userId).toBe(USER_ID);
	});
});

describe('wrapped/[year=year]/u/[identifier] loader: shareToken payload gating', () => {
	const USER_ID = 42;
	const ADMIN_ID = 7;
	const OTHER_USER_ID = 99;
	const TOKEN = '770e8400-e29b-41d4-a716-446655440222';
	const YEAR = 2024;

	beforeEach(async () => {
		await resetSharedTestDb();

		await seedUser(USER_ID, 100042, 200042);
	});

	it('returns shareToken: null for an anonymous viewer accessing via token (private-link)', async () => {
		await setGlobalShareDefaults({
			defaultShareMode: ShareMode.PRIVATE_LINK,
			allowUserControl: false
		});
		await seedShareSettings({
			userId: USER_ID,
			year: YEAR,
			mode: ShareMode.PRIVATE_LINK,
			token: TOKEN
		});

		const data = await invokeLoad({
			year: YEAR,
			identifier: TOKEN,
			availableYears: [YEAR]
		});

		expect(data.shareSettings.shareToken).toBeNull();
	});

	it('returns shareToken: null for an authenticated non-owner member viewing private-oauth via its slug (DF-04)', async () => {
		await setGlobalShareDefaults({
			defaultShareMode: ShareMode.PRIVATE_OAUTH,
			allowUserControl: false
		});
		// Stash a token in the DB row even though the mode is private-oauth.
		// toShareSettings should already strip it; this guards against a future
		// regression that bypasses that helper.
		await seedShareSettings({
			userId: USER_ID,
			year: YEAR,
			mode: ShareMode.PRIVATE_OAUTH,
			token: TOKEN
		});

		await seedUser(OTHER_USER_ID, 100099, 200099);

		// DF-04: the non-owner member reaches the page through the opaque slug
		// (the numeric id no longer resolves for them), and still never receives
		// a copyable share token.
		const slug = await getShareIdentifier(USER_ID, YEAR);
		const data = await invokeLoad({
			year: YEAR,
			identifier: slug,
			availableYears: [YEAR],
			currentUser: {
				id: OTHER_USER_ID,
				plexId: 100099,
				username: `user-${OTHER_USER_ID}`,
				isAdmin: false
			}
		});

		expect(data.shareSettings.shareToken).toBeNull();
	});

	it('returns the real token for the owner when effectiveMode === private-link', async () => {
		await setGlobalShareDefaults({
			defaultShareMode: ShareMode.PRIVATE_LINK,
			allowUserControl: false
		});
		await seedShareSettings({
			userId: USER_ID,
			year: YEAR,
			mode: ShareMode.PRIVATE_LINK,
			token: TOKEN
		});

		const data = await invokeLoad({
			year: YEAR,
			identifier: TOKEN,
			availableYears: [YEAR],
			currentUser: {
				id: USER_ID,
				plexId: 100042,
				username: `user-${USER_ID}`,
				isAdmin: false
			}
		});

		expect(data.shareSettings.shareToken).toBe(TOKEN);
		expect(data.currentUrl).toBe(`/wrapped/${YEAR}/u/${TOKEN}`);
	});

	it('returns the real token for an admin viewer when effectiveMode === private-link', async () => {
		await setGlobalShareDefaults({
			defaultShareMode: ShareMode.PRIVATE_LINK,
			allowUserControl: false
		});
		await seedShareSettings({
			userId: USER_ID,
			year: YEAR,
			mode: ShareMode.PRIVATE_LINK,
			token: TOKEN
		});

		await seedUser(ADMIN_ID, 100007, 200007);

		const data = await invokeLoad({
			year: YEAR,
			identifier: TOKEN,
			availableYears: [YEAR],
			currentUser: {
				id: ADMIN_ID,
				plexId: 100007,
				username: `user-${ADMIN_ID}`,
				isAdmin: true
			}
		});

		expect(data.shareSettings.shareToken).toBe(TOKEN);
		expect(data.currentUrl).toBe(`/wrapped/${YEAR}/u/${TOKEN}`);
	});

	it('returns 404 when an owner accesses a private-link wrapped via numeric URL', async () => {
		await setGlobalShareDefaults({
			defaultShareMode: ShareMode.PRIVATE_LINK,
			allowUserControl: false
		});
		await seedShareSettings({
			userId: USER_ID,
			year: YEAR,
			mode: ShareMode.PRIVATE_LINK,
			token: TOKEN
		});

		try {
			await invokeLoad({
				year: YEAR,
				identifier: String(USER_ID),
				availableYears: [YEAR],
				currentUser: {
					id: USER_ID,
					plexId: 100042,
					username: `user-${USER_ID}`,
					isAdmin: false
				}
			});
			expect.unreachable('Expected numeric private-link owner URL to be rejected');
		} catch (err) {
			expect((err as { status?: number }).status).toBe(404);
		}
	});

	it('returns 404 when an admin accesses a private-link wrapped via numeric URL', async () => {
		await setGlobalShareDefaults({
			defaultShareMode: ShareMode.PRIVATE_LINK,
			allowUserControl: false
		});
		await seedShareSettings({
			userId: USER_ID,
			year: YEAR,
			mode: ShareMode.PRIVATE_LINK,
			token: TOKEN
		});
		await seedUser(ADMIN_ID, 100008, 200008);

		try {
			await invokeLoad({
				year: YEAR,
				identifier: String(USER_ID),
				availableYears: [YEAR],
				currentUser: {
					id: ADMIN_ID,
					plexId: 100008,
					username: `user-${ADMIN_ID}`,
					isAdmin: true
				}
			});
			expect.unreachable('Expected numeric private-link admin URL to be rejected');
		} catch (err) {
			expect((err as { status?: number }).status).toBe(404);
		}
	});

	it('exposes the canonical token to the owner even when the floor raises effectiveMode above private-link', async () => {
		// F-302: when the global floor (private-oauth) raises the effective mode
		// above the stored private-link, the owner must still see the canonical
		// share token so the share modal stays stable across reloads. Anonymous
		// viewers and non-owners are still gated (covered by tests above).
		await seedShareSettings({
			userId: USER_ID,
			year: YEAR,
			mode: ShareMode.PRIVATE_LINK,
			token: TOKEN
		});
		await setGlobalShareDefaults({
			defaultShareMode: ShareMode.PRIVATE_OAUTH,
			allowUserControl: false
		});

		const data = await invokeLoad({
			year: YEAR,
			identifier: String(USER_ID),
			availableYears: [YEAR],
			currentUser: {
				id: USER_ID,
				plexId: 100042,
				username: `user-${USER_ID}`,
				isAdmin: false
			}
		});

		expect(data.shareSettings.shareToken).toBe(TOKEN);
	});
});

/**
 * Regression test for the resolveUserIdFromIdentifier currentUser-forwarding fix.
 *
 * When a signed-in owner/admin invokes updateShareMode or regenerateToken on a
 * token URL while the global floor has raised the effective mode above
 * private-link (e.g. private-oauth), the helper used to call
 * `checkTokenAccess(identifier)` (bare string), which omitted currentUser and
 * triggered the floor branch's `if (!currentUser)` guard, causing the action
 * to fail with "Invalid user identifier". The fix forwards locals.user.
 */
describe('wrapped/[year=year]/u/[identifier] actions: token URL + floor-elevated mode', () => {
	const USER_ID = 42;
	const TOKEN = '880e8400-e29b-41d4-a716-446655440333';
	const YEAR = 2024;

	type UpdateShareModeAction = NonNullable<typeof actions.updateShareMode>;

	beforeEach(async () => {
		await resetSharedTestDb();

		await seedUser(USER_ID, 100042, 200042);
		await seedShareSettings({
			userId: USER_ID,
			year: YEAR,
			mode: ShareMode.PRIVATE_LINK,
			token: TOKEN
		});
		await setGlobalShareDefaults({
			defaultShareMode: ShareMode.PRIVATE_OAUTH,
			allowUserControl: true
		});
	});

	async function invokeUpdateShareMode(params: {
		identifier: string;
		mode: (typeof ShareMode)[keyof typeof ShareMode];
		currentUser?: TestUser;
	}) {
		const formData = new FormData();
		formData.set('mode', params.mode);
		const request = new Request('https://obzorarr.example/wrapped', {
			method: 'POST',
			body: formData
		});
		const updateShareMode = actions.updateShareMode as UpdateShareModeAction;
		return updateShareMode({
			request,
			params: { year: String(YEAR), identifier: params.identifier },
			locals: params.currentUser ? { user: params.currentUser } : {}
		} as unknown as Parameters<UpdateShareModeAction>[0]);
	}

	it('owner accessing via token URL with floor-elevated mode resolves successfully (does not 400)', async () => {
		const result = await invokeUpdateShareMode({
			identifier: TOKEN,
			mode: ShareMode.PRIVATE_LINK,
			currentUser: {
				id: USER_ID,
				plexId: 100042,
				username: `user-${USER_ID}`,
				isAdmin: false
			}
		});

		// Without the fix this would be: { status: 400, data: { error: 'Invalid user identifier' } }
		const status = (result as { status?: number }).status;
		expect(status).not.toBe(400);
	});

	it('rejects below-floor share modes for owners and returns server truth', async () => {
		const result = await invokeUpdateShareMode({
			identifier: TOKEN,
			mode: ShareMode.PUBLIC,
			currentUser: {
				id: USER_ID,
				plexId: 100042,
				username: `user-${USER_ID}`,
				isAdmin: false
			}
		});

		expect(result).toMatchObject({
			status: 403,
			data: {
				currentMode: ShareMode.PRIVATE_LINK,
				globalFloor: ShareMode.PRIVATE_OAUTH,
				shareSettings: {
					mode: ShareMode.PRIVATE_LINK,
					storedMode: ShareMode.PRIVATE_LINK,
					shareToken: TOKEN
				}
			}
		});
	});

	it('rejects below-floor share modes for admins and returns server truth', async () => {
		const ADMIN_ID = 7;
		await seedUser(ADMIN_ID, 100007, 200007);

		const result = await invokeUpdateShareMode({
			identifier: TOKEN,
			mode: ShareMode.PUBLIC,
			currentUser: {
				id: ADMIN_ID,
				plexId: 100007,
				username: `user-${ADMIN_ID}`,
				isAdmin: true
			}
		});

		expect(result).toMatchObject({
			status: 403,
			data: {
				currentMode: ShareMode.PRIVATE_LINK,
				globalFloor: ShareMode.PRIVATE_OAUTH,
				shareSettings: {
					mode: ShareMode.PRIVATE_LINK,
					storedMode: ShareMode.PRIVATE_LINK,
					canUserControl: true
				}
			}
		});
	});
});

describe('wrapped/[year=year]/u/[identifier] actions: token regeneration', () => {
	const USER_ID = 77;
	const YEAR = 2024;
	const OLD_TOKEN = '990e8400-e29b-41d4-a716-446655440444';
	type RegenerateTokenAction = NonNullable<typeof actions.regenerateToken>;

	beforeEach(async () => {
		await resetSharedTestDb();

		await seedUser(USER_ID, 100077, 200077);
		await seedShareSettings({
			userId: USER_ID,
			year: YEAR,
			mode: ShareMode.PRIVATE_LINK,
			token: OLD_TOKEN
		});
		await db
			.update(shareSettings)
			.set({ canUserControl: true })
			.where(and(eq(shareSettings.userId, USER_ID), eq(shareSettings.year, YEAR)));
		await setGlobalShareDefaults({
			defaultShareMode: ShareMode.PRIVATE_LINK,
			allowUserControl: true
		});
	});

	async function invokeRegenerate() {
		const regenerateToken = actions.regenerateToken as RegenerateTokenAction;
		return regenerateToken({
			params: { year: String(YEAR), identifier: String(USER_ID) },
			locals: {
				user: {
					id: USER_ID,
					plexId: 100077,
					username: `user-${USER_ID}`,
					isAdmin: false
				}
			}
		} as unknown as Parameters<RegenerateTokenAction>[0]);
	}

	it('invalidates old private-link tokens after regeneration', async () => {
		const result = await invokeRegenerate();
		const newToken = (result as { shareToken?: string }).shareToken;

		expect(result).toMatchObject({ success: true });
		expect(newToken).toBeDefined();
		expect(newToken).not.toBe(OLD_TOKEN);

		await expectLoadStatus({ year: YEAR, identifier: OLD_TOKEN }, 404);

		const data = await invokeLoad({
			year: YEAR,
			identifier: newToken ?? '',
			availableYears: [YEAR]
		});
		expect(data.userId).toBe(USER_ID);
	});
});

/**
 * DF-04 / ISSUE-004 contract-lock (REVISED for Option (a)): the sequential integer
 * id resolves ONLY for the owner/admin. Every other caller — anonymous OR an
 * authenticated non-owner member — gets the byte-identical anti-enumeration 404,
 * closing both anonymous and member-to-member walking. Legitimate non-owner access
 * flows through an OPAQUE SLUG (public / private-oauth, gated by mode at access
 * time) or the private-link UUID token. This freezes the post-Option-(a) contract
 * so a future change can't silently reopen integer enumeration.
 * Supersedes the prior "enumerable integer id by-design" lock.
 */
describe('wrapped/[year=year]/u/[identifier] loader: DF-04 slug + numeric-owner-only contract-lock', () => {
	const MEMBER_ID = 2;
	const UNKNOWN_ID = 999;
	const YEAR = 2024;

	beforeEach(async () => {
		await resetSharedTestDb();

		await setGlobalShareDefaults({
			defaultShareMode: ShareMode.PRIVATE_OAUTH,
			allowUserControl: false
		});
	});

	it('returns 404 for an UNKNOWN numeric id and mints NO share_settings row (anti-enumeration, no orphan)', async () => {
		await expectLoadStatus(
			{ year: YEAR, identifier: String(UNKNOWN_ID), currentUser: undefined },
			404
		);

		const rows = await db.select().from(shareSettings).where(eq(shareSettings.userId, UNKNOWN_ID));
		expect(rows.length).toBe(0);
	});

	it('returns 404 when a non-owner member views a private-oauth page via the numeric id (member walking closed)', async () => {
		const OWNER_ID = 5;
		await seedUser(OWNER_ID, 100005, 200005);
		await seedUser(MEMBER_ID, 100002, 200002);
		await seedShareSettings({
			userId: OWNER_ID,
			year: YEAR,
			mode: ShareMode.PRIVATE_OAUTH,
			token: null
		});

		await expectLoadStatus(
			{
				year: YEAR,
				identifier: String(OWNER_ID),
				currentUser: {
					id: MEMBER_ID,
					plexId: 100002,
					username: `user-${MEMBER_ID}`,
					isAdmin: false
				}
			},
			404
		);
	});

	it('allows a non-owner member to view a private-oauth page via its opaque slug (200, no token)', async () => {
		const OWNER_ID = 5;
		await seedUser(OWNER_ID, 100005, 200005);
		await seedUser(MEMBER_ID, 100002, 200002);
		await seedShareSettings({
			userId: OWNER_ID,
			year: YEAR,
			mode: ShareMode.PRIVATE_OAUTH,
			token: null
		});

		const slug = await getShareIdentifier(OWNER_ID, YEAR);
		expect(isValidSlugFormat(slug)).toBe(true);

		const data = await invokeLoad({
			year: YEAR,
			identifier: slug,
			availableYears: [YEAR],
			currentUser: {
				id: MEMBER_ID,
				plexId: 100002,
				username: `user-${MEMBER_ID}`,
				isAdmin: false
			}
		});

		expect(data.userId).toBe(OWNER_ID);
		expect(data.shareSettings.shareToken).toBeNull();
	});

	it('returns 404 when an ANONYMOUS viewer tries a private-oauth slug (auth still enforced)', async () => {
		const OWNER_ID = 5;
		await seedUser(OWNER_ID, 100005, 200005);
		await seedShareSettings({
			userId: OWNER_ID,
			year: YEAR,
			mode: ShareMode.PRIVATE_OAUTH,
			token: null
		});

		const slug = await getShareIdentifier(OWNER_ID, YEAR);
		await expectLoadStatus({ year: YEAR, identifier: slug, currentUser: undefined }, 404);
	});

	it('getOwnerWrappedHref emits an opaque slug URL for private-oauth and a token URL only for private-link', async () => {
		const OWNER_ID = 5;
		await seedUser(OWNER_ID, 100005, 200005);

		// private-oauth: opaque slug URL (NOT the enumerable integer), no token.
		await seedShareSettings({
			userId: OWNER_ID,
			year: YEAR,
			mode: ShareMode.PRIVATE_OAUTH,
			token: null
		});
		const oauthHref = await getOwnerWrappedHref(OWNER_ID, YEAR);
		const oauthSlug = oauthHref.replace(`/wrapped/${YEAR}/u/`, '');
		expect(isValidSlugFormat(oauthSlug)).toBe(true);
		expect(oauthHref).not.toBe(`/wrapped/${YEAR}/u/${OWNER_ID}`);
		expect(await getStoredToken(OWNER_ID, YEAR)).toBeNull();

		// Flip to private-link under a PUBLIC floor so the effective mode stays
		// private-link; the token URL is emitted only then.
		await setGlobalShareDefaults({
			defaultShareMode: ShareMode.PUBLIC,
			allowUserControl: false
		});
		const LINK_TOKEN = '550e8400-e29b-41d4-a716-446655442222';
		await db
			.update(shareSettings)
			.set({
				mode: ShareMode.PRIVATE_LINK,
				modeSource: ShareModeSource.EXPLICIT,
				shareToken: LINK_TOKEN
			})
			.where(and(eq(shareSettings.userId, OWNER_ID), eq(shareSettings.year, YEAR)));
		const linkHref = await getOwnerWrappedHref(OWNER_ID, YEAR);
		expect(linkHref).toBe(`/wrapped/${YEAR}/u/${LINK_TOKEN}`);
	});
});

/**
 * ISSUE-001 uniform-404 anti-enumeration contract.
 *
 * For an ANONYMOUS caller on the numeric identifier path, all three "cannot
 * view" outcomes — existing-private-oauth, existing-private-link-without-token,
 * and non-existent id — must be byte-identical (same status AND body) so the
 * numeric id space cannot be enumerated. A PUBLIC personal wrapped still loads
 * for anon, and a valid share-link token still resolves. See the F-015 note in
 * wrapped/[year=year]/u/[identifier]/+page.server.ts.
 */
describe('wrapped/[year=year]/u/[identifier] loader: ISSUE-001 uniform-404 anti-enumeration contract', () => {
	const EXISTING_ID = 2;
	const NON_EXISTENT_ID = 4242;
	const YEAR = 2024;
	const PRIVATE_LINK_TOKEN = CURRENT_YEAR_TOKEN;
	const VALID_LINK_TOKEN = OTHER_YEAR_TOKEN_FOR_PRESEED;

	beforeEach(async () => {
		await resetSharedTestDb();
		await seedUser(EXISTING_ID, 100002, 200002);
	});

	async function captureAnonFailure(
		identifier: string
	): Promise<{ status?: number; message?: string }> {
		try {
			await invokeLoad({ year: YEAR, identifier, availableYears: [YEAR] });
			expect.unreachable(`Expected anon load to fail for "${identifier}"`);
			return {};
		} catch (err) {
			const e = err as { status?: number; body?: { message?: string } };
			return { status: e.status, message: e.body?.message };
		}
	}

	it('returns a byte-identical 404 for anon private-oauth, anon private-link-no-token, and non-existent id', async () => {
		await setGlobalShareDefaults({
			defaultShareMode: ShareMode.PRIVATE_OAUTH,
			allowUserControl: false
		});
		const privateOauth = await captureAnonFailure(String(EXISTING_ID));

		await setGlobalShareDefaults({
			defaultShareMode: ShareMode.PRIVATE_LINK,
			allowUserControl: false
		});
		await seedShareSettings({
			userId: EXISTING_ID,
			year: YEAR,
			mode: ShareMode.PRIVATE_LINK,
			token: PRIVATE_LINK_TOKEN
		});
		const privateLinkNoToken = await captureAnonFailure(String(EXISTING_ID));

		const nonExistent = await captureAnonFailure(String(NON_EXISTENT_ID));

		expect(privateOauth.status).toBe(404);
		expect(privateLinkNoToken.status).toBe(404);
		expect(nonExistent.status).toBe(404);
		// Byte-identical body across all three so existence cannot be inferred.
		expect(privateOauth.message).toBe(nonExistent.message);
		expect(privateLinkNoToken.message).toBe(nonExistent.message);
		expect(nonExistent.message).toBe("We couldn't find a Wrapped page for that link.");
	});

	it('does NOT create a share_settings row for a non-existent id (no orphan)', async () => {
		await setGlobalShareDefaults({
			defaultShareMode: ShareMode.PRIVATE_OAUTH,
			allowUserControl: false
		});
		await captureAnonFailure(String(NON_EXISTENT_ID));
		const rows = await db
			.select()
			.from(shareSettings)
			.where(eq(shareSettings.userId, NON_EXISTENT_ID));
		expect(rows.length).toBe(0);
	});

	it('404s anonymous numeric on a PUBLIC page but resolves it via the opaque slug (DF-04)', async () => {
		await setGlobalShareDefaults({
			defaultShareMode: ShareMode.PUBLIC,
			allowUserControl: false
		});
		// DF-04: the integer id is owner/admin-only, so anonymous numeric — even on
		// a public page — is the uniform anti-enumeration 404.
		const anonNumeric = await captureAnonFailure(String(EXISTING_ID));
		expect(anonNumeric.status).toBe(404);
		expect(anonNumeric.message).toBe("We couldn't find a Wrapped page for that link.");

		// The same public page resolves for an anonymous viewer via its opaque slug.
		const slug = await getShareIdentifier(EXISTING_ID, YEAR);
		const data = await invokeLoad({
			year: YEAR,
			identifier: slug,
			availableYears: [YEAR]
		});
		expect(data.userId).toBe(EXISTING_ID);
	});

	it('still resolves a valid share-link token for an anonymous viewer (200)', async () => {
		await setGlobalShareDefaults({
			defaultShareMode: ShareMode.PRIVATE_LINK,
			allowUserControl: false
		});
		await seedShareSettings({
			userId: EXISTING_ID,
			year: YEAR,
			mode: ShareMode.PRIVATE_LINK,
			token: VALID_LINK_TOKEN
		});
		const data = await invokeLoad({
			year: YEAR,
			identifier: VALID_LINK_TOKEN,
			availableYears: [YEAR]
		});
		expect(data.userId).toBe(EXISTING_ID);
	});

	// DF-018: a real-but-private (members-only / private-oauth) identifier and a
	// non-numeric garbage identifier must return byte-identical status + body for
	// an anonymous caller. Complements the numeric-garbage parity test above by
	// covering the malformed-identifier path (isPureNumericId === false), so the
	// uniform-404 contract holds whether the probe is a plausible numeric id or
	// junk. Do NOT add a members-only "sign in" prompt that fires only for real
	// member ids — that would reintroduce the enumeration oracle this guards.
	it('returns byte-identical 404 for a real members-only id vs a garbage identifier (DF-018)', async () => {
		await setGlobalShareDefaults({
			defaultShareMode: ShareMode.PRIVATE_OAUTH,
			allowUserControl: false
		});

		const realMembersOnly = await captureAnonFailure(String(EXISTING_ID));
		const garbage = await captureAnonFailure('definitely-not-a-real-identifier');

		expect(realMembersOnly.status).toBe(404);
		expect(garbage.status).toBe(404);
		// Body PARITY: no existence signal distinguishes a real private id from junk.
		expect(realMembersOnly.message).toBe(garbage.message);
		expect(garbage.message).toBe("We couldn't find a Wrapped page for that link.");
	});
});
