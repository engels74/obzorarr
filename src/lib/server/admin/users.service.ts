import { db } from '$lib/server/db/client';
import { users, playHistory, shareSettings } from '$lib/server/db/schema';
import { eq, sql, and, between } from 'drizzle-orm';
import type { ShareModeType } from '$lib/server/sharing/types';

export interface UserWithStats {
	id: number;
	plexId: number;
	username: string;
	email: string | null;
	thumb: string | null;
	isAdmin: boolean;
	createdAt: Date | null;
	totalWatchTimeMinutes: number;
	shareMode: ShareModeType | null;
	canUserControl: boolean;
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

export async function getAllUsersWithStats(year: number): Promise<UserWithStats[]> {
	const yearStart = Math.floor(new Date(Date.UTC(year, 0, 1, 0, 0, 0)).getTime() / 1000);
	const yearEnd = Math.floor(new Date(Date.UTC(year, 11, 31, 23, 59, 59)).getTime() / 1000);

	const allUsers = await db.select().from(users);

	const watchTimeByUser = await db
		.select({
			accountId: playHistory.accountId,
			totalDuration: sql<number>`coalesce(sum(${playHistory.duration}), 0)`
		})
		.from(playHistory)
		.where(between(playHistory.viewedAt, yearStart, yearEnd))
		.groupBy(playHistory.accountId);

	const shareSettingsByUser = await db
		.select()
		.from(shareSettings)
		.where(eq(shareSettings.year, year));

	const watchTimeMap = new Map<number, number>();
	for (const wt of watchTimeByUser) {
		watchTimeMap.set(wt.accountId, wt.totalDuration);
	}

	const shareSettingsMap = new Map<number, { mode: ShareModeType; canUserControl: boolean }>();
	for (const ss of shareSettingsByUser) {
		shareSettingsMap.set(ss.userId, {
			mode: ss.mode as ShareModeType,
			canUserControl: ss.canUserControl ?? false
		});
	}

	return allUsers.map((user) => {
		// Try accountId first (matches playHistory.accountId), then fall back to plexId
		// This handles the accountId/plexId mismatch for server owners
		const watchTimeSeconds =
			(user.accountId !== null ? watchTimeMap.get(user.accountId) : undefined) ??
			watchTimeMap.get(user.plexId) ??
			0;
		const settings = shareSettingsMap.get(user.id);

		return {
			id: user.id,
			plexId: user.plexId,
			username: user.username,
			email: user.email,
			thumb: user.thumb,
			isAdmin: user.isAdmin ?? false,
			createdAt: user.createdAt,
			totalWatchTimeMinutes: Math.round(watchTimeSeconds / 60),
			shareMode: settings?.mode ?? null,
			canUserControl: settings?.canUserControl ?? false
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
		await db.insert(shareSettings).values({
			userId,
			year,
			mode: 'public',
			canUserControl
		});
	}
}

export async function getAvailableYears(): Promise<number[]> {
	const result = await db
		.selectDistinct({
			year: sql<number>`strftime('%Y', ${playHistory.viewedAt}, 'unixepoch')`
		})
		.from(playHistory)
		.orderBy(sql`1 desc`);

	return result.map((r) => r.year);
}
