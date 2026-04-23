import { beforeEach, describe, expect, it } from 'bun:test';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import {
	appSettings,
	cachedStats,
	playHistory,
	shareSettings,
	slideConfig,
	users
} from '$lib/server/db/schema';
import { setGlobalShareDefaults } from '$lib/server/sharing/service';
import { ShareMode, ShareModeSource } from '$lib/server/sharing/types';
import { load } from '../../../src/routes/wrapped/[year]/u/[identifier]/+page.server';

type LoadArgs = Parameters<typeof load>[0];

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

async function invokeLoad(params: {
	year: number;
	identifier: string;
	availableYears: number[];
}): Promise<LoadData> {
	const result = await load({
		params: { year: String(params.year), identifier: params.identifier },
		locals: {},
		parent: async () => ({ availableYears: params.availableYears })
	} as unknown as LoadArgs);
	return result as LoadData;
}

describe('wrapped/[year]/u/[identifier] loader: cross-year token isolation', () => {
	const USER_ID = 42;

	beforeEach(async () => {
		await db.delete(shareSettings);
		await db.delete(appSettings);
		await db.delete(users);
		await db.delete(cachedStats);
		await db.delete(playHistory);
		await db.delete(slideConfig);

		await seedUser(USER_ID, 100042, 200042);
		await setGlobalShareDefaults({
			defaultShareMode: ShareMode.PRIVATE_LINK,
			allowUserControl: false
		});
		// Main year must already have the token the visitor is presenting.
		await seedShareSettings({
			userId: USER_ID,
			year: ORIGIN_YEAR,
			mode: ShareMode.PRIVATE_LINK,
			token: CURRENT_YEAR_TOKEN
		});
	});

	it('yearIdentifiers maps the visited year to the presented token and other years to numeric userId', async () => {
		// Preseed another year's token — loader must not expose it to token visitors.
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
		// Critical property: other year's identifier is the numeric userId, NOT its token.
		expect(data.yearIdentifiers?.[OTHER_YEAR]).toBe(USER_ID);
		expect(data.yearIdentifiers?.[OTHER_YEAR]).not.toBe(OTHER_YEAR_TOKEN_FOR_PRESEED);
	});

	it('does not mint a share token for years other than the visited one', async () => {
		// Other year has NO share_settings row at all — the old code path would
		// have called getOrCreateShareSettings which mints a token for PRIVATE_LINK.
		expect(await getStoredToken(USER_ID, OTHER_YEAR)).toBeNull();

		const data = await invokeLoad({
			year: ORIGIN_YEAR,
			identifier: CURRENT_YEAR_TOKEN,
			availableYears: [ORIGIN_YEAR, OTHER_YEAR]
		});

		expect(data.yearIdentifiers?.[OTHER_YEAR]).toBe(USER_ID);
		// No share_settings row was created for OTHER_YEAR as a side effect.
		const rows = await db
			.select()
			.from(shareSettings)
			.where(and(eq(shareSettings.userId, USER_ID), eq(shareSettings.year, OTHER_YEAR)));
		expect(rows.length).toBe(0);
	});
});
