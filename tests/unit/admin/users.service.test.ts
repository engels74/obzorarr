import { beforeEach, describe, expect, it } from 'bun:test';
import {
	deriveEffectiveShareBadge,
	getAllUsersWithStats,
	getSyncedViewerCount
} from '$lib/server/admin/users.service';
import { db } from '$lib/server/db/client';
import { appSettings, playHistory, shareSettings, users } from '$lib/server/db/schema';
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
