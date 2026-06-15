import { beforeEach, describe, expect, it } from 'bun:test';
import {
	deriveEffectiveShareBadge,
	getAllUsersWithStats,
	getOwnerWrappedHrefIfData,
	getSyncedViewerCount,
	resolvePlexAccountId,
	resolveStatsAccountId,
	userHasResolvablePlaysForYear
} from '$lib/server/admin/users.service';
import { db } from '$lib/server/db/client';
import {
	appSettings,
	playHistory,
	plexAccounts,
	shareSettings,
	users
} from '$lib/server/db/schema';
import {
	ShareMode,
	ShareModePrivacyLevel,
	ShareModeSource,
	type ShareModeType,
	ShareSettingsKey
} from '$lib/server/sharing/types';
import { resetSharedTestDb } from '../../helpers/db';
import { createTimestamp } from '../../helpers/factories';

describe('admin users service', () => {
	beforeEach(async () => {
		await resetSharedTestDb();
	});

	it('returns play counts and watch-history state for the selected year', async () => {
		await db.insert(users).values([
			{
				id: 1,
				plexId: 1001,
				accountId: 2001,
				username: 'viewer'
			},
			{
				id: 2,
				plexId: 1002,
				accountId: 2002,
				username: 'no-history'
			}
		]);

		await db.insert(playHistory).values([
			{
				historyKey: 'history-1',
				ratingKey: 'rating-1',
				title: 'Movie 1',
				type: 'movie',
				viewedAt: createTimestamp(2025, 1, 15),
				accountId: 2001,
				librarySectionId: 1,
				duration: 1800
			},
			{
				historyKey: 'history-2',
				ratingKey: 'rating-2',
				title: 'Movie 2',
				type: 'movie',
				viewedAt: createTimestamp(2025, 2, 15),
				accountId: 2001,
				librarySectionId: 1,
				duration: 3600
			},
			{
				historyKey: 'history-outside-year',
				ratingKey: 'rating-outside-year',
				title: 'Old Movie',
				type: 'movie',
				viewedAt: createTimestamp(2024, 12, 31),
				accountId: 2001,
				librarySectionId: 1,
				duration: 7200
			}
		]);

		const results = (await getAllUsersWithStats(2025)).sort((a, b) => a.id - b.id);

		expect(results[0]).toMatchObject({
			id: 1,
			totalWatchTimeMinutes: 90,
			totalPlays: 2,
			hasWatchHistory: true
		});
		expect(results[1]).toMatchObject({
			id: 2,
			totalWatchTimeMinutes: 0,
			totalPlays: 0,
			hasWatchHistory: false
		});
	});

	describe('getSyncedViewerCount (FIX-3 / ISSUE-004)', () => {
		it('returns 0 when there is no play history', async () => {
			expect(await getSyncedViewerCount()).toBe(0);
		});

		it('counts distinct play-history accounts, not raw rows', async () => {
			// Three rows across two distinct accountIds (2001 appears twice) → 2 viewers,
			// reconciling the "1 login user / many synced viewers" dashboard gap.
			await db.insert(playHistory).values([
				{
					historyKey: 'h-1',
					ratingKey: 'r-1',
					title: 'Movie 1',
					type: 'movie',
					viewedAt: createTimestamp(2025, 1, 15),
					accountId: 2001,
					librarySectionId: 1,
					duration: 1800
				},
				{
					historyKey: 'h-2',
					ratingKey: 'r-2',
					title: 'Movie 2',
					type: 'movie',
					viewedAt: createTimestamp(2025, 2, 15),
					accountId: 2001,
					librarySectionId: 1,
					duration: 1800
				},
				{
					historyKey: 'h-3',
					ratingKey: 'r-3',
					title: 'Movie 3',
					type: 'movie',
					viewedAt: createTimestamp(2025, 3, 15),
					accountId: 2002,
					librarySectionId: 1,
					duration: 1800
				}
			]);

			expect(await getSyncedViewerCount()).toBe(2);
		});
	});

	// ISSUE-007: the Users badge must reflect EFFECTIVE access (stored mode clamped
	// by the global floor) so it never reads more permissive than what a viewer
	// actually gets.
	describe('deriveEffectiveShareBadge (ISSUE-007)', () => {
		const allModes: ShareModeType[] = [
			ShareMode.PUBLIC,
			ShareMode.PRIVATE_LINK,
			ShareMode.PRIVATE_OAUTH
		];
		const classToMode: Record<'public' | 'oauth' | 'link', ShareModeType> = {
			public: ShareMode.PUBLIC,
			oauth: ShareMode.PRIVATE_OAUTH,
			link: ShareMode.PRIVATE_LINK
		};

		it('clamps an explicit stored mode by the floor (Public stored, OAuth floor → OAuth)', () => {
			const badge = deriveEffectiveShareBadge(
				ShareMode.PUBLIC,
				ShareModeSource.EXPLICIT,
				ShareMode.PRIVATE_OAUTH
			);
			expect(badge.effectiveShareMode).toBe(ShareMode.PRIVATE_OAUTH);
			expect(badge.effectiveLabel).toBe('OAuth');
			expect(badge.effectiveClass).toBe('oauth');
		});

		it('shows "Default" with no class for default-sourced rows', () => {
			const badge = deriveEffectiveShareBadge(
				ShareMode.PUBLIC,
				ShareModeSource.DEFAULT,
				ShareMode.PUBLIC
			);
			expect(badge.effectiveLabel).toBe('Default');
			expect(badge.effectiveClass).toBe('');
		});

		it('shows "Default" when there is no stored row at all', () => {
			const badge = deriveEffectiveShareBadge(null, null, ShareMode.PRIVATE_OAUTH);
			expect(badge.effectiveLabel).toBe('Default');
			expect(badge.effectiveClass).toBe('');
			expect(badge.effectiveShareMode).toBe(ShareMode.PRIVATE_OAUTH);
		});

		it('keeps label and CSS class in lockstep with the effective mode', () => {
			for (const stored of allModes) {
				for (const floor of allModes) {
					const badge = deriveEffectiveShareBadge(stored, ShareModeSource.EXPLICIT, floor);
					if (badge.effectiveClass !== '') {
						expect(classToMode[badge.effectiveClass]).toBe(badge.effectiveShareMode);
					}
				}
			}
		});

		it('badge mode is NEVER more permissive than effective access (the floor)', () => {
			for (const stored of [...allModes, null]) {
				for (const source of [ShareModeSource.EXPLICIT, ShareModeSource.DEFAULT, null]) {
					for (const floor of allModes) {
						const badge = deriveEffectiveShareBadge(stored, source, floor);
						// Higher privacy level = less permissive. Effective must be at least
						// as private as the floor.
						expect(ShareModePrivacyLevel[badge.effectiveShareMode]).toBeGreaterThanOrEqual(
							ShareModePrivacyLevel[floor]
						);
					}
				}
			}
		});
	});

	// ISSUE-007 (T2): a registered user/admin whose plays live under a local
	// play_history.accountId must show non-zero hours even when users.accountId is
	// null, by bridging plexId -> accountId via plex_accounts — WITHOUT ever
	// cross-attributing one viewer's history to another on an ambiguous lookup.
	describe('resolvePlexAccountId (ISSUE-007, pure)', () => {
		it('returns the local accountId for a single matching plex_accounts row', () => {
			const rows = [{ accountId: 2001, plexId: 1001, isOwner: true }];
			expect(resolvePlexAccountId(1001, rows)).toBe(2001);
		});

		it('returns null (fall back) when there is no matching row', () => {
			const rows = [{ accountId: 2001, plexId: 1001, isOwner: true }];
			expect(resolvePlexAccountId(9999, rows)).toBeNull();
		});

		it('prefers the unique owner row when multiple rows match the plexId', () => {
			const rows = [
				{ accountId: 3001, plexId: 1001, isOwner: false },
				{ accountId: 3002, plexId: 1001, isOwner: true },
				{ accountId: 3003, plexId: 1001, isOwner: false }
			];
			expect(resolvePlexAccountId(1001, rows)).toBe(3002);
		});

		it('refuses (returns null) when multiple rows match and none is owner', () => {
			const rows = [
				{ accountId: 3001, plexId: 1001, isOwner: false },
				{ accountId: 3002, plexId: 1001, isOwner: false }
			];
			expect(resolvePlexAccountId(1001, rows)).toBeNull();
		});

		it('refuses (returns null) when multiple rows match and more than one is owner', () => {
			const rows = [
				{ accountId: 3001, plexId: 1001, isOwner: true },
				{ accountId: 3002, plexId: 1001, isOwner: true }
			];
			expect(resolvePlexAccountId(1001, rows)).toBeNull();
		});
	});

	describe('resolveStatsAccountId (ISSUE-007, DB-backed)', () => {
		it('returns the user own accountId without consulting plex_accounts', async () => {
			expect(await resolveStatsAccountId({ accountId: 2001, plexId: 1001 })).toBe(2001);
		});

		it('bridges a null accountId to the local accountId via a single plex_accounts row', async () => {
			await db.insert(plexAccounts).values({
				accountId: 2001,
				plexId: 1001,
				username: 'owner',
				isOwner: true
			});
			expect(await resolveStatsAccountId({ accountId: null, plexId: 1001 })).toBe(2001);
		});

		it('falls back to plexId when no plex_accounts row matches', async () => {
			expect(await resolveStatsAccountId({ accountId: null, plexId: 7777 })).toBe(7777);
		});

		it('prefers the owner row on an ambiguous (multi-row) plexId', async () => {
			await db.insert(plexAccounts).values([
				{ accountId: 4001, plexId: 1001, username: 'managed', isOwner: false },
				{ accountId: 4002, plexId: 1001, username: 'owner', isOwner: true }
			]);
			expect(await resolveStatsAccountId({ accountId: null, plexId: 1001 })).toBe(4002);
		});

		it('falls back to plexId (never an arbitrary row) when ambiguous with no owner', async () => {
			await db.insert(plexAccounts).values([
				{ accountId: 4001, plexId: 1001, username: 'managed-a', isOwner: false },
				{ accountId: 4002, plexId: 1001, username: 'managed-b', isOwner: false }
			]);
			expect(await resolveStatsAccountId({ accountId: null, plexId: 1001 })).toBe(1001);
		});
	});

	describe('getAllUsersWithStats account bridging (ISSUE-007)', () => {
		it('shows non-zero hours for a null-accountId user whose plays live under a bridged accountId', async () => {
			await db.insert(users).values({ id: 1, plexId: 1001, accountId: null, username: 'admin' });
			await db.insert(plexAccounts).values({
				accountId: 2001,
				plexId: 1001,
				username: 'admin',
				isOwner: true
			});
			await db.insert(playHistory).values([
				{
					historyKey: 'bridge-1',
					ratingKey: 'r-1',
					title: 'Movie 1',
					type: 'movie',
					viewedAt: createTimestamp(2025, 1, 15),
					accountId: 2001,
					librarySectionId: 1,
					duration: 3600
				}
			]);

			const [row] = await getAllUsersWithStats(2025);
			expect(row?.totalWatchTimeMinutes).toBe(60);
			expect(row?.totalPlays).toBe(1);
			expect(row?.hasWatchHistory).toBe(true);
		});

		it('keeps 0h for a null-accountId user with genuinely no plays', async () => {
			await db.insert(users).values({ id: 1, plexId: 1001, accountId: null, username: 'admin' });
			const [row] = await getAllUsersWithStats(2025);
			expect(row?.totalWatchTimeMinutes).toBe(0);
			expect(row?.hasWatchHistory).toBe(false);
		});
	});

	// ISSUE-001 (T1): the owner Wrapped href must be null for a user with no plays
	// that year, so callers render no link to hover-preload (eliminating the recurring
	// swallowed 404) AND no share_settings row is lazily minted on every page load.
	describe('getOwnerWrappedHrefIfData (ISSUE-001)', () => {
		it('returns null and mints NO share_settings row for a 0-play user', async () => {
			await db.insert(users).values({ id: 1, plexId: 1001, accountId: null, username: 'admin' });

			const href = await getOwnerWrappedHrefIfData(1, 2026);

			expect(href).toBeNull();
			const rows = await db.select().from(shareSettings);
			expect(rows.length).toBe(0);
		});

		it('returns a Wrapped href for a user who has plays that year', async () => {
			await db.insert(users).values({ id: 1, plexId: 1001, accountId: 2001, username: 'viewer' });
			await db.insert(playHistory).values({
				historyKey: 'href-1',
				ratingKey: 'r-1',
				title: 'Movie 1',
				type: 'movie',
				viewedAt: createTimestamp(2026, 1, 15),
				accountId: 2001,
				librarySectionId: 1,
				duration: 3600
			});

			const href = await getOwnerWrappedHrefIfData(1, 2026);

			expect(href).toMatch(/^\/wrapped\/2026\/u\//);
		});

		it('bridges plexId -> accountId so a null-accountId user with plays still gets a href', async () => {
			await db.insert(users).values({ id: 1, plexId: 1001, accountId: null, username: 'admin' });
			await db.insert(plexAccounts).values({
				accountId: 2001,
				plexId: 1001,
				username: 'admin',
				isOwner: true
			});
			await db.insert(playHistory).values({
				historyKey: 'href-2',
				ratingKey: 'r-2',
				title: 'Movie 2',
				type: 'movie',
				viewedAt: createTimestamp(2026, 2, 15),
				accountId: 2001,
				librarySectionId: 1,
				duration: 3600
			});

			expect(await userHasResolvablePlaysForYear({ accountId: null, plexId: 1001 }, 2026)).toBe(
				true
			);
			expect(await getOwnerWrappedHrefIfData(1, 2026)).toMatch(/^\/wrapped\/2026\/u\//);
		});
	});

	describe('getAllUsersWithStats badge clamping (ISSUE-007)', () => {
		it('reports effective (clamped) badge fields, not the raw stored mode', async () => {
			// Floor is OAuth (most restrictive); a row explicitly set to Public must
			// surface an OAuth badge, never "Public".
			await db.insert(appSettings).values({
				key: ShareSettingsKey.DEFAULT_SHARE_MODE,
				value: ShareMode.PRIVATE_OAUTH,
				updatedAt: new Date()
			});

			await db.insert(users).values({ id: 1, plexId: 1001, accountId: 2001, username: 'viewer' });
			await db.insert(shareSettings).values({
				userId: 1,
				year: 2025,
				mode: ShareMode.PUBLIC,
				modeSource: ShareModeSource.EXPLICIT,
				shareToken: null,
				canUserControl: false
			});

			const [row] = await getAllUsersWithStats(2025);
			expect(row?.shareMode).toBe(ShareMode.PUBLIC);
			expect(row?.effectiveShareMode).toBe(ShareMode.PRIVATE_OAUTH);
			expect(row?.effectiveLabel).toBe('OAuth');
			expect(row?.effectiveClass).toBe('oauth');
		});
	});
});
