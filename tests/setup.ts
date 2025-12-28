/**
 * Test setup file for Obzorarr
 *
 * This file is preloaded before all tests run.
 * Use it for global test configuration, mocks, and utilities.
 */

import { mock } from 'bun:test';

// Ensure tests run in a clean environment
process.env.NODE_ENV = 'test';

// Set a test database path to avoid conflicts with development database
process.env.DATABASE_PATH = ':memory:';

// Mock SvelteKit's $env/dynamic/private module for tests
mock.module('$env/dynamic/private', () => ({
	env: {
		PLEX_SERVER_URL: 'http://test-plex-server:32400',
		PLEX_TOKEN: 'test-plex-token',
		OPENAI_API_KEY: '',
		OPENAI_API_URL: '',
		OPENAI_MODEL: ''
	}
}));

// Mock SvelteKit's $env/static/private module for tests
mock.module('$env/static/private', () => ({
	PLEX_SERVER_URL: 'http://test-plex-server:32400',
	PLEX_TOKEN: 'test-plex-token'
}));

// Import database client DYNAMICALLY after setting environment variables
// NOTE: Static imports are hoisted and execute BEFORE the code above,
// which would cause the db client to read DATABASE_PATH before we set it.
// Using dynamic import ensures the environment is properly configured first.
const { sqlite } = await import('$lib/server/db/client');

// Create all necessary tables for testing
sqlite.exec(`
	-- Users table
	CREATE TABLE IF NOT EXISTS users (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		plex_id INTEGER UNIQUE NOT NULL,
		account_id INTEGER,
		username TEXT NOT NULL,
		email TEXT,
		thumb TEXT,
		is_admin INTEGER DEFAULT 0,
		created_at INTEGER
	);

	-- Play history table
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
	);

	-- Sync status table
	CREATE TABLE IF NOT EXISTS sync_status (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		started_at INTEGER NOT NULL,
		completed_at INTEGER,
		records_processed INTEGER DEFAULT 0,
		last_viewed_at INTEGER,
		status TEXT NOT NULL,
		error TEXT
	);

	-- Cached stats table
	CREATE TABLE IF NOT EXISTS cached_stats (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id INTEGER,
		year INTEGER NOT NULL,
		stats_type TEXT NOT NULL,
		stats_json TEXT NOT NULL,
		calculated_at INTEGER
	);

	-- Share settings table
	CREATE TABLE IF NOT EXISTS share_settings (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id INTEGER NOT NULL,
		year INTEGER NOT NULL,
		mode TEXT NOT NULL DEFAULT 'public',
		share_token TEXT UNIQUE,
		can_user_control INTEGER DEFAULT 0,
		show_logo INTEGER
	);

	-- Custom slides table
	CREATE TABLE IF NOT EXISTS custom_slides (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		title TEXT NOT NULL,
		content TEXT NOT NULL,
		enabled INTEGER DEFAULT 1,
		sort_order INTEGER NOT NULL,
		year INTEGER
	);

	-- Slide configuration table
	CREATE TABLE IF NOT EXISTS slide_config (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		slide_type TEXT NOT NULL,
		enabled INTEGER DEFAULT 1,
		sort_order INTEGER NOT NULL
	);

	-- App settings table
	CREATE TABLE IF NOT EXISTS app_settings (
		key TEXT PRIMARY KEY,
		value TEXT NOT NULL
	);

	-- Sessions table
	CREATE TABLE IF NOT EXISTS sessions (
		id TEXT PRIMARY KEY,
		user_id INTEGER NOT NULL,
		plex_token TEXT NOT NULL,
		is_admin INTEGER DEFAULT 0,
		expires_at INTEGER NOT NULL
	);

	-- Logs table
	CREATE TABLE IF NOT EXISTS logs (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		level TEXT NOT NULL,
		message TEXT NOT NULL,
		source TEXT,
		metadata TEXT,
		timestamp INTEGER NOT NULL
	);

	-- Metadata cache table
	CREATE TABLE IF NOT EXISTS metadata_cache (
		rating_key TEXT PRIMARY KEY,
		duration INTEGER,
		genres TEXT,
		release_year INTEGER,
		fetched_at INTEGER NOT NULL,
		fetch_failed INTEGER DEFAULT 0
	);

	-- Plex accounts table
	CREATE TABLE IF NOT EXISTS plex_accounts (
		account_id INTEGER PRIMARY KEY,
		plex_id INTEGER NOT NULL,
		username TEXT NOT NULL,
		thumb TEXT,
		is_owner INTEGER DEFAULT 0,
		updated_at INTEGER
	);
`);
