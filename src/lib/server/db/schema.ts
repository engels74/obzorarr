import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

/**
 * Plex users table
 * Stores user information from Plex OAuth
 */
export const users = sqliteTable('users', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	plexId: integer('plex_id').unique().notNull(),
	username: text('username').notNull(),
	email: text('email'),
	thumb: text('thumb'),
	isAdmin: integer('is_admin', { mode: 'boolean' }).default(false),
	createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date())
});

/**
 * Play history table
 * Stores viewing history from Plex sync
 */
export const playHistory = sqliteTable('play_history', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	historyKey: text('history_key').unique().notNull(),
	ratingKey: text('rating_key').notNull(),
	title: text('title').notNull(),
	type: text('type').notNull(), // 'movie', 'episode', etc.
	viewedAt: integer('viewed_at').notNull(), // Unix timestamp
	accountId: integer('account_id').notNull(),
	librarySectionId: integer('library_section_id').notNull(),
	thumb: text('thumb'),
	duration: integer('duration'), // Duration in seconds
	grandparentTitle: text('grandparent_title'), // Show name for episodes
	parentTitle: text('parent_title') // Season name for episodes
});

/**
 * Sync status table
 * Tracks synchronization operations
 */
export const syncStatus = sqliteTable('sync_status', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	startedAt: integer('started_at', { mode: 'timestamp' }).notNull(),
	completedAt: integer('completed_at', { mode: 'timestamp' }),
	recordsProcessed: integer('records_processed').default(0),
	lastViewedAt: integer('last_viewed_at'), // Unix timestamp of most recent viewedAt
	status: text('status').notNull(), // 'running', 'completed', 'failed'
	error: text('error')
});

/**
 * Cached stats table
 * Stores pre-calculated statistics for performance
 */
export const cachedStats = sqliteTable('cached_stats', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	userId: integer('user_id'), // null for server-wide stats
	year: integer('year').notNull(),
	statsType: text('stats_type').notNull(), // 'user', 'server'
	statsJson: text('stats_json').notNull(), // JSON-serialized stats
	calculatedAt: integer('calculated_at', { mode: 'timestamp' }).$defaultFn(() => new Date())
});

/**
 * Share settings table
 * Controls wrapped page visibility
 */
export const shareSettings = sqliteTable('share_settings', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	userId: integer('user_id').notNull(),
	year: integer('year').notNull(),
	mode: text('mode').notNull().default('public'), // 'public', 'private-oauth', 'private-link'
	shareToken: text('share_token').unique(),
	canUserControl: integer('can_user_control', { mode: 'boolean' }).default(false)
});

/**
 * Custom slides table
 * Admin-created markdown slides
 */
export const customSlides = sqliteTable('custom_slides', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	title: text('title').notNull(),
	content: text('content').notNull(), // Markdown content
	enabled: integer('enabled', { mode: 'boolean' }).default(true),
	sortOrder: integer('sort_order').notNull(),
	year: integer('year') // null for all years
});

/**
 * Slide configuration table
 * Controls which slides are shown and their order
 */
export const slideConfig = sqliteTable('slide_config', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	slideType: text('slide_type').notNull(), // 'total-time', 'top-movies', etc.
	enabled: integer('enabled', { mode: 'boolean' }).default(true),
	sortOrder: integer('sort_order').notNull()
});

/**
 * App settings table
 * Key-value store for application configuration
 */
export const appSettings = sqliteTable('app_settings', {
	key: text('key').primaryKey(),
	value: text('value').notNull()
});

/**
 * Sessions table
 * User authentication sessions
 */
export const sessions = sqliteTable('sessions', {
	id: text('id').primaryKey(),
	userId: integer('user_id').notNull(),
	plexToken: text('plex_token').notNull(),
	isAdmin: integer('is_admin', { mode: 'boolean' }).default(false),
	expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull()
});

// Export table types for type inference
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type PlayHistoryRecord = typeof playHistory.$inferSelect;
export type NewPlayHistoryRecord = typeof playHistory.$inferInsert;
export type SyncStatusRecord = typeof syncStatus.$inferSelect;
export type CachedStatsRecord = typeof cachedStats.$inferSelect;
export type ShareSettingsRecord = typeof shareSettings.$inferSelect;
export type CustomSlideRecord = typeof customSlides.$inferSelect;
export type SlideConfigRecord = typeof slideConfig.$inferSelect;
export type AppSettingRecord = typeof appSettings.$inferSelect;
export type SessionRecord = typeof sessions.$inferSelect;
