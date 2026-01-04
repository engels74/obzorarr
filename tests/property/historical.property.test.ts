/**
 * Property-based tests for Historical User Handling
 *
 * Feature: obzorarr, Property 23: Historical Data Preservation
 * Validates: Requirements 13.1, 13.3
 *
 * These tests verify that viewing history is preserved for users who are
 * removed from the Plex server, ensuring:
 * - Play history records exist independently of users table
 * - Server-wide statistics include all historical viewing data
 * - The getAllUsersWatchTime function includes all accountIds
 */

import { Database } from 'bun:sqlite';
import { describe, expect, it } from 'bun:test';
import { and, gte, lte, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import * as fc from 'fast-check';
import * as schema from '$lib/server/db/schema';

// =============================================================================
// Test Database Setup
// =============================================================================

/**
 * Create an in-memory test database with schema
 *
 * Note: We deliberately do NOT create a foreign key between
 * play_history.account_id and users.plex_id to ensure historical
 * data preservation (Requirements 13.1, 13.3).
 */
function createTestDatabase() {
	const sqlite = new Database(':memory:', { strict: true });

	// Enable WAL mode
	sqlite.exec('PRAGMA journal_mode = WAL');

	// Create users table
	sqlite.exec(`
		CREATE TABLE IF NOT EXISTS users (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			plex_id INTEGER UNIQUE NOT NULL,
			account_id INTEGER,
			username TEXT NOT NULL,
			email TEXT,
			thumb TEXT,
			is_admin INTEGER DEFAULT 0,
			created_at INTEGER
		)
	`);

	// Create play_history table WITHOUT foreign key to users
	// This is intentional for historical data preservation
	sqlite.exec(`
		CREATE TABLE IF NOT EXISTS play_history (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			history_key TEXT UNIQUE NOT NULL,
			rating_key TEXT NOT NULL,
			title TEXT NOT NULL,
			type TEXT NOT NULL,
			viewed_at INTEGER NOT NULL,
			account_id INTEGER NOT NULL,
			library_section_id INTEGER NOT NULL,
			thumb TEXT,
			duration INTEGER,
			grandparent_title TEXT,
			grandparent_rating_key TEXT,
			grandparent_thumb TEXT,
			parent_title TEXT,
			genres TEXT,
			release_year INTEGER
		)
	`);

	return drizzle(sqlite, { schema });
}

// =============================================================================
// Test Types
// =============================================================================

interface YearFilter {
	year: number;
	startTimestamp: number;
	endTimestamp: number;
}

/**
 * Create a year filter for a given year
 */
function createYearFilter(year: number): YearFilter {
	const startTimestamp = Math.floor(new Date(Date.UTC(year, 0, 1, 0, 0, 0)).getTime() / 1000);
	const endTimestamp = Math.floor(new Date(Date.UTC(year, 11, 31, 23, 59, 59)).getTime() / 1000);
	return { year, startTimestamp, endTimestamp };
}

/**
 * Get all users' total watch times for a year from the database
 * (Simplified version for testing - mirrors the real implementation)
 */
async function getAllUsersWatchTime(
	db: ReturnType<typeof createTestDatabase>,
	yearFilter: YearFilter
): Promise<Map<number, number>> {
	const results = await db
		.select({
			accountId: schema.playHistory.accountId,
			totalSeconds: sql<number>`COALESCE(SUM(${schema.playHistory.duration}), 0)`.as(
				'total_seconds'
			)
		})
		.from(schema.playHistory)
		.where(
			and(
				gte(schema.playHistory.viewedAt, yearFilter.startTimestamp),
				lte(schema.playHistory.viewedAt, yearFilter.endTimestamp)
			)
		)
		.groupBy(schema.playHistory.accountId);

	const watchTimeMap = new Map<number, number>();
	for (const row of results) {
		const totalMinutes = row.totalSeconds / 60;
		watchTimeMap.set(row.accountId, totalMinutes);
	}

	return watchTimeMap;
}

// =============================================================================
// Arbitraries
// =============================================================================

/**
 * Arbitrary for generating play history records
 */
const playHistoryArbitrary = fc.record({
	historyKey: fc.uuid(),
	ratingKey: fc.string({ minLength: 1, maxLength: 20 }),
	title: fc.string({ minLength: 1, maxLength: 100 }),
	type: fc.constantFrom('movie', 'episode'),
	viewedAt: fc.integer({ min: 1704067200, max: 1735689599 }), // 2024 year range
	accountId: fc.integer({ min: 1, max: 10000 }),
	librarySectionId: fc.integer({ min: 1, max: 100 }),
	thumb: fc.option(fc.webUrl(), { nil: null }),
	duration: fc.integer({ min: 60, max: 14400 }), // 1 min to 4 hours in seconds
	grandparentTitle: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: null }),
	parentTitle: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: null })
});

