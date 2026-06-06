import { and, between, eq, sql } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { playHistory, shareSettings, users } from '$lib/server/db/schema';
import { generateShareToken, getGlobalDefaultShareMode } from '$lib/server/sharing/service';
import {
	getMoreRestrictiveMode,
	ShareMode,
	ShareModeSource,
	type ShareModeSourceType,
	type ShareModeType
} from '$lib/server/sharing/types';

export interface UserWithStats {
	id: number;
	plexId: number;
	username: string;
	email: string | null;
	thumb: string | null;
	isAdmin: boolean;
	createdAt: Date | null;
	totalWatchTimeMinutes: number;
	totalPlays: number;
	hasWatchHistory: boolean;
	shareMode: ShareModeType | null;
	shareModeSource: ShareModeSourceType | null;
	canUserControl: boolean;
	/**
	 * Effective access mode after clamping the stored mode by the global floor
	 * (ISSUE-007). Never more permissive than what a viewer actually gets, so the
	 * admin Users badge can't read "Public"/"Link" while access is private-oauth.
	 */
	effectiveShareMode: ShareModeType;
	/** Badge label derived from {@link effectiveShareMode} (or "Default" for default-sourced rows). */
	effectiveLabel: string;
	/** Badge CSS class derived from {@link effectiveShareMode} ('' for default-sourced rows). */
	effectiveClass: '' | 'public' | 'oauth' | 'link';
}

/**
 * Derive the badge label + CSS class for a user's share mode, clamped by the
 * global floor. Pure so it can be unit-tested without a DB or DOM. The badge
 * LABEL and CSS class both come from `effective` so they can never desync, and
 * a "Default" tag is shown ONLY for rows with no explicit per-user override.
 */
export function deriveEffectiveShareBadge(
	storedMode: ShareModeType | null,
	source: ShareModeSourceType | null,
	globalFloor: ShareModeType
): {
	effectiveShareMode: ShareModeType;
	effectiveLabel: string;
	effectiveClass: '' | 'public' | 'oauth' | 'link';
} {
	const baseMode = storedMode ?? globalFloor;
	const effectiveShareMode = getMoreRestrictiveMode(baseMode, globalFloor);

	// A default-sourced row (no explicit override) is shown as "Default" with no
	// color class — it tracks whatever the global default is.
	if (source === ShareModeSource.DEFAULT || source === null) {
		return { effectiveShareMode, effectiveLabel: 'Default', effectiveClass: '' };
	}

	switch (effectiveShareMode) {
		case ShareMode.PUBLIC:
			return { effectiveShareMode, effectiveLabel: 'Public', effectiveClass: 'public' };
		case ShareMode.PRIVATE_OAUTH:
			return { effectiveShareMode, effectiveLabel: 'OAuth', effectiveClass: 'oauth' };
		case ShareMode.PRIVATE_LINK:
			return { effectiveShareMode, effectiveLabel: 'Link', effectiveClass: 'link' };
		default:
			return { effectiveShareMode, effectiveLabel: 'Default', effectiveClass: '' };
	}
}

export interface UserBasicInfo {
	id: number;
	plexId: number;
	username: string;
	isAdmin: boolean;
}

export interface UserFullProfile {
	id: number;
	plexId: number;
	username: string;
	email: string | null;
	thumb: string | null;
	isAdmin: boolean;
	createdAt: Date | null;
}

export async function getUserCount(): Promise<number> {
	const result = await db.select({ count: sql<number>`count(*)` }).from(users);
	return result[0]?.count ?? 0;
}

/**
 * Count distinct synced viewers — the Plex accounts that appear in play history.
 * This is distinct from {@link getUserCount} (login/app accounts in `users`): a
 * fresh server commonly has one login user but many synced viewers, so the
 * dashboard surfaces both to reconcile "1 user / N plays". Single cheap
 * COUNT(DISTINCT) query, no per-row work.
 */
export async function getSyncedViewerCount(): Promise<number> {
	const result = await db
		.select({ count: sql<number>`count(distinct ${playHistory.accountId})` })
		.from(playHistory);
	return result[0]?.count ?? 0;
}

