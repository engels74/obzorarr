import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	plexId: integer('plex_id').unique().notNull(),
	/** Local Plex account ID for matching playHistory.accountId. Differs from plexId (Plex.tv ID). */
	accountId: integer('account_id'),
	username: text('username').notNull(),
	email: text('email'),
	thumb: text('thumb'),
	isAdmin: integer('is_admin', { mode: 'boolean' }).default(false),
	createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date())
});

/**
 * Play history table. accountId is NOT a foreign key to preserve historical data
 * when users are removed from Plex server.
 */
export const playHistory = sqliteTable(
	'play_history',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		historyKey: text('history_key').unique().notNull(),
		ratingKey: text('rating_key').notNull(),
		title: text('title').notNull(),
		type: text('type').notNull(),
		viewedAt: integer('viewed_at').notNull(),
		accountId: integer('account_id').notNull(),
		librarySectionId: integer('library_section_id').notNull(),
		thumb: text('thumb'),
		duration: integer('duration'),
		grandparentTitle: text('grandparent_title'),
		parentTitle: text('parent_title'),
		genres: text('genres')
	},
	(table) => [index('idx_play_history_rating_key').on(table.ratingKey)]
);

export const syncStatus = sqliteTable('sync_status', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	startedAt: integer('started_at', { mode: 'timestamp' }).notNull(),
	completedAt: integer('completed_at', { mode: 'timestamp' }),
	recordsProcessed: integer('records_processed').default(0),
	lastViewedAt: integer('last_viewed_at'),
	status: text('status').notNull(),
	error: text('error')
});

export const cachedStats = sqliteTable('cached_stats', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	userId: integer('user_id'),
	year: integer('year').notNull(),
	statsType: text('stats_type').notNull(),
	statsJson: text('stats_json').notNull(),
	calculatedAt: integer('calculated_at', { mode: 'timestamp' }).$defaultFn(() => new Date())
});

export const shareSettings = sqliteTable('share_settings', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	userId: integer('user_id').notNull(),
	year: integer('year').notNull(),
	mode: text('mode').notNull().default('public'),
	shareToken: text('share_token').unique(),
	canUserControl: integer('can_user_control', { mode: 'boolean' }).default(false),
	showLogo: integer('show_logo', { mode: 'boolean' })
});

export const customSlides = sqliteTable('custom_slides', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	title: text('title').notNull(),
	content: text('content').notNull(),
	enabled: integer('enabled', { mode: 'boolean' }).default(true),
	sortOrder: integer('sort_order').notNull(),
	year: integer('year')
});

export const slideConfig = sqliteTable('slide_config', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	slideType: text('slide_type').notNull(),
	enabled: integer('enabled', { mode: 'boolean' }).default(true),
	sortOrder: integer('sort_order').notNull()
});

export const appSettings = sqliteTable('app_settings', {
	key: text('key').primaryKey(),
	value: text('value').notNull()
});

export const sessions = sqliteTable('sessions', {
	id: text('id').primaryKey(),
	userId: integer('user_id').notNull(),
	plexToken: text('plex_token').notNull(),
	isAdmin: integer('is_admin', { mode: 'boolean' }).default(false),
	expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull()
});

export const logs = sqliteTable(
	'logs',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		level: text('level').notNull(),
		message: text('message').notNull(),
		source: text('source'),
		metadata: text('metadata'),
		timestamp: integer('timestamp').notNull()
	},
	(table) => [
		index('idx_logs_timestamp').on(table.timestamp),
		index('idx_logs_level').on(table.level),
		index('idx_logs_level_timestamp').on(table.level, table.timestamp)
	]
);

/** Caches Plex server member info for displaying usernames in statistics. */
export const plexAccounts = sqliteTable('plex_accounts', {
	accountId: integer('account_id').primaryKey(),
	plexId: integer('plex_id').notNull(),
	username: text('username').notNull(),
	thumb: text('thumb'),
	isOwner: integer('is_owner', { mode: 'boolean' }).default(false),
	updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date())
});

/** Caches media metadata from Plex to reduce API calls during enrichment. */
export const metadataCache = sqliteTable('metadata_cache', {
	ratingKey: text('rating_key').primaryKey(),
	duration: integer('duration'),
	genres: text('genres'),
	fetchedAt: integer('fetched_at').notNull(),
	fetchFailed: integer('fetch_failed', { mode: 'boolean' }).default(false)
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
