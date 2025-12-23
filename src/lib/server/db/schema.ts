import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

/**
 * Plex users table
 * Stores user information from Plex OAuth
 */
export const users = sqliteTable('users', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	plexId: integer('plex_id').unique().notNull(),
	/**
	 * The Plex server's local account ID for this user.
	 *
	 * This is used to match viewing history in playHistory.accountId.
	 * For shared users, this typically equals plexId.
	 * For server owners, this is often 1 (the local admin account ID).
	 *
	 * Note: This differs from plexId which is the Plex.tv account ID
	 * used for OAuth authentication.
	 */
	accountId: integer('account_id'),
	username: text('username').notNull(),
	email: text('email'),
	thumb: text('thumb'),
	isAdmin: integer('is_admin', { mode: 'boolean' }).default(false),
	createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date())
});

/**
 * Play history table
 * Stores viewing history from Plex sync
 *
 * Historical Data Preservation (Requirements 13.1, 13.3):
 * The accountId field is intentionally NOT a foreign key to users.plexId.
 * This design ensures that viewing history is preserved when users are
 * removed from the Plex server, allowing:
 * - Server-wide statistics to include all historical viewing data
 * - Re-authenticated users to regain access to their wrapped pages
 */
export const playHistory = sqliteTable(
	'play_history',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		historyKey: text('history_key').unique().notNull(),
		ratingKey: text('rating_key').notNull(),
		title: text('title').notNull(),
		type: text('type').notNull(), // 'movie', 'episode', etc.
		viewedAt: integer('viewed_at').notNull(), // Unix timestamp
		/**
		 * Plex account ID of the user who viewed this content.
		 *
		 * IMPORTANT: This field is intentionally NOT a foreign key to users.plexId.
		 * This design ensures historical data preservation (Requirements 13.1, 13.3):
		 * - Viewing history remains in database when users are removed from Plex server
		 * - Server-wide statistics include all historical viewing data
		 * - When removed users re-authenticate, their plexId matches this accountId
		 *
		 * The accountId value comes from Plex's accountID in the history API response.
		 */
		accountId: integer('account_id').notNull(),
		librarySectionId: integer('library_section_id').notNull(),
		thumb: text('thumb'),
		duration: integer('duration'), // Duration in seconds
		grandparentTitle: text('grandparent_title'), // Show name for episodes
		parentTitle: text('parent_title'), // Season name for episodes
		genres: text('genres') // JSON array of genre names, e.g., '["Action", "Drama"]'
	},
	(table) => [index('idx_play_history_rating_key').on(table.ratingKey)]
);

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
 * Controls wrapped page visibility and user preferences
 */
export const shareSettings = sqliteTable('share_settings', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	userId: integer('user_id').notNull(),
	year: integer('year').notNull(),
	mode: text('mode').notNull().default('public'), // 'public', 'private-oauth', 'private-link'
	shareToken: text('share_token').unique(),
	canUserControl: integer('can_user_control', { mode: 'boolean' }).default(false),
	showLogo: integer('show_logo', { mode: 'boolean' }) // null = inherit from global setting
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

/**
 * Application logs table
 * Stores persistent logs for admin viewing
 */
export const logs = sqliteTable(
	'logs',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		level: text('level').notNull(), // 'DEBUG', 'INFO', 'WARN', 'ERROR'
		message: text('message').notNull(),
		source: text('source'), // Component name (e.g., 'Scheduler', 'Sync')
		metadata: text('metadata'), // JSON-serialized additional data
		timestamp: integer('timestamp').notNull() // Unix timestamp in ms
	},
	(table) => [
		index('idx_logs_timestamp').on(table.timestamp),
		index('idx_logs_level').on(table.level),
		index('idx_logs_level_timestamp').on(table.level, table.timestamp)
	]
);

/**
 * Plex accounts table
 * Caches Plex server member information for displaying usernames in statistics.
 * This stores ALL server members (owner + shared users), not just those who've authenticated.
 * Updated during sync to ensure Top Contributors shows real Plex usernames.
 */
export const plexAccounts = sqliteTable('plex_accounts', {
	/**
	 * The local Plex account ID used in playHistory.accountId.
	 * For shared users, this equals their plexId.
	 * For the server owner, this is typically 1.
	 */
	accountId: integer('account_id').primaryKey(),
	/** The Plex.tv account ID (for reference/linking to users table) */
	plexId: integer('plex_id').notNull(),
	/** The user's Plex username */
	username: text('username').notNull(),
	/** Avatar thumbnail URL */
	thumb: text('thumb'),
	/** Whether this is the server owner */
	isOwner: integer('is_owner', { mode: 'boolean' }).default(false),
	/** When this record was last updated */
	updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date())
});

/**
 * Metadata cache table
 * Caches media metadata fetched from Plex to reduce API calls during enrichment.
 * Metadata (duration, genres) rarely changes, so caching is safe.
 */
export const metadataCache = sqliteTable('metadata_cache', {
	ratingKey: text('rating_key').primaryKey(),
	duration: integer('duration'), // Duration in seconds
	genres: text('genres'), // JSON array of genre names
	fetchedAt: integer('fetched_at').notNull(), // Unix timestamp when fetched
	fetchFailed: integer('fetch_failed', { mode: 'boolean' }).default(false) // True if API fetch failed
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
export type LogRecord = typeof logs.$inferSelect;
export type NewLogRecord = typeof logs.$inferInsert;
export type MetadataCacheRecord = typeof metadataCache.$inferSelect;
export type NewMetadataCacheRecord = typeof metadataCache.$inferInsert;
export type PlexAccountRecord = typeof plexAccounts.$inferSelect;
export type NewPlexAccountRecord = typeof plexAccounts.$inferInsert;
