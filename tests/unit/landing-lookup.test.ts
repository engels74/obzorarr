import { afterAll, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { isRedirect } from '@sveltejs/kit';
import { db } from '$lib/server/db/client';
import { appSettings, plexAccounts, shareSettings, users } from '$lib/server/db/schema';
import { logger } from '$lib/server/logging';
import { setGlobalShareDefaults } from '$lib/server/sharing/service';
import { ShareMode, ShareModeSource } from '$lib/server/sharing/types';
import type { LiveSyncResult } from '$lib/server/sync/live-sync';
import * as liveSync from '$lib/server/sync/live-sync';

let liveSyncResult: LiveSyncResult = {
	triggered: false,
	syncInProgress: false,
	reason: 'disabled'
};
let liveSyncCalls: string[] = [];

const triggerLiveSyncSpy = spyOn(liveSync, 'triggerLiveSyncIfNeeded');
triggerLiveSyncSpy.mockImplementation(async (source: string) => {
	liveSyncCalls.push(source);
	return liveSyncResult;
});

const { actions } = await import('../../src/routes/+page.server');
type LookupAction = NonNullable<typeof actions.lookupUser>;

const USER_ID = 42;
const YEAR = new Date().getFullYear();

interface CookieCall {
	name: string;
	value: string;
	options?: unknown;
}

interface TestCookies {
	sets: CookieCall[];
	set: (name: string, value: string, options?: unknown) => void;
}

async function seedUser(mode?: (typeof ShareMode)[keyof typeof ShareMode]): Promise<void> {
	await db.insert(plexAccounts).values({
		accountId: 123,
		plexId: 456,
		username: 'alice',
		isOwner: false
	});
	await db.insert(users).values({
		id: USER_ID,
		plexId: 456,
		accountId: 123,
		username: 'alice',
		isAdmin: false
	});

	if (mode) {
		await db.insert(shareSettings).values({
			userId: USER_ID,
			year: YEAR,
			mode,
			modeSource: ShareModeSource.EXPLICIT,
			shareToken: mode === ShareMode.PRIVATE_LINK ? '550e8400-e29b-41d4-a716-446655440000' : null,
			canUserControl: false
		});
	}
}

function createCookies(): TestCookies {
	return {
		sets: [],
		set(name: string, value: string, options?: unknown) {
			this.sets.push({ name, value, options });
		}
	};
}

async function invokeLookup(username: string, ip: string, cookies: TestCookies = createCookies()) {
	const formData = new FormData();
	formData.set('username', username);
	const request = new Request('https://obzorarr.example/', {
		method: 'POST',
		body: formData
	});

	const lookupUser = actions.lookupUser as LookupAction;
	return lookupUser({
		request,
		cookies,
		getClientAddress: () => ip,
		setHeaders: () => {}
	} as unknown as Parameters<LookupAction>[0]);
}

describe('landing username lookup', () => {
	afterAll(() => {
		triggerLiveSyncSpy.mockRestore();
	});

	beforeEach(async () => {
		await db.delete(shareSettings);
		await db.delete(appSettings);
		await db.delete(users);
		await db.delete(plexAccounts);
		liveSyncCalls = [];
		liveSyncResult = { triggered: false, syncInProgress: false, reason: 'disabled' };
		triggerLiveSyncSpy.mockImplementation(async (source: string) => {
			liveSyncCalls.push(source);
			return liveSyncResult;
		});
	});

	it('redirects anonymous lookup only for effectively public wrapped pages', async () => {
		await setGlobalShareDefaults({ defaultShareMode: ShareMode.PUBLIC, allowUserControl: false });
		await seedUser();

		try {
			await invokeLookup('alice', '198.51.100.1');
			throw new Error('Expected redirect');
		} catch (error) {
			expect(isRedirect(error)).toBe(true);
			if (!isRedirect(error)) throw error;
			expect(error.location).toBe(`/wrapped/${YEAR}/u/${USER_ID}`);
		}
	});

	it('sets a short-lived wrapped marker when public lookup starts live sync', async () => {
		liveSyncResult = {
			triggered: true,
			syncInProgress: true
		};
		const cookies = createCookies();
		await setGlobalShareDefaults({ defaultShareMode: ShareMode.PUBLIC, allowUserControl: false });
		await seedUser();

		try {
			await invokeLookup('alice', '198.51.100.5', cookies);
			throw new Error('Expected redirect');
		} catch (error) {
			expect(isRedirect(error)).toBe(true);
			if (!isRedirect(error)) throw error;
		}

		expect(liveSyncCalls).toEqual(['landing-page-lookup']);
		expect(cookies.sets).toEqual([
			{
				name: 'lookup_live_sync',
				value: '1',
				options: {
					path: '/wrapped',
					httpOnly: true,
					sameSite: 'lax',
					maxAge: 60
				}
			}
		]);
	});

	it('logs trigger startup failures without setting the lookup marker', async () => {
		liveSyncResult = {
			triggered: false,
			syncInProgress: false,
			reason: 'error'
		};
		const warnSpy = spyOn(logger, 'warn').mockImplementation(() => {});
		const cookies = createCookies();
		await setGlobalShareDefaults({ defaultShareMode: ShareMode.PUBLIC, allowUserControl: false });
		await seedUser();

		try {
			await invokeLookup('alice', '198.51.100.6', cookies);
			throw new Error('Expected redirect');
		} catch (error) {
			expect(isRedirect(error)).toBe(true);
			if (!isRedirect(error)) throw error;
			expect(warnSpy).toHaveBeenCalledWith(
				'Lookup-triggered live sync failed to start',
				'LandingLookup'
			);
			expect(cookies.sets).toHaveLength(0);
		} finally {
			warnSpy.mockRestore();
		}
	});

	it('returns the same generic response for private users and missing users', async () => {
		await setGlobalShareDefaults({ defaultShareMode: ShareMode.PUBLIC, allowUserControl: false });
		await seedUser(ShareMode.PRIVATE_OAUTH);

		const privateResult = await invokeLookup('alice', '198.51.100.2');
		const missingResult = await invokeLookup('nobody', '198.51.100.3');

		expect(privateResult).toEqual({
			status: 404,
			data: {
				error: 'No public Wrapped found for that username.',
				username: 'alice',
				requiresAuth: true
			}
		});
		expect(missingResult).toEqual({
			status: 404,
			data: {
				error: 'No public Wrapped found for that username.',
				username: 'nobody',
				requiresAuth: true
			}
		});
	});

	it('does not create local users from anonymous lookup', async () => {
		await setGlobalShareDefaults({ defaultShareMode: ShareMode.PUBLIC, allowUserControl: false });
		await db.insert(plexAccounts).values({
			accountId: 777,
			plexId: 888,
			username: 'synced-only',
			isOwner: false
		});

		await invokeLookup('synced-only', '198.51.100.4');

		const createdUsers = await db.select().from(users);
		expect(createdUsers).toHaveLength(0);
	});
});