/**
 * Arbitrary for generating unique play history records (unique historyKeys)
 */
const uniquePlayHistoryArrayArbitrary = fc
	.array(playHistoryArbitrary, { minLength: 1, maxLength: 50 })
	.map((records) => {
		// Ensure unique historyKeys by appending index
		return records.map((record, index) => ({
			...record,
			historyKey: `${record.historyKey}-${index}`
		}));
	});

/**
 * Arbitrary for generating user records
 */
const userArbitrary = fc.record({
	plexId: fc.integer({ min: 1, max: 10000 }),
	username: fc.string({ minLength: 1, maxLength: 50 }),
	email: fc.option(fc.emailAddress(), { nil: null }),
	thumb: fc.option(fc.webUrl(), { nil: null }),
	isAdmin: fc.boolean()
});

// =============================================================================
// Property 23: Historical Data Preservation
// =============================================================================

// Feature: obzorarr, Property 23: Historical Data Preservation
describe('Property 23: Historical Data Preservation', () => {
	it('play history records can be inserted without corresponding users entry', async () => {
		await fc.assert(
			fc.asyncProperty(uniquePlayHistoryArrayArbitrary, async (records) => {
				const db = createTestDatabase();

				// Insert play history records with NO corresponding users
				await db
					.insert(schema.playHistory)
					.values(records)
					.onConflictDoNothing({ target: schema.playHistory.historyKey });

				// Query back the records - they should exist
				const storedRecords = await db.select().from(schema.playHistory);

				// All records should be stored successfully
				expect(storedRecords.length).toBe(records.length);

				// Verify the users table is empty (no FK constraint violation)
				const storedUsers = await db.select().from(schema.users);
				expect(storedUsers.length).toBe(0);

				return true;
			}),
			{ numRuns: 100 }
		);
	});

	it('play history accountIds need not match any users.plexId', async () => {
		await fc.assert(
			fc.asyncProperty(
				uniquePlayHistoryArrayArbitrary,
				fc.array(userArbitrary, { minLength: 1, maxLength: 10 }),
				async (historyRecords, userRecords) => {
					const db = createTestDatabase();

					// Make user plexIds unique
					const uniqueUsers = userRecords.map((user, index) => ({
						...user,
						plexId: 100000 + index // Ensure plexIds don't overlap with accountIds
					}));

					// Insert users first
					await db.insert(schema.users).values(uniqueUsers);

					// Insert play history with accountIds that DON'T match any users.plexId
					// (accountIds are in range 1-10000, plexIds are 100000+)
					await db
						.insert(schema.playHistory)
						.values(historyRecords)
						.onConflictDoNothing({ target: schema.playHistory.historyKey });

					// Both should exist independently
					const storedHistory = await db.select().from(schema.playHistory);
					const storedUsers = await db.select().from(schema.users);

					expect(storedHistory.length).toBe(historyRecords.length);
					expect(storedUsers.length).toBe(uniqueUsers.length);

					// Verify no overlap between accountIds and plexIds
					const accountIds = new Set(storedHistory.map((h) => h.accountId));
					const plexIds = new Set(storedUsers.map((u) => u.plexId));

					for (const accountId of accountIds) {
						expect(plexIds.has(accountId)).toBe(false);
					}

					return true;
				}
			),
			{ numRuns: 100 }
		);
	});

	it('getAllUsersWatchTime includes all accountIds from play_history regardless of users table', async () => {
		await fc.assert(
			fc.asyncProperty(uniquePlayHistoryArrayArbitrary, async (records) => {
				const db = createTestDatabase();

				// Insert play history records (NO users)
				await db
					.insert(schema.playHistory)
					.values(records)
					.onConflictDoNothing({ target: schema.playHistory.historyKey });

				// Get all unique accountIds from records
				const expectedAccountIds = new Set(records.map((r) => r.accountId));

				// Call getAllUsersWatchTime
				const yearFilter = createYearFilter(2024);
				const watchTimeMap = await getAllUsersWatchTime(db, yearFilter);

				// Verify all accountIds are present in the result
				for (const accountId of expectedAccountIds) {
					expect(watchTimeMap.has(accountId)).toBe(true);
				}

				// Verify the map size matches unique accountIds
				expect(watchTimeMap.size).toBe(expectedAccountIds.size);

				return true;
			}),
			{ numRuns: 100 }
		);
	});

	it('total watch time calculation includes records from all accountIds', async () => {
		await fc.assert(
			fc.asyncProperty(uniquePlayHistoryArrayArbitrary, async (records) => {
				const db = createTestDatabase();

				// Insert records
				await db
					.insert(schema.playHistory)
					.values(records)
					.onConflictDoNothing({ target: schema.playHistory.historyKey });

				// Calculate expected total watch time
				const expectedTotalSeconds = records.reduce((sum, r) => sum + (r.duration ?? 0), 0);
				const expectedTotalMinutes = expectedTotalSeconds / 60;

				// Get watch times from database
				const yearFilter = createYearFilter(2024);
				const watchTimeMap = await getAllUsersWatchTime(db, yearFilter);

				// Sum all watch times
				let actualTotalMinutes = 0;
				for (const minutes of watchTimeMap.values()) {
					actualTotalMinutes += minutes;
				}

				// Total should match (allow for small floating point differences)
				expect(Math.abs(actualTotalMinutes - expectedTotalMinutes)).toBeLessThan(0.001);

				return true;
			}),
			{ numRuns: 100 }
		);
	});

	it('server-wide stats query includes records from removed users (users with no entry in users table)', async () => {
		await fc.assert(
			fc.asyncProperty(
				uniquePlayHistoryArrayArbitrary,
				fc.array(userArbitrary, { minLength: 1, maxLength: 5 }),
				async (historyRecords, _userRecords) => {
					const db = createTestDatabase();

					// Split history records: some with matching users, some without
					const halfIndex = Math.floor(historyRecords.length / 2);
					const recordsWithUsers = historyRecords.slice(0, halfIndex);
					const _recordsWithoutUsers = historyRecords.slice(halfIndex);

					// Create users with specific plexIds matching some accountIds
					const usersToInsert = recordsWithUsers
						.slice(0, Math.min(3, recordsWithUsers.length))
						.map((record, _index) => ({
							plexId: record.accountId,
							username: `User_${record.accountId}`,
							email: null,
							thumb: null,
							isAdmin: false
						}));

					// Ensure unique plexIds
					const uniqueUsers = usersToInsert.filter(
						(user, index, self) => self.findIndex((u) => u.plexId === user.plexId) === index
					);

					if (uniqueUsers.length > 0) {
						await db.insert(schema.users).values(uniqueUsers);
					}

					// Insert ALL play history records
					await db
						.insert(schema.playHistory)
						.values(historyRecords)
						.onConflictDoNothing({ target: schema.playHistory.historyKey });

					// Simulate server stats query (queries play_history directly, not joined with users)
					const yearFilter = createYearFilter(2024);
					const allRecords = await db
						.select()
						.from(schema.playHistory)
						.where(
							and(
								gte(schema.playHistory.viewedAt, yearFilter.startTimestamp),
								lte(schema.playHistory.viewedAt, yearFilter.endTimestamp)
							)
						);

					// Calculate total plays and watch time
					const totalPlays = allRecords.length;
					const totalWatchTimeSeconds = allRecords.reduce((sum, r) => sum + (r.duration ?? 0), 0);

					// Expected values from input records
					const expectedPlays = historyRecords.length;
					const expectedWatchTimeSeconds = historyRecords.reduce(
						(sum, r) => sum + (r.duration ?? 0),
						0
					);

					// Server stats should include ALL records, not just those with users
					expect(totalPlays).toBe(expectedPlays);
					expect(totalWatchTimeSeconds).toBe(expectedWatchTimeSeconds);

					return true;
				}
			),
			{ numRuns: 100 }
		);
	});

	it('user count from play_history is independent of users table', async () => {
		await fc.assert(
			fc.asyncProperty(uniquePlayHistoryArrayArbitrary, async (records) => {
				const db = createTestDatabase();

				// Insert play history (no users)
				await db
					.insert(schema.playHistory)
					.values(records)
					.onConflictDoNothing({ target: schema.playHistory.historyKey });

				// Count unique accountIds from play_history
				const yearFilter = createYearFilter(2024);
				const watchTimeMap = await getAllUsersWatchTime(db, yearFilter);
				const userCountFromHistory = watchTimeMap.size;

				// Count users in users table
				const usersResult = await db.select().from(schema.users);
				const userCountFromTable = usersResult.length;

				// These should be different - play_history has users, users table is empty
				expect(userCountFromTable).toBe(0);
				expect(userCountFromHistory).toBeGreaterThan(0);

				// The user count from history should match unique accountIds
				const uniqueAccountIds = new Set(records.map((r) => r.accountId));
				expect(userCountFromHistory).toBe(uniqueAccountIds.size);

				return true;
			}),
			{ numRuns: 100 }
		);
	});
});

