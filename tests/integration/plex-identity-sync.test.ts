import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { isRedirect } from '@sveltejs/kit';
import { eq, sql } from 'drizzle-orm';
import {
	AppSettingsKey,
	getPlexConfigFingerprint,
	setCachedServerMachineId,
	setPublicLandingLookupEnabled
} from '$lib/server/admin/settings.service';
import * as plexOAuth from '$lib/server/auth/plex-oauth';
import { db } from '$lib/server/db/client';
import {
	appSettings,
	playHistory,
	plexAccounts,
	shareSettings,
	users
} from '$lib/server/db/schema';
import {
	PLEX_ACCOUNT_FRESHNESS_MS,
	runPlexAccountReconciliation
} from '$lib/server/plex/account-reconciliation';
import {
	getPublicShareIdentifier,
	getShareIdentifier,
	setGlobalShareDefaults,
	updateShareSettings
} from '$lib/server/sharing/service';
import { ShareMode, ShareModeSource } from '$lib/server/sharing/types';
import * as liveSync from '$lib/server/sync/live-sync';
import { load as loadWrapped } from '../../src/routes/wrapped/[year=year]/u/[identifier]/+page.server';
import { resetSharedTestDb } from '../helpers/db';

const YEAR = new Date().getFullYear();
const config = { serverUrl: 'http://pms.test', token: 'test-token' };
const originalFetch = globalThis.fetch;
const { actions } = await import('../../src/routes/+page.server');
type LookupAction = NonNullable<typeof actions.lookupUser>;

function response(body: unknown, headers?: Record<string, string>): Response {
	return {
		ok: true,
		status: 200,
		headers: new Headers(headers),
		json: async () => body
	} as Response;
}

function acceptedShare(plexId = 42, username = 'Shared User', machineIdentifier = 'machine-test') {
	return {
		id: 142,
		machineIdentifier,
		accepted: true,
		deletedAt: null,
		leftAt: null,
		invitedId: plexId,
		invited: { id: plexId, username, title: null, thumb: null },
		owned: false,
		libraries: [],
		sharingSettings: {}
	};
}

function installPlexFixture(
	mode: 'complete' | 'partial' | 'failed' | 'removed',
	options: {
		machineIdentifier?: string;
		managed?: Array<{ id: number; name: string }>;
		shares?: ReturnType<typeof acceptedShare>[];
		resource?: unknown;
		onShares?: () => Promise<void> | void;
	} = {}
): void {
	const machineIdentifier = options.machineIdentifier ?? 'machine-test';
	const shares = options.shares ?? [acceptedShare()];
	globalThis.fetch = (async (url: string | URL) => {
		const value = String(url);
		if (value.endsWith('/identity')) return response({ MediaContainer: { machineIdentifier } });
		if (value.endsWith('/accounts'))
			return response({
				MediaContainer: {
					Account:
						options.managed ??
						shares.map((share) => ({
							id: share.invitedId,
							name: share.invited.username
						}))
				}
			});
		if (value.includes('/resources')) {
			return response(
				options.resource ?? [
					{
						name: 'Test server',
						product: 'Plex Media Server',
						clientIdentifier: machineIdentifier,
						provides: 'server',
						owned: true
					}
				]
			);
		}
		if (mode === 'failed')
			return { ok: false, status: 503, headers: new Headers(), json: async () => ({}) } as Response;
		await options.onShares?.();
		if (mode === 'partial')
			return response(shares, { 'x-plex-container-total-size': String(shares.length + 1) });
		return response(mode === 'removed' ? [] : shares);
	}) as typeof fetch;
}

async function lookup(username: string) {
	const form = new FormData();
	form.set('username', username);
	return (actions.lookupUser as LookupAction)({
		request: new Request('http://lookup.test/', { method: 'POST', body: form }),
		cookies: { set: () => {} },
		getClientAddress: () => '198.51.100.25',
		setHeaders: () => {}
	} as unknown as Parameters<LookupAction>[0]);
}
async function seedSharedHistory(): Promise<void> {
	await db.insert(playHistory).values({
		historyKey: 'shared-boundary-history',
		ratingKey: 'shared-boundary',
		title: 'Shared boundary history',
		type: 'movie',
		viewedAt: Math.floor(Date.UTC(YEAR, 0, 2) / 1000),
		accountId: 42,
		librarySectionId: 1
	});
}

