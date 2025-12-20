import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import * as schema from './schema';

// Get database path from environment or use default
const databasePath = process.env.DATABASE_PATH ?? 'data/obzorarr.db';

// Create SQLite database connection with strict mode
const sqlite = new Database(databasePath, {
	strict: true,
	create: true
});

// Enable WAL mode for concurrent reads (per bun-svelte-pro.md guidelines)
// These are persistent settings - only need to be set once per database file
sqlite.exec('PRAGMA journal_mode = WAL');
sqlite.exec('PRAGMA synchronous = NORMAL');
sqlite.exec('PRAGMA foreign_keys = ON');
sqlite.exec('PRAGMA busy_timeout = 5000');
sqlite.exec('PRAGMA cache_size = 10000');

// Create Drizzle ORM instance with schema
export const db = drizzle(sqlite, { schema });

// Export raw SQLite connection for advanced operations if needed
export { sqlite };