// =============================================================================
// Unit Tests for Historical User Handling Edge Cases
// =============================================================================

describe('Historical User Data Edge Cases', () => {
	it('play history persists when user entry is deleted', async () => {
		const db = createTestDatabase();

		// Create a user
		await db.insert(schema.users).values({
			plexId: 12345,
			username: 'TestUser',
			email: 'test@example.com',
			isAdmin: false
		});

		// Create play history for this user
		await db.insert(schema.playHistory).values({
			historyKey: 'test-history-1',
			ratingKey: 'rating-1',
			title: 'Test Movie',
			type: 'movie',
			viewedAt: 1704067200,
			accountId: 12345, // Same as plexId
			librarySectionId: 1,
			duration: 7200
		});

		// Verify both exist
		let users = await db.select().from(schema.users);
		let history = await db.select().from(schema.playHistory);
		expect(users.length).toBe(1);
		expect(history.length).toBe(1);

		// Delete the user
		await db.delete(schema.users).where(sql`plex_id = 12345`);

		// Verify user is deleted but history remains
		users = await db.select().from(schema.users);
		history = await db.select().from(schema.playHistory);
		expect(users.length).toBe(0);
		expect(history.length).toBe(1);
		expect(history[0]?.accountId).toBe(12345);
	});

	it('re-authenticated user can be matched to historical data via plexId/accountId', async () => {
		const db = createTestDatabase();

		const plexId = 54321;

		// Create historical play history (user not in users table)
		await db.insert(schema.playHistory).values({
			historyKey: 'historical-watch-1',
			ratingKey: 'rating-1',
			title: 'Old Movie',
			type: 'movie',
			viewedAt: 1704067200,
			accountId: plexId,
			librarySectionId: 1,
			duration: 7200
		});

		// Verify no user exists
		const users = await db.select().from(schema.users);
		expect(users.length).toBe(0);

		// Simulate re-authentication (user rejoins Plex server)
		await db.insert(schema.users).values({
			plexId: plexId,
			username: 'ReturningUser',
			email: 'returning@example.com',
			isAdmin: false
		});

		// Now we can query play history for this user by matching plexId to accountId
		const userHistory = await db
			.select()
			.from(schema.playHistory)
			.where(sql`account_id = ${plexId}`);

		// User's historical data should be accessible
		expect(userHistory.length).toBe(1);
		expect(userHistory[0]?.title).toBe('Old Movie');
	});

	it('topViewers fallback shows User {accountId} for accounts not in users table', async () => {
		const db = createTestDatabase();

		// Insert user for accountId 1
		await db.insert(schema.users).values({
			plexId: 1,
			username: 'ActiveUser',
			isAdmin: false
		});

		// Insert play history for accountId 1 (in users) and accountId 999 (not in users)
		await db.insert(schema.playHistory).values([
			{
				historyKey: 'active-user-watch',
				ratingKey: 'rating-1',
				title: 'Movie 1',
				type: 'movie',
				viewedAt: 1704067200,
				accountId: 1,
				librarySectionId: 1,
				duration: 3600
			},
			{
				historyKey: 'removed-user-watch',
				ratingKey: 'rating-2',
				title: 'Movie 2',
				type: 'movie',
				viewedAt: 1704067200,
				accountId: 999,
				librarySectionId: 1,
				duration: 7200
			}
		]);

		// Get all users from users table
		const usersResult = await db.select().from(schema.users);
		// Build userMap with dual-key lookup (matching engine.ts behavior)
		const userMap = new Map<number, string>();
		for (const user of usersResult) {
			// Register by accountId if set
			if (user.accountId !== null) {
				userMap.set(user.accountId, user.username);
			}
			// Also register by plexId for backward compatibility
			if (!userMap.has(user.plexId)) {
				userMap.set(user.plexId, user.username);
			}
		}

		// Get watch times by accountId
		const yearFilter = createYearFilter(2024);
		const watchTimeMap = await getAllUsersWatchTime(db, yearFilter);

		// Build top viewers with fallback (simulating engine.ts behavior)
		const topViewers: Array<{ accountId: number; username: string; minutes: number }> = [];
		for (const [accountId, minutes] of watchTimeMap.entries()) {
			const username = userMap.get(accountId) ?? `User ${accountId}`;
			topViewers.push({ accountId, username, minutes });
		}

		// Sort by minutes descending
		topViewers.sort((a, b) => b.minutes - a.minutes);

		// Verify fallback username for removed user
		expect(topViewers.length).toBe(2);
		expect(topViewers[0]?.accountId).toBe(999);
		expect(topViewers[0]?.username).toBe('User 999'); // Fallback for accounts not in plex_accounts or users
		expect(topViewers[1]?.accountId).toBe(1);
		expect(topViewers[1]?.username).toBe('ActiveUser'); // Real name from users table
	});
});