export async function getAllUsersWithStats(year: number): Promise<UserWithStats[]> {
	const yearStart = Math.floor(new Date(Date.UTC(year, 0, 1, 0, 0, 0)).getTime() / 1000);
	const yearEnd = Math.floor(new Date(Date.UTC(year, 11, 31, 23, 59, 59)).getTime() / 1000);

	const allUsers = await db.select().from(users);
	const globalFloor = await getGlobalDefaultShareMode();

	const watchTimeByUser = await db
		.select({
			accountId: playHistory.accountId,
			totalDuration: sql<number>`coalesce(sum(${playHistory.duration}), 0)`,
			totalPlays: sql<number>`count(*)`
		})
		.from(playHistory)
		.where(between(playHistory.viewedAt, yearStart, yearEnd))
		.groupBy(playHistory.accountId);

	const shareSettingsByUser = await db
		.select()
		.from(shareSettings)
		.where(eq(shareSettings.year, year));

	const watchTimeMap = new Map<number, { totalDuration: number; totalPlays: number }>();
	for (const wt of watchTimeByUser) {
		watchTimeMap.set(wt.accountId, {
			totalDuration: wt.totalDuration,
			totalPlays: wt.totalPlays
		});
	}

	const shareSettingsMap = new Map<
		number,
		{ mode: ShareModeType; modeSource: ShareModeSourceType; canUserControl: boolean }
	>();
	for (const ss of shareSettingsByUser) {
		shareSettingsMap.set(ss.userId, {
			mode: ss.mode as ShareModeType,
			modeSource: (ss.modeSource ?? ShareModeSource.EXPLICIT) as ShareModeSourceType,
			canUserControl: ss.canUserControl ?? false
		});
	}

	return allUsers.map((user) => {
		// Try accountId first (matches playHistory.accountId), then fall back to plexId
		const stats = (user.accountId !== null ? watchTimeMap.get(user.accountId) : undefined) ??
			watchTimeMap.get(user.plexId) ?? { totalDuration: 0, totalPlays: 0 };
		const settings = shareSettingsMap.get(user.id);
		const shareMode = settings?.mode ?? null;
		const shareModeSource = settings?.modeSource ?? null;
		const badge = deriveEffectiveShareBadge(shareMode, shareModeSource, globalFloor);

		return {
			id: user.id,
			plexId: user.plexId,
			username: user.username,
			email: user.email,
			thumb: user.thumb,
			isAdmin: user.isAdmin ?? false,
			createdAt: user.createdAt,
			totalWatchTimeMinutes: Math.round(stats.totalDuration / 60),
			totalPlays: stats.totalPlays,
			hasWatchHistory: stats.totalPlays > 0,
			shareMode,
			shareModeSource,
			canUserControl: settings?.canUserControl ?? false,
			effectiveShareMode: badge.effectiveShareMode,
			effectiveLabel: badge.effectiveLabel,
			effectiveClass: badge.effectiveClass
		};
	});
}

export async function getUserById(userId: number): Promise<UserBasicInfo | null> {
	const result = await db.select().from(users).where(eq(users.id, userId)).limit(1);

	const user = result[0];
	if (!user) return null;

	return {
		id: user.id,
		plexId: user.plexId,
		username: user.username,
		isAdmin: user.isAdmin ?? false
	};
}

export async function getUserFullProfile(userId: number): Promise<UserFullProfile | null> {
	const result = await db.select().from(users).where(eq(users.id, userId)).limit(1);

	const user = result[0];
	if (!user) return null;

	return {
		id: user.id,
		plexId: user.plexId,
		username: user.username,
		email: user.email,
		thumb: user.thumb,
		isAdmin: user.isAdmin ?? false,
		createdAt: user.createdAt
	};
}

export async function updateUserSharePermission(
	userId: number,
	year: number,
	canUserControl: boolean
): Promise<void> {
	const existing = await db
		.select()
		.from(shareSettings)
		.where(and(eq(shareSettings.userId, userId), eq(shareSettings.year, year)))
		.limit(1);

	if (existing[0]) {
		await db
			.update(shareSettings)
			.set({ canUserControl })
			.where(and(eq(shareSettings.userId, userId), eq(shareSettings.year, year)));
	} else {
		const defaultMode = await getGlobalDefaultShareMode();
		const shareToken = defaultMode === ShareMode.PRIVATE_LINK ? generateShareToken() : null;
		await db.insert(shareSettings).values({
			userId,
			year,
			mode: defaultMode,
			modeSource: ShareModeSource.DEFAULT,
			shareToken,
			canUserControl
		});
	}
}

export async function getAvailableYears(): Promise<number[]> {
	const result = await db
		.selectDistinct({
			year: sql<string>`strftime('%Y', ${playHistory.viewedAt}, 'unixepoch')`
		})
		.from(playHistory)
		.orderBy(sql`1 desc`);

	return result.map((r) => parseInt(r.year, 10));
}
