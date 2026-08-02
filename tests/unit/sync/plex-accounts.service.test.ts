import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { eq } from 'drizzle-orm';
import * as settingsService from '$lib/server/admin/settings.service';
import * as plexOAuth from '$lib/server/auth/plex-oauth';
import { db } from '$lib/server/db/client';
import { appSettings, plexAccounts, users } from '$lib/server/db/schema';
import {
	findUserByUsername,
	PLEX_ACCOUNT_FRESHNESS_MS,
	runPlexAccountReconciliation
} from '$lib/server/plex/account-reconciliation';
import { fetchCurrentSharedAccounts } from '$lib/server/plex/accounts';
import { resetSharedTestDb } from '../../helpers/db';

const config = { serverUrl: 'http://pms.test', token: 'test-token' };
let owner = {
	id: 9001,
	uuid: 'owner-uuid',
	username: 'Owner',
	email: 'owner@example.test',
	thumb: 'owner-thumb'
};
let settingsSpy: ReturnType<typeof spyOn>;
let ownerSpy: ReturnType<typeof spyOn>;

const shared = (id = 42, username = 'Shared', machineIdentifier = 'machine-test') => ({
	id: id + 100,
	machineIdentifier,
	accepted: true,
	deletedAt: null,
	leftAt: null,
	invitedId: id,
	invited: { id, username, title: null, thumb: null, home: false, restricted: false },
	owned: false,
	libraries: [],
	sharingSettings: {}
});

function response(
	body: unknown,
	ok = true,
	status = 200,
	headers: Record<string, string> = {}
): Response {
	return {
		ok,
		status,
		headers: new Headers(headers),
		json: async () => body
	} as Response;
}

function ownedResource(machineIdentifier = 'machine-test') {
	return [
		{
			name: 'Test server',
			product: 'Plex Media Server',
			clientIdentifier: machineIdentifier,
			provides: 'server',
			owned: true
		}
	];
}

const originalFetch = globalThis.fetch;
beforeEach(async () => {
	await resetSharedTestDb();
	owner = {
		id: 9001,
		uuid: 'owner-uuid',
		username: 'Owner',
		email: 'owner@example.test',
		thumb: 'owner-thumb'
	};
	settingsSpy = spyOn(settingsService, 'getPlexConfig').mockImplementation(async () => config);
	ownerSpy = spyOn(plexOAuth, 'getPlexUserInfo').mockImplementation(async () => owner);
	await settingsService.setAppSetting(
		settingsService.AppSettingsKey.PLEX_AUTHORITY_DISCRIMINATOR,
		settingsService.getPlexConfigFingerprint(config)
	);
	await settingsService.setAppSetting(settingsService.AppSettingsKey.PLEX_AUTHORITY_EPOCH, '1');
});
afterEach(() => {
	globalThis.fetch = originalFetch;
	settingsSpy.mockRestore();
	ownerSpy.mockRestore();
});

