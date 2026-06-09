import { beforeEach, describe, expect, it } from 'bun:test';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { shareSettings, users } from '$lib/server/db/schema';
import {
	ensurePublicSlug,
	generatePublicSlug,
	getExistingShareIdentifier,
	getShareIdentifier,
	isPureNumericId,
	isValidSlugFormat,
	isValidTokenFormat,
	resolveSlug,
	setGlobalShareDefaults
} from '$lib/server/sharing/service';
import { ShareMode, ShareModeSource, ShareSettingsNotFoundError } from '$lib/server/sharing/types';
import { resetSharedTestDb } from '../../helpers/db';

const YEAR = 2024;
const USER_ID = 7;

async function seedRow(
	mode: (typeof ShareMode)[keyof typeof ShareMode],
	token: string | null = null
) {
	await db
		.insert(users)
		.values({ id: USER_ID, plexId: 100007, accountId: 200007, username: 'alice' });
	await db.insert(shareSettings).values({
		userId: USER_ID,
		year: YEAR,
		mode,
		modeSource: ShareModeSource.EXPLICIT,
		shareToken: token,
		canUserControl: false
	});
}

describe('DF-04 public slug: generator + format invariants', () => {
	it('generatePublicSlug is base62, fixed-length, and disjoint from the token/numeric id spaces', () => {
		for (let i = 0; i < 200; i++) {
			const slug = generatePublicSlug();
			expect(isValidSlugFormat(slug)).toBe(true);
			// Must never be mistaken for a UUID token or a numeric id, so the
			// resolver (token -> numeric -> slug) can never misroute it.
			expect(isValidTokenFormat(slug)).toBe(false);
			expect(isPureNumericId(slug)).toBe(false);
		}
	});

	it('produces distinct slugs across calls', () => {
		const slugs = new Set(Array.from({ length: 100 }, () => generatePublicSlug()));
		expect(slugs.size).toBe(100);
	});

	it('isValidSlugFormat rejects UUIDs, numeric ids, and wrong-length strings', () => {
		expect(isValidSlugFormat('550e8400-e29b-41d4-a716-446655440000')).toBe(false);
		expect(isValidSlugFormat('12345')).toBe(false);
		expect(isValidSlugFormat('short')).toBe(false);
		expect(isValidSlugFormat('not a slug with spaces!!')).toBe(false);
	});
});

describe('DF-04 public slug: minting + resolution', () => {
	beforeEach(async () => {
		await resetSharedTestDb();
		await setGlobalShareDefaults({ defaultShareMode: ShareMode.PUBLIC, allowUserControl: false });
	});

	it('ensurePublicSlug mints once and is idempotent (round-trips through resolveSlug)', async () => {
		await seedRow(ShareMode.PUBLIC);

		const slug = await ensurePublicSlug(USER_ID, YEAR);
		expect(isValidSlugFormat(slug)).toBe(true);

		const again = await ensurePublicSlug(USER_ID, YEAR);
		expect(again).toBe(slug);

		const resolved = await resolveSlug(slug);
		expect(resolved).toEqual({ userId: USER_ID, year: YEAR });
	});

	it('ensurePublicSlug throws when there is no share_settings row', async () => {
		await expect(ensurePublicSlug(USER_ID, YEAR)).rejects.toBeInstanceOf(
			ShareSettingsNotFoundError
		);
	});

	it('resolveSlug returns null for malformed and unknown slugs', async () => {
		expect(await resolveSlug('550e8400-e29b-41d4-a716-446655440000')).toBeNull();
		expect(await resolveSlug('12345')).toBeNull();
		expect(await resolveSlug(generatePublicSlug())).toBeNull();
	});

	it('getShareIdentifier returns a slug for public/oauth and the token for private-link', async () => {
		await seedRow(ShareMode.PUBLIC);
		const publicId = await getShareIdentifier(USER_ID, YEAR);
		expect(isValidSlugFormat(publicId)).toBe(true);

		await db
			.update(shareSettings)
			.set({ mode: ShareMode.PRIVATE_OAUTH })
			.where(and(eq(shareSettings.userId, USER_ID), eq(shareSettings.year, YEAR)));
		const oauthId = await getShareIdentifier(USER_ID, YEAR);
		expect(isValidSlugFormat(oauthId)).toBe(true);
		// Same row -> same opaque slug regardless of public vs oauth.
		expect(oauthId).toBe(publicId);

		const TOKEN = '550e8400-e29b-41d4-a716-446655441234'; // gitleaks:allow -- fake fixture UUID, not a secret
		await db
			.update(shareSettings)
			.set({ mode: ShareMode.PRIVATE_LINK, shareToken: TOKEN })
			.where(and(eq(shareSettings.userId, USER_ID), eq(shareSettings.year, YEAR)));
		const linkId = await getShareIdentifier(USER_ID, YEAR);
		expect(linkId).toBe(TOKEN);
	});
});

describe('DF-04 getExistingShareIdentifier: read-only, no mint, no token leak', () => {
	beforeEach(async () => {
		await resetSharedTestDb();
		await setGlobalShareDefaults({ defaultShareMode: ShareMode.PUBLIC, allowUserControl: false });
	});

	it('returns null and mints nothing when no row exists', async () => {
		expect(await getExistingShareIdentifier(USER_ID, YEAR)).toBeNull();
		const rows = await db.select().from(shareSettings).where(eq(shareSettings.userId, USER_ID));
		expect(rows.length).toBe(0);
	});

	it('returns an existing public slug without minting a new one', async () => {
		await seedRow(ShareMode.PUBLIC);
		const slug = await ensurePublicSlug(USER_ID, YEAR);
		expect(await getExistingShareIdentifier(USER_ID, YEAR)).toBe(slug);
	});

	it('returns null (no mint) when a public row has no slug yet', async () => {
		await seedRow(ShareMode.PUBLIC);
		expect(await getExistingShareIdentifier(USER_ID, YEAR)).toBeNull();
		const row = await db
			.select({ publicSlug: shareSettings.publicSlug })
			.from(shareSettings)
			.where(and(eq(shareSettings.userId, USER_ID), eq(shareSettings.year, YEAR)))
			.limit(1);
		expect(row[0]?.publicSlug).toBeNull();
	});

	it('never leaks a private-link year token (returns null even when a token exists)', async () => {
		await seedRow(ShareMode.PRIVATE_LINK, '550e8400-e29b-41d4-a716-446655449999');
		expect(await getExistingShareIdentifier(USER_ID, YEAR)).toBeNull();
	});
});
