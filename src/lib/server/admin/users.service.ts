import { db } from '$lib/server/db/client';
import { users, playHistory, shareSettings } from '$lib/server/db/schema';
import { eq, sql, and, between } from 'drizzle-orm';
import type { ShareModeType } from '$lib/server/sharing/types';

/**
 * Admin Users Service
 *
 * Provides user management functionality for the admin panel.
 *
 * Implements Requirements:
 * - 11.2: User management with per-user permission settings
 * - 11.7: Preview user wrapped without affecting settings
 */

// =============================================================================
// Types
// =============================================================================

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

// =============================================================================
// User Queries
// =============================================================================

/**
 * Get count of all users
 *
 * @returns Total number of users in the system
 */
export async function getUserCount(): Promise<number> {
	const result = await db.select({ count: sql<number>`count(*)` }).from(users);
	return result[0]?.count ?? 0;
}

/**
 * Get all users with their watch time stats and share settings for a specific year
 *
 * @param year - The year to calculate watch time for
 * @returns Array of users with aggregated stats
 */
export async function getAllUsersWithStats(year: number): Promise<UserWithStats[]> {
	// Get year boundaries (Unix timestamps)
	const yearStart = Math.floor(new Date(Date.UTC(year, 0, 1, 0, 0, 0)).getTime() / 1000);
	const yearEnd = Math.floor(new Date(Date.UTC(year, 11, 31, 23, 59, 59)).getTime() / 1000);

	// Get all users
	const allUsers = await db.select().from(users);

	// Get watch time per user for the year
	const watchTimeByUser = await db
		.select({
			accountId: playHistory.accountId,
			totalDuration: sql<number>`coalesce(sum(${playHistory.duration}), 0)`
		})
		.from(playHistory)
		.where(between(playHistory.viewedAt, yearStart, yearEnd))
		.groupBy(playHistory.accountId);

	// Get share settings per user for the year
	const shareSettingsByUser = await db
		.select()
		.from(shareSettings)
		.where(eq(shareSettings.year, year));

	// Build lookup maps
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

	// Combine user data with stats
	return allUsers.map((user) => {
		const watchTimeSeconds = watchTimeMap.get(user.plexId) ?? 0;
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

/**
 * Get basic user info by ID
 *
 * @param userId - The user's database ID
 * @returns User basic info or null if not found
 */
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

/**
 * Update user's share control permission for a specific year
 *
 * @param userId - The user's database ID
 * @param year - The year to update settings for
 * @param canUserControl - Whether the user can control their own share settings
 */
export async function updateUserSharePermission(
	userId: number,
	year: number,
	canUserControl: boolean
): Promise<void> {
	// Check if share settings exist for this user/year
	const existing = await db
		.select()
		.from(shareSettings)
		.where(and(eq(shareSettings.userId, userId), eq(shareSettings.year, year)))
		.limit(1);

	if (existing[0]) {
		// Update existing
		await db
			.update(shareSettings)
			.set({ canUserControl })
			.where(and(eq(shareSettings.userId, userId), eq(shareSettings.year, year)));
	} else {
		// Insert new with default share mode
		await db.insert(shareSettings).values({
			userId,
			year,
			mode: 'public',
			canUserControl
		});
	}
}

/**
 * Get available years from play history
 *
 * @returns Array of years that have play history data
 */
export async function getAvailableYears(): Promise<number[]> {
	const result = await db
		.selectDistinct({
			year: sql<number>`strftime('%Y', ${playHistory.viewedAt}, 'unixepoch')`
		})
		.from(playHistory)
		.orderBy(sql`1 desc`);

	return result.map((r) => r.year);
}
