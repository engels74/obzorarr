/**
 * Test setup file for Obzorarr
 *
 * This file is preloaded before all tests run.
 * Use it for global test configuration, mocks, and utilities.
 */

// Ensure tests run in a clean environment
process.env.NODE_ENV = 'test';

// Set a test database path to avoid conflicts with development database
process.env.DATABASE_PATH = ':memory:';

// Import database client after setting environment variables
import { sqlite } from '$lib/server/db/client';

// Create all necessary tables for testing
sqlite.exec(`
	-- Users table
	CREATE TABLE IF NOT EXISTS users (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		plex_id INTEGER UNIQUE NOT NULL,
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
		parent_title TEXT
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
		can_user_control INTEGER DEFAULT 0
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
`);
