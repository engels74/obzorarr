import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import * as schema from './schema';

// Get database path from environment or use default
const databasePath = process.env.DATABASE_PATH ?? 'data/obzorarr.db';

// Safety guard: Prevent test environment from accessing production database
// This catches misconfigured test setups that would otherwise corrupt production data
if (
	process.env.NODE_ENV === 'test' &&
	databasePath !== ':memory:' &&
	!databasePath.includes('test')
) {
	throw new Error(
		`CRITICAL: Test environment attempting to access production database at "${databasePath}". ` +
			`Set DATABASE_PATH=:memory: in .env.test or ensure bun test uses --env-file=.env.test.`
	);
}

// Ensure the directory exists before opening the database
// Skip for in-memory databases (used in tests)
if (databasePath !== ':memory:') {
	mkdirSync(dirname(databasePath), { recursive: true });
}

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

// Run migrations automatically on startup
// Drizzle's migrator is idempotent - it only applies new migrations
if (databasePath !== ':memory:') {
	migrate(db, { migrationsFolder: './drizzle' });
}

// Export raw SQLite connection for advanced operations if needed
export { sqlite };