describe('Plex identity reconciliation feeds public Wrapped lookup', () => {
	let configSpy: ReturnType<typeof spyOn>;
	let ownerSpy: ReturnType<typeof spyOn>;
	let liveSyncSpy: ReturnType<typeof spyOn>;
	let activeConfig = config;

	beforeEach(async () => {
		await resetSharedTestDb();
		activeConfig = { ...config };
		await setPublicLandingLookupEnabled(true);
		await setGlobalShareDefaults({ defaultShareMode: ShareMode.PUBLIC, allowUserControl: true });
		await db.insert(appSettings).values([
			{ key: AppSettingsKey.PLEX_AUTHORITY_EPOCH, value: '1', updatedAt: new Date() },
			{
				key: AppSettingsKey.PLEX_AUTHORITY_DISCRIMINATOR,
				value: getPlexConfigFingerprint(config),
				updatedAt: new Date()
			}
		]);
		configSpy = spyOn(
			await import('$lib/server/admin/settings.service'),
			'getPlexConfig'
		).mockImplementation(async () => activeConfig);
		ownerSpy = spyOn(plexOAuth, 'getPlexUserInfo').mockResolvedValue({
			id: 9001,
			uuid: 'owner',
			username: 'Owner',
			email: 'owner@example.test'
		});
		liveSyncSpy = spyOn(liveSync, 'triggerLiveSyncIfNeeded').mockResolvedValue({
			triggered: false,
			syncInProgress: false,
			reason: 'disabled'
		});
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
		configSpy.mockRestore();
		ownerSpy.mockRestore();
		liveSyncSpy.mockRestore();
	});

	it('keeps history isolated until a complete current-authority fixture atomically entitles lookup, and revokes/restores it exactly', async () => {
		const viewedAt = Math.floor(Date.UTC(YEAR, 0, 2) / 1000);
		await db.insert(playHistory).values([
			{
				historyKey: 'shared-history',
				ratingKey: 'shared',
				title: 'Shared history',
				type: 'movie',
				viewedAt,
				accountId: 42,
				librarySectionId: 1
			},
			{
				historyKey: 'owner-history',
				ratingKey: 'owner',
				title: 'Owner history',
				type: 'movie',
				viewedAt,
				accountId: 1,
				librarySectionId: 1
			}
		]);

		installPlexFixture('failed');
		expect(await runPlexAccountReconciliation()).toBe(0);
		const failedLookup = await lookup('Shared User');
		expect(failedLookup).toMatchObject({
			status: 404,
			data: { error: 'No publicly shared Wrapped found for that username.' }
		});
		expect(await db.select().from(playHistory).where(eq(playHistory.accountId, 42))).toHaveLength(
			1
		);

		installPlexFixture('complete');
		expect(await runPlexAccountReconciliation()).toBe(2);
		const sharedMapping = (
			await db.select().from(plexAccounts).where(eq(plexAccounts.accountId, 42))
		)[0];
		const sharedUser = (await db.select().from(users).where(eq(users.plexId, 42)))[0];
		expect(sharedMapping).toMatchObject({
			accountId: 42,
			plexId: 42,
			username: 'Shared User',
			isOwner: false
		});
		expect(sharedUser).toMatchObject({ accountId: 42, isAdmin: false });
		expect(await db.select().from(plexAccounts).where(eq(plexAccounts.accountId, 1))).toEqual([
			expect.objectContaining({ plexId: 9001, isOwner: true })
		]);
		expect(
			await db
				.select()
				.from(appSettings)
				.where(eq(appSettings.key, AppSettingsKey.PLEX_IDENTITY_PROOF))
		).toHaveLength(1);
		if (!sharedUser) throw new Error('Expected synchronized shared user');
		const ownerUser = (await db.select().from(users).where(eq(users.accountId, 1)))[0];
		if (!ownerUser) throw new Error('Expected synchronized owner');
		await db.insert(shareSettings).values({
			userId: ownerUser.id,
			year: YEAR,
			mode: ShareMode.PRIVATE_OAUTH,
			modeSource: ShareModeSource.EXPLICIT,
			canUserControl: false
		});
		await db.insert(shareSettings).values({
			userId: sharedUser.id,
			year: YEAR,
			mode: ShareMode.PRIVATE_OAUTH,
			modeSource: ShareModeSource.EXPLICIT,
			canUserControl: false
		});
		expect(await lookup('Shared User')).toMatchObject({
			status: 404,
			data: { error: 'No publicly shared Wrapped found for that username.' }
		});
		expect(await lookup('Unknown User')).toMatchObject({
			status: 404,
			data: { error: 'No publicly shared Wrapped found for that username.' }
		});
		await db.delete(shareSettings).where(eq(shareSettings.userId, sharedUser.id));

		let identifier = '';
		try {
			await lookup('  sHaReD uSeR  ');
			throw new Error('Expected lookup redirect');
		} catch (error) {
			expect(isRedirect(error)).toBe(true);
			if (!isRedirect(error)) throw error;
			expect(error.status).toBe(303);
			expect(error.location).toMatch(new RegExp(`^/wrapped/${YEAR}/u/[A-Za-z0-9]+$`));
			identifier = error.location.slice(`/wrapped/${YEAR}/u/`.length);
			expect(identifier).not.toBe(String(sharedUser.id));
			expect(identifier).not.toMatch(/^\d+$/);
		}
		const destination = await loadWrapped({
			params: { year: String(YEAR), identifier },
			locals: {},
			parent: async () => ({ availableYears: [YEAR] }),
			setHeaders: () => {}
		} as unknown as Parameters<typeof loadWrapped>[0]);
		expect(destination).toMatchObject({ userId: sharedUser.id, username: 'Shared User' });

		installPlexFixture('partial');
		expect(await runPlexAccountReconciliation()).toBe(0);
		expect(await db.select().from(plexAccounts).where(eq(plexAccounts.accountId, 42))).toHaveLength(
			1
		);

		installPlexFixture('removed');
		expect(await runPlexAccountReconciliation()).toBe(1);
		expect(await db.select().from(plexAccounts).where(eq(plexAccounts.accountId, 42))).toHaveLength(
			0
		);
		expect(await lookup('Shared User')).toMatchObject({
			status: 404,
			data: { error: 'No publicly shared Wrapped found for that username.' }
		});
		expect(await db.select().from(playHistory).where(eq(playHistory.accountId, 42))).toHaveLength(
			1
		);

		expect(await db.select().from(playHistory).where(eq(playHistory.accountId, 1))).toHaveLength(1);
		expect(await db.select().from(users).where(eq(users.id, ownerUser.id))).toEqual([
			expect.objectContaining({ accountId: 1, plexId: 9001, isAdmin: true })
		]);
		expect(
			await db.select().from(shareSettings).where(eq(shareSettings.userId, ownerUser.id))
		).toHaveLength(1);
		installPlexFixture('complete');
		expect(await runPlexAccountReconciliation()).toBe(2);
		let restoredIdentifier = '';
		try {
			await lookup('shared user');
			throw new Error('Expected restored lookup redirect');
		} catch (error) {
			expect(isRedirect(error)).toBe(true);
			if (!isRedirect(error)) throw error;
			restoredIdentifier = error.location.slice(`/wrapped/${YEAR}/u/`.length);
		}
		expect(restoredIdentifier).toBe(identifier);
	});
	it('allows a complete mapping through 23h59m59s, then denies it at exactly 24 hours', async () => {
		await seedSharedHistory();
		installPlexFixture('complete');
		expect(await runPlexAccountReconciliation()).toBe(2);
		const proof = (
			await db
				.select()
				.from(appSettings)
				.where(eq(appSettings.key, AppSettingsKey.PLEX_IDENTITY_PROOF))
		)[0];
		if (!proof) throw new Error('Expected identity proof');
		const confirmedAt = JSON.parse(proof.value).confirmedAt as number;
		const confirmedSecond = Math.floor(confirmedAt / 1000) * 1000;
		const clock = spyOn(Date, 'now');
		try {
			clock.mockReturnValue(confirmedSecond + PLEX_ACCOUNT_FRESHNESS_MS - 1);
			await expect(lookup('Shared User')).rejects.toMatchObject({ status: 303 });
			clock.mockReturnValue(confirmedSecond + PLEX_ACCOUNT_FRESHNESS_MS);
			expect(await lookup('Shared User')).toMatchObject({
				status: 404,
				data: { error: 'No publicly shared Wrapped found for that username.' }
			});
		} finally {
			clock.mockRestore();
		}
	});

	async function loadIdentifier(identifier: string, locals: App.Locals) {
		return loadWrapped({
			params: { year: String(YEAR), identifier },
			locals,
			parent: async () => ({ availableYears: [YEAR] }),
			setHeaders: () => {}
		} as unknown as Parameters<typeof loadWrapped>[0]);
	}
	it('reconciles each non-admin global/local identifier pair while reserving accountId 1 for the owner', async () => {
		installPlexFixture('complete', {
			shares: [acceptedShare(42, 'Cloud shared'), acceptedShare(77, 'Local managed')]
		});
		expect(await runPlexAccountReconciliation()).toBe(3);
		expect(await db.select().from(plexAccounts).where(eq(plexAccounts.isOwner, false))).toEqual([
			expect.objectContaining({ accountId: 42, plexId: 42, username: 'Cloud shared' }),
			expect.objectContaining({ accountId: 77, plexId: 77, username: 'Local managed' })
		]);
		expect(await db.select().from(users).where(eq(users.isAdmin, false))).toEqual([
			expect.objectContaining({ accountId: 42, plexId: 42 }),
			expect.objectContaining({ accountId: 77, plexId: 77 })
		]);
		expect(await db.select().from(plexAccounts).where(eq(plexAccounts.accountId, 1))).toEqual([
			expect.objectContaining({ plexId: 9001, isOwner: true })
		]);
	});
	it('preserves every share identifier and the admin historical path across entitlement removal', async () => {
		const shares = [
			acceptedShare(42, 'Public member'),
			acceptedShare(77, 'OAuth member'),
			acceptedShare(88, 'Link member')
		];
		await db.insert(playHistory).values([
			...([42, 77, 88] as const).map((accountId) => ({
				historyKey: `identifier-history-${accountId}`,
				ratingKey: `identifier-${accountId}`,
				title: 'Identifier history',
				type: 'movie' as const,
				viewedAt: Math.floor(Date.UTC(YEAR, 0, 2) / 1000),
				accountId,
				librarySectionId: 1
			})),
			{
				historyKey: 'identifier-owner-history',
				ratingKey: 'identifier-owner',
				title: 'Owner historical access',
				type: 'movie',
				viewedAt: Math.floor(Date.UTC(YEAR, 0, 2) / 1000),
				accountId: 1,
				librarySectionId: 1
			}
		]);
		installPlexFixture('complete', { shares });
		expect(await runPlexAccountReconciliation()).toBe(4);

		const memberByAccount = new Map(
			(await db.select().from(users).where(eq(users.isAdmin, false))).map((user) => [
				user.accountId,
				user
			])
		);
		const publicMember = memberByAccount.get(42);
		const oauthMember = memberByAccount.get(77);
		const linkMember = memberByAccount.get(88);
		const owner = (await db.select().from(users).where(eq(users.accountId, 1)))[0];
		if (!publicMember || !oauthMember || !linkMember || !owner)
			throw new Error('Expected reconciled owner and members');

		await updateShareSettings(publicMember.id, YEAR, { mode: ShareMode.PUBLIC }, true);
		await updateShareSettings(oauthMember.id, YEAR, { mode: ShareMode.PRIVATE_OAUTH }, true);
		await updateShareSettings(linkMember.id, YEAR, { mode: ShareMode.PRIVATE_LINK }, true);
		const publicSlug = await getPublicShareIdentifier(publicMember.id, YEAR);
		const oauthSlug = await getPublicShareIdentifier(oauthMember.id, YEAR);
		const linkToken = await getShareIdentifier(linkMember.id, YEAR);
		const ownerLocals = { user: owner } as unknown as App.Locals;
		const staleMemberLocals = { user: publicMember } as unknown as App.Locals;

		await expect(loadIdentifier(publicSlug, {} as App.Locals)).resolves.toMatchObject({
			userId: publicMember.id
		});
		await expect(loadIdentifier(oauthSlug, ownerLocals)).resolves.toMatchObject({
			userId: oauthMember.id
		});
		await expect(loadIdentifier(linkToken, {} as App.Locals)).resolves.toMatchObject({
			userId: linkMember.id
		});
		await expect(loadIdentifier(String(owner.id), ownerLocals)).resolves.toMatchObject({
			userId: owner.id
		});
		await expect(loadIdentifier(String(publicMember.id), staleMemberLocals)).resolves.toMatchObject(
			{
				userId: publicMember.id
			}
		);
		await expect(
			loadWrapped({
				params: { year: String(YEAR - 1), identifier: linkToken },
				locals: {},
				parent: async () => ({ availableYears: [YEAR - 1] }),
				setHeaders: () => {}
			} as unknown as Parameters<typeof loadWrapped>[0])
		).rejects.toMatchObject({ status: 404 });

		const artifacts = await db
			.select({
				userId: shareSettings.userId,
				mode: shareSettings.mode,
				modeSource: shareSettings.modeSource,
				shareToken: shareSettings.shareToken,
				publicSlug: shareSettings.publicSlug
			})
			.from(shareSettings)
			.where(
				sql`${shareSettings.userId} IN (${publicMember.id}, ${oauthMember.id}, ${linkMember.id})`
			);
		expect(artifacts).toHaveLength(3);
		installPlexFixture('removed', { shares });
		expect(await runPlexAccountReconciliation()).toBe(1);

		await expect(loadIdentifier(publicSlug, {} as App.Locals)).rejects.toMatchObject({
			status: 404
		});
		await expect(loadIdentifier(oauthSlug, staleMemberLocals)).rejects.toMatchObject({
			status: 404
		});
		await expect(loadIdentifier(linkToken, {} as App.Locals)).rejects.toMatchObject({
			status: 404
		});
		await expect(loadIdentifier(String(publicMember.id), staleMemberLocals)).rejects.toMatchObject({
			status: 404
		});
		const artifactsAfterRemoval = await db
			.select({
				userId: shareSettings.userId,
				mode: shareSettings.mode,
				modeSource: shareSettings.modeSource,
				shareToken: shareSettings.shareToken,
				publicSlug: shareSettings.publicSlug
			})
			.from(shareSettings)
			.where(
				sql`${shareSettings.userId} IN (${publicMember.id}, ${oauthMember.id}, ${linkMember.id})`
			);
		expect(artifactsAfterRemoval).toEqual(artifacts);
		expect(await db.select().from(users)).toHaveLength(4);
		expect(await db.select().from(playHistory)).toHaveLength(4);
		expect(await db.select().from(plexAccounts)).toEqual([
			expect.objectContaining({ accountId: 1, plexId: 9001, isOwner: true })
		]);

		await expect(loadIdentifier(String(publicMember.id), ownerLocals)).resolves.toMatchObject({
			userId: publicMember.id
		});
		expect(await db.select().from(shareSettings)).toEqual(
			artifacts.map((artifact) => expect.objectContaining(artifact))
		);

		installPlexFixture('complete', { shares });
		expect(await runPlexAccountReconciliation()).toBe(4);
		expect(
			await db
				.select({
					userId: shareSettings.userId,
					mode: shareSettings.mode,
					modeSource: shareSettings.modeSource,
					shareToken: shareSettings.shareToken,
					publicSlug: shareSettings.publicSlug
				})
				.from(shareSettings)
				.where(
					sql`${shareSettings.userId} IN (${publicMember.id}, ${oauthMember.id}, ${linkMember.id})`
				)
		).toEqual(artifacts);
		await expect(loadIdentifier(publicSlug, {} as App.Locals)).resolves.toMatchObject({
			userId: publicMember.id
		});
		await expect(loadIdentifier(oauthSlug, ownerLocals)).resolves.toMatchObject({
			userId: oauthMember.id
		});
		await expect(loadIdentifier(linkToken, {} as App.Locals)).resolves.toMatchObject({
			userId: linkMember.id
		});
		await expect(loadIdentifier(String(publicMember.id), staleMemberLocals)).resolves.toMatchObject(
			{
				userId: publicMember.id
			}
		);
	});
	it('denies Home identities without an exact owned configured-server entitlement', async () => {
		installPlexFixture('complete', {
			resource: [
				{
					product: 'Plex Media Server',
					clientIdentifier: 'another-machine',
					provides: 'server',
					owned: true
				},
				{
					product: 'Plex Media Server',
					clientIdentifier: 'machine-test',
					provides: 'server',
					owned: false
				}
			]
		});
		expect(await runPlexAccountReconciliation()).toBe(0);
		expect(await db.select().from(plexAccounts)).toHaveLength(0);
		expect(await db.select().from(users)).toHaveLength(0);
		expect(await lookup('Shared User')).toMatchObject({ status: 404 });
	});

	it('invalidates access immediately on config or machine authority changes, but preserves age for unchanged authority', async () => {
		await seedSharedHistory();
		installPlexFixture('complete');
		expect(await runPlexAccountReconciliation()).toBe(2);
		await expect(lookup('Shared User')).rejects.toMatchObject({ status: 303 });

		activeConfig = { serverUrl: 'http://pms-other.test', token: 'test-token' };
		expect(await lookup('Shared User')).toMatchObject({ status: 404 });
		activeConfig = { ...config };
		await expect(lookup('Shared User')).rejects.toMatchObject({ status: 303 });

		await setCachedServerMachineId('machine-other');
		expect(await lookup('Shared User')).toMatchObject({ status: 404 });
	});

	it('aborts opposite global/local persistent conflicts without replacing identity state', async () => {
		for (const user of [
			{ plexId: 42, accountId: 99, username: 'Global conflict' },
			{ plexId: 99, accountId: 42, username: 'Local conflict' }
		]) {
			await resetSharedTestDb();
			await db.insert(appSettings).values([
				{ key: AppSettingsKey.PLEX_AUTHORITY_EPOCH, value: '1', updatedAt: new Date() },
				{
					key: AppSettingsKey.PLEX_AUTHORITY_DISCRIMINATOR,
					value: getPlexConfigFingerprint(config),
					updatedAt: new Date()
				}
			]);
			await db.insert(playHistory).values({
				historyKey: `history-${user.plexId}`,
				ratingKey: 'conflict',
				title: 'Isolated history',
				type: 'movie',
				viewedAt: Math.floor(Date.now() / 1000),
				accountId: 42,
				librarySectionId: 1
			});
			await db.insert(users).values({ ...user, isAdmin: false });
			installPlexFixture('complete');
			await expect(runPlexAccountReconciliation()).rejects.toThrow('Plex identity conflict');
			expect(await db.select().from(users)).toEqual([expect.objectContaining(user)]);
			expect(await db.select().from(plexAccounts)).toHaveLength(0);
			expect(
				await db
					.select()
					.from(appSettings)
					.where(eq(appSettings.key, AppSettingsKey.PLEX_IDENTITY_PROOF))
			).toHaveLength(0);
			expect(await db.select().from(playHistory).where(eq(playHistory.accountId, 42))).toHaveLength(
				1
			);
		}
	});

	it('discards delayed A-to-B-to-A work and captures only the current authority', async () => {
		let delayed = true;
		installPlexFixture('complete', {
			onShares: async () => {
				if (!delayed) return;
				delayed = false;
				await setCachedServerMachineId('machine-b');
				await setCachedServerMachineId('machine-test');
			}
		});
		expect(await runPlexAccountReconciliation()).toBe(0);
		expect(await db.select().from(plexAccounts)).toHaveLength(0);
		expect(await db.select().from(users)).toHaveLength(0);
		expect(await runPlexAccountReconciliation()).toBe(2);
		expect(await db.select().from(plexAccounts)).toHaveLength(2);
	});

	it('rolls back reconciliation and machine-transition database failures without touching history', async () => {
		await db.insert(playHistory).values({
			historyKey: 'rollback-history',
			ratingKey: 'rollback',
			title: 'Isolated history',
			type: 'movie',
			viewedAt: Math.floor(Date.now() / 1000),
			accountId: 42,
			librarySectionId: 1
		});
		await db.run(
			sql`CREATE TRIGGER reject_identity_snapshot BEFORE INSERT ON plex_accounts BEGIN SELECT RAISE(ABORT, 'injected reconciliation failure'); END`
		);
		installPlexFixture('complete');
		await expect(runPlexAccountReconciliation()).rejects.toThrow('injected reconciliation failure');
		await db.run(sql`DROP TRIGGER reject_identity_snapshot`);
		expect(await db.select().from(users)).toHaveLength(0);
		expect(await db.select().from(plexAccounts)).toHaveLength(0);
		expect(await db.select().from(playHistory).where(eq(playHistory.accountId, 42))).toHaveLength(
			1
		);

		expect(await runPlexAccountReconciliation()).toBe(2);
		const proofBeforeTransition = await db
			.select()
			.from(appSettings)
			.where(eq(appSettings.key, AppSettingsKey.PLEX_IDENTITY_PROOF));
		await db.run(
			sql`CREATE TRIGGER reject_machine_transition BEFORE UPDATE ON app_settings WHEN NEW.key = 'server_machine_id' BEGIN SELECT RAISE(ABORT, 'injected transition failure'); END`
		);
		await expect(setCachedServerMachineId('machine-b')).rejects.toThrow(
			'injected transition failure'
		);
		await db.run(sql`DROP TRIGGER reject_machine_transition`);
		expect(
			await db
				.select()
				.from(appSettings)
				.where(eq(appSettings.key, AppSettingsKey.PLEX_IDENTITY_PROOF))
		).toEqual(proofBeforeTransition);
		expect(await db.select().from(plexAccounts)).toHaveLength(2);
		expect(await db.select().from(playHistory).where(eq(playHistory.accountId, 42))).toHaveLength(
			1
		);
	});
});