describe('Plex account reconciliation', () => {
	it('uses accepted shares with header-only token and creates the local identity bridge', async () => {
		const requests: { url: string; init: RequestInit }[] = [];
		await db.insert(plexAccounts).values({
			accountId: 77,
			plexId: 77,
			username: 'Removed',
			thumb: null,
			isOwner: false
		});
		globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
			const value = String(url);
			requests.push({ url: value, init: init ?? {} });
			if (value.endsWith('/identity'))
				return response({ MediaContainer: { machineIdentifier: 'machine-test' } });
			if (value.endsWith('/accounts'))
				return response({ MediaContainer: { Account: [{ id: 42, name: 'Shared' }] } });
			if (value.includes('/api/v2/resources')) return response(ownedResource());
			expect(value).toBe('https://clients.plex.tv/api/v2/shared_servers/owned/accepted');
			return response([shared()]);
		}) as typeof fetch;
		expect(await runPlexAccountReconciliation()).toBe(2);
		const mapping = await db.select().from(plexAccounts).where(eq(plexAccounts.accountId, 42));
		const user = await db.select().from(users).where(eq(users.plexId, 42));
		expect(mapping[0]).toMatchObject({ accountId: 42, plexId: 42, isOwner: false });
		expect(user[0]).toMatchObject({ accountId: 42, isAdmin: false });
		expect(await db.select().from(plexAccounts).where(eq(plexAccounts.accountId, 1))).toEqual([
			expect.objectContaining({
				accountId: 1,
				plexId: owner.id,
				isOwner: true
			})
		]);
		expect(await db.select().from(plexAccounts).where(eq(plexAccounts.accountId, 77))).toHaveLength(
			0
		);
		const sharedUser = user[0];
		expect(sharedUser).toBeDefined();
		if (!sharedUser) throw new Error('Expected synchronized shared user');
		expect(await findUserByUsername('  sHaReD  ', { createIfMissing: false })).toEqual({
			userId: sharedUser.id,
			username: 'Shared',
			accountId: 42
		});
		const shareRequest = requests.find(
			(request) => request.url === 'https://clients.plex.tv/api/v2/shared_servers/owned/accepted'
		);
		expect(shareRequest?.init.headers).toMatchObject({
			Accept: 'application/json',
			'X-Plex-Token': 'test-token'
		});
		expect(shareRequest?.init.method).toBe('GET');
		expect(shareRequest?.url).not.toContain('test-token');
	});

	it('discards remote work when the configured authority changes before commit', async () => {
		let reads = 0;
		settingsSpy.mockImplementation(async () => {
			reads += 1;
			return reads === 1 ? config : { ...config, token: 'rotated-test-token' };
		});
		globalThis.fetch = (async (url: string | URL) => {
			const value = String(url);
			if (value.endsWith('/identity'))
				return response({ MediaContainer: { machineIdentifier: 'machine-test' } });
			if (value.endsWith('/accounts'))
				return response({ MediaContainer: { Account: [{ id: 42, name: 'Shared' }] } });
			if (value.includes('/api/v2/resources')) return response(ownedResource());
			return response([shared()]);
		}) as typeof fetch;

		expect(await runPlexAccountReconciliation()).toBe(0);
		expect(await db.select().from(plexAccounts)).toHaveLength(0);
		expect(await db.select().from(users)).toHaveLength(0);
	});

	it('bounds the owner source with an abort signal and leaves identity state untouched on timeout', async () => {
		ownerSpy.mockImplementation(async (_token: string, options?: { signal?: AbortSignal }) => {
			expect(options?.signal).toBeInstanceOf(AbortSignal);
			throw new DOMException('Timed out', 'TimeoutError');
		});
		globalThis.fetch = (async (url: string | URL) => {
			const value = String(url);
			if (value.endsWith('/identity'))
				return response({ MediaContainer: { machineIdentifier: 'machine-test' } });
			if (value.endsWith('/accounts'))
				return response({ MediaContainer: { Account: [{ id: 42, name: 'Shared' }] } });
			if (value.includes('/api/v2/resources')) return response(ownedResource());
			return response([shared()]);
		}) as typeof fetch;

		await expect(runPlexAccountReconciliation()).rejects.toThrow('Timed out');
		expect(await db.select().from(plexAccounts)).toHaveLength(0);
		expect(await db.select().from(users)).toHaveLength(0);
	});

	it('rejects an authority epoch race inside the atomic apply transaction', async () => {
		let identityReads = 0;
		globalThis.fetch = (async (url: string | URL) => {
			const value = String(url);
			if (value.endsWith('/identity')) {
				identityReads += 1;
				if (identityReads === 2) {
					return {
						ok: true,
						status: 200,
						headers: new Headers(),
						json: async () => {
							await db
								.update(appSettings)
								.set({ value: '3', updatedAt: new Date() })
								.where(eq(appSettings.key, settingsService.AppSettingsKey.PLEX_AUTHORITY_EPOCH));
							return { MediaContainer: { machineIdentifier: 'machine-test' } };
						}
					} as Response;
				}
				return response({ MediaContainer: { machineIdentifier: 'machine-test' } });
			}
			if (value.endsWith('/accounts'))
				return response({ MediaContainer: { Account: [{ id: 42, name: 'Shared' }] } });
			if (value.includes('/api/v2/resources')) return response(ownedResource());
			return response([shared()]);
		}) as typeof fetch;

		expect(await runPlexAccountReconciliation()).toBe(0);
		expect(await db.select().from(plexAccounts)).toHaveLength(0);
		expect(await db.select().from(users)).toHaveLength(0);
	});

	it('does not invalidate a successful mapping for unrelated API configuration writes', async () => {
		globalThis.fetch = (async (url: string | URL) => {
			const value = String(url);
			if (value.endsWith('/identity'))
				return response({ MediaContainer: { machineIdentifier: 'machine-test' } });
			if (value.endsWith('/accounts'))
				return response({ MediaContainer: { Account: [{ id: 42, name: 'Shared' }] } });
			if (value.includes('/api/v2/resources')) return response(ownedResource());
			return response([shared()]);
		}) as typeof fetch;
		expect(await runPlexAccountReconciliation()).toBe(2);
		await db.insert(appSettings).values({
			key: settingsService.AppSettingsKey.API_CONFIG_VERSION,
			value: 'advanced',
			updatedAt: new Date()
		});
		expect(await findUserByUsername('Shared', { createIfMissing: false })).toEqual(
			expect.objectContaining({ accountId: 42 })
		);
	});

	it('invalidates a successful mapping when the Plex authority epoch advances', async () => {
		globalThis.fetch = (async (url: string | URL) => {
			const value = String(url);
			if (value.endsWith('/identity'))
				return response({ MediaContainer: { machineIdentifier: 'machine-test' } });
			if (value.endsWith('/accounts'))
				return response({ MediaContainer: { Account: [{ id: 42, name: 'Shared' }] } });
			if (value.includes('/api/v2/resources')) return response(ownedResource());
			return response([shared()]);
		}) as typeof fetch;
		expect(await runPlexAccountReconciliation()).toBe(2);
		await db
			.update(appSettings)
			.set({ value: '3', updatedAt: new Date() })
			.where(eq(appSettings.key, settingsService.AppSettingsKey.PLEX_AUTHORITY_EPOCH));
		expect(await findUserByUsername('Shared', { createIfMissing: false })).toBeNull();
	});
	it('denies proof use and acquisition when the authority discriminator is absent or invalid', async () => {
		globalThis.fetch = (async (url: string | URL) => {
			const value = String(url);
			if (value.endsWith('/identity'))
				return response({ MediaContainer: { machineIdentifier: 'machine-test' } });
			if (value.endsWith('/accounts'))
				return response({ MediaContainer: { Account: [{ id: 42, name: 'Shared' }] } });
			if (value.includes('/api/v2/resources')) return response(ownedResource());
			return response([shared()]);
		}) as typeof fetch;
		expect(await runPlexAccountReconciliation()).toBe(2);

		for (const discriminator of [null, 'malformed', '0'.repeat(64)]) {
			if (discriminator === null) {
				await settingsService.deleteAppSetting(
					settingsService.AppSettingsKey.PLEX_AUTHORITY_DISCRIMINATOR
				);
			} else {
				await settingsService.setAppSetting(
					settingsService.AppSettingsKey.PLEX_AUTHORITY_DISCRIMINATOR,
					discriminator
				);
			}
			expect(await findUserByUsername('Shared', { createIfMissing: false })).toBeNull();
			await expect(runPlexAccountReconciliation()).rejects.toThrow(
				'Plex authority is not configured'
			);
		}

		await settingsService.setAppSetting(
			settingsService.AppSettingsKey.PLEX_AUTHORITY_DISCRIMINATOR,
			settingsService.getPlexConfigFingerprint(config)
		);
		for (const epoch of ['0', 'malformed', '01']) {
			await settingsService.setAppSetting(
				settingsService.AppSettingsKey.PLEX_AUTHORITY_EPOCH,
				epoch
			);
			expect(await findUserByUsername('Shared', { createIfMissing: false })).toBeNull();
			await expect(runPlexAccountReconciliation()).rejects.toThrow(
				'Plex authority is not configured'
			);
		}
	});

	it('keeps owner and prior shared rows when the accepted-shares endpoint is retired', async () => {
		await db
			.insert(plexAccounts)
			.values({ accountId: 77, plexId: 77, username: 'Old', thumb: null, isOwner: false });
		await db.insert(plexAccounts).values({
			accountId: 1,
			plexId: owner.id,
			username: 'Previous owner',
			thumb: null,
			isOwner: true
		});
		await db.insert(users).values({
			plexId: owner.id,
			accountId: 1,
			username: 'Previous owner',
			isAdmin: true
		});
		globalThis.fetch = (async (url: string | URL) => {
			const value = String(url);
			if (value.endsWith('/identity'))
				return response({ MediaContainer: { machineIdentifier: 'machine-test' } });
			if (value.endsWith('/accounts')) return response({ MediaContainer: { Account: [] } });
			if (value.includes('/api/v2/resources')) return response(ownedResource());
			return response({}, false, 410);
		}) as typeof fetch;
		expect(await runPlexAccountReconciliation()).toBe(0);
		expect(await db.select().from(plexAccounts).where(eq(plexAccounts.accountId, 77))).toHaveLength(
			1
		);
		expect(await db.select().from(users).where(eq(users.accountId, 1))).toHaveLength(1);
		expect(await db.select().from(users).where(eq(users.plexId, owner.id))).toEqual([
			expect.objectContaining({
				plexId: owner.id,
				accountId: 1,
				isAdmin: true
			})
		]);
	});

	it('retains prior shares when the accepted source is partial', async () => {
		await db
			.insert(plexAccounts)
			.values({ accountId: 77, plexId: 77, username: 'Old', thumb: null, isOwner: false });
		globalThis.fetch = (async (url: string | URL) => {
			const value = String(url);
			if (value.endsWith('/identity'))
				return response({ MediaContainer: { machineIdentifier: 'machine-test' } });
			if (value.endsWith('/accounts'))
				return response({ MediaContainer: { Account: [{ id: 42, name: 'Shared' }] } });
			if (value.includes('/api/v2/resources')) return response(ownedResource());
			return response([shared(), { malformed: true }]);
		}) as typeof fetch;
		expect(await runPlexAccountReconciliation()).toBe(0);
		expect(await db.select().from(plexAccounts).where(eq(plexAccounts.accountId, 77))).toHaveLength(
			1
		);
		expect(await db.select().from(plexAccounts).where(eq(plexAccounts.accountId, 42))).toHaveLength(
			0
		);
	});
	it('does not write shares without exact PMS correlation', async () => {
		globalThis.fetch = (async (url: string | URL) => {
			const value = String(url);
			if (value.endsWith('/identity'))
				return response({ MediaContainer: { machineIdentifier: 'machine-test' } });
			if (value.endsWith('/accounts'))
				return response({ MediaContainer: { Account: [{ id: 99, name: 'Other' }] } });
			if (value.includes('/api/v2/resources')) return response(ownedResource());
			return response([shared(42)]);
		}) as typeof fetch;
		expect(await runPlexAccountReconciliation()).toBe(0);
		expect(await db.select().from(plexAccounts).where(eq(plexAccounts.accountId, 42))).toHaveLength(
			0
		);
	});

	it('fails closed for ambiguous mappings and mismatched persistent identities', async () => {
		await db.insert(plexAccounts).values([
			{ accountId: 42, plexId: 42, username: 'Mixed', thumb: null, isOwner: false },
			{ accountId: 43, plexId: 43, username: 'mixed', thumb: null, isOwner: false }
		]);
		expect(await findUserByUsername(' MIXED ', { createIfMissing: false })).toBeNull();
		await db.delete(plexAccounts);
		await db
			.insert(plexAccounts)
			.values({ accountId: 42, plexId: 42, username: 'Single', thumb: null, isOwner: false });
		await db
			.insert(users)
			.values({ plexId: 42, accountId: 99, username: 'Single', isAdmin: false });
		expect(await findUserByUsername('single', { createIfMissing: false })).toBeNull();
		expect(await findUserByUsername('unknown', { createIfMissing: false })).toBeNull();
	});

	it('returns null when a Plex mapping has no local user', async () => {
		await db.insert(plexAccounts).values({
			accountId: 42,
			plexId: 42,
			username: 'SyncedOnly',
			thumb: null,
			isOwner: false
		});

		expect(await findUserByUsername('syncedonly', { createIfMissing: false })).toBeNull();
		expect(await db.select().from(users)).toHaveLength(0);
	});

	it('accepts an owned-server-proven empty share snapshot and removes stale non-owner mappings', async () => {
		await db.insert(plexAccounts).values({
			accountId: 77,
			plexId: 77,
			username: 'Removed',
			isOwner: false
		});
		globalThis.fetch = (async (url: string | URL) => {
			const value = String(url);
			if (value.endsWith('/identity'))
				return response({ MediaContainer: { machineIdentifier: 'machine-test' } });
			if (value.endsWith('/accounts')) return response({ MediaContainer: { Account: [] } });
			if (value.includes('/api/v2/resources')) return response(ownedResource());
			return response([]);
		}) as typeof fetch;

		expect(await runPlexAccountReconciliation()).toBe(1);
		expect(await db.select().from(plexAccounts)).toEqual([
			expect.objectContaining({ accountId: 1, plexId: owner.id, isOwner: true })
		]);
	});

	it('retains the prior snapshot when the owner resource does not prove the configured server', async () => {
		await db.insert(plexAccounts).values({
			accountId: 77,
			plexId: 77,
			username: 'Retained',
			isOwner: false
		});
		globalThis.fetch = (async (url: string | URL) => {
			const value = String(url);
			if (value.endsWith('/identity'))
				return response({ MediaContainer: { machineIdentifier: 'machine-test' } });
			if (value.endsWith('/accounts')) return response({ MediaContainer: { Account: [] } });
			if (value.includes('/api/v2/resources')) return response([]);
			return response([]);
		}) as typeof fetch;

		expect(await runPlexAccountReconciliation()).toBe(0);
		expect(await db.select().from(plexAccounts)).toEqual([
			expect.objectContaining({ accountId: 77, username: 'Retained' })
		]);
	});

	it('advances a non-repeating authority epoch across machine A to B to A transitions', async () => {
		let machineIdentifier = 'machine-a';
		globalThis.fetch = (async (url: string | URL) => {
			const value = String(url);
			if (value.endsWith('/identity')) return response({ MediaContainer: { machineIdentifier } });
			if (value.endsWith('/accounts'))
				return response({ MediaContainer: { Account: [{ id: 42, name: 'Shared' }] } });
			if (value.includes('/api/v2/resources')) return response(ownedResource(machineIdentifier));
			return response([shared(42, 'Shared', machineIdentifier)]);
		}) as typeof fetch;

		const epochs: string[] = [];
		for (const machine of ['machine-a', 'machine-b', 'machine-a']) {
			machineIdentifier = machine;
			expect(await runPlexAccountReconciliation()).toBe(2);
			const epoch = await settingsService.getAppSetting(
				settingsService.AppSettingsKey.PLEX_AUTHORITY_EPOCH
			);
			expect(epoch).not.toBeNull();
			epochs.push(epoch!);
		}
		expect(epochs).toEqual(['2', '3', '4']);
	});

	it('aborts the complete transaction when account 1 has a conflicting persisted mapping', async () => {
		await db.insert(plexAccounts).values({
			accountId: 1,
			plexId: 999,
			username: 'Conflicting owner',
			isOwner: true
		});
		globalThis.fetch = (async (url: string | URL) => {
			const value = String(url);
			if (value.endsWith('/identity'))
				return response({ MediaContainer: { machineIdentifier: 'machine-test' } });
			if (value.endsWith('/accounts'))
				return response({ MediaContainer: { Account: [{ id: 42, name: 'Shared' }] } });
			if (value.includes('/api/v2/resources')) return response(ownedResource());
			return response([shared()]);
		}) as typeof fetch;

		await expect(runPlexAccountReconciliation()).rejects.toThrow('Plex identity conflict');
		expect(await db.select().from(plexAccounts)).toEqual([
			expect.objectContaining({ accountId: 1, plexId: 999 })
		]);
		expect(await db.select().from(users)).toHaveLength(0);
	});

	it('denies a mapped user after the last-known-good freshness window expires', async () => {
		await db.insert(plexAccounts).values({
			accountId: 42,
			plexId: 42,
			username: 'Expired',
			thumb: null,
			isOwner: false,
			updatedAt: new Date(Date.now() - PLEX_ACCOUNT_FRESHNESS_MS)
		});
		await db.insert(users).values({
			plexId: 42,
			accountId: 42,
			username: 'Expired',
			isAdmin: false
		});

		expect(await findUserByUsername('expired', { createIfMissing: false })).toBeNull();
	});
});
describe('accepted-shares reader', () => {
	it('maps only current exact-machine accepted identities and treats malformed data as partial', async () => {
		const result = await fetchCurrentSharedAccounts('machine-test', 'test-token', (async () =>
			response([shared(), { invalid: true }])) as unknown as typeof fetch);
		expect(result).toMatchObject({
			status: 'partial',
			identities: [{ plexId: 42, username: 'Shared' }]
		});
	});

	it('treats a headerless top-level array as complete under the observed unpaged contract', async () => {
		const result = await fetchCurrentSharedAccounts('machine-test', 'test-token', (async () =>
			response([shared()])) as unknown as typeof fetch);
		expect(result).toEqual({
			status: 'complete',
			identities: [{ plexId: 42, username: 'Shared', thumb: null }]
		});
	});

	it('marks pagination evidence as partial instead of treating a truncated page as complete', async () => {
		const result = await fetchCurrentSharedAccounts('machine-test', 'test-token', (async () =>
			response([shared()], true, 200, {
				'x-plex-container-total-size': '2'
			})) as unknown as typeof fetch);
		expect(result).toEqual({ status: 'partial', identities: [] });
	});

	it('fails closed on malformed or inconclusive pagination metadata', async () => {
		const headerCases: Record<string, string>[] = [
			{ 'content-range': 'unknown' },
			{ 'x-plex-container-start': '0' },
			{ 'x-plex-container-total-size': 'not-a-number' },
			{ link: '<https://clients.plex.tv/next>; rel="self"' }
		];
		for (const headers of headerCases) {
			const result = await fetchCurrentSharedAccounts('machine-test', 'test-token', (async () =>
				response([shared()], true, 200, headers)) as unknown as typeof fetch);
			expect(result).toEqual({ status: 'partial', identities: [] });
		}
	});

	it('accepts paging metadata only when it conclusively describes the full array', async () => {
		const result = await fetchCurrentSharedAccounts('machine-test', 'test-token', (async () =>
			response([shared()], true, 200, {
				'content-range': 'items 0-0/1',
				'x-plex-container-start': '0',
				'x-plex-container-size': '1',
				'x-plex-container-total-size': '1'
			})) as unknown as typeof fetch);
		expect(result.status).toBe('complete');
	});

	it('fails closed for invalid top-level data and retired endpoints', async () => {
		const invalid = await fetchCurrentSharedAccounts('machine-test', 'test-token', (async () =>
			response({})) as unknown as typeof fetch);
		const retired = await fetchCurrentSharedAccounts('machine-test', 'test-token', (async () =>
			response({}, false, 410)) as unknown as typeof fetch);
		expect(invalid.status).toBe('failed');
		expect(retired.status).toBe('failed');
	});
});
