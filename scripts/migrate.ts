/**
 * Database migration script for Obzorarr
 *
 * Run with: bun run scripts/migrate.ts
 */

import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';

const databasePath = process.env.DATABASE_PATH ?? 'data/obzorarr.db';

console.log(`Migrating database at: ${databasePath}`);

// Create database connection
const sqlite = new Database(databasePath, {
	strict: true,
	create: true
});

// Enable WAL mode
sqlite.exec('PRAGMA journal_mode = WAL');
sqlite.exec('PRAGMA synchronous = NORMAL');
sqlite.exec('PRAGMA foreign_keys = ON');

const db = drizzle(sqlite);

// Run migrations
console.log('Running migrations...');
migrate(db, { migrationsFolder: './drizzle' });

console.log('Migrations completed successfully!');
sqlite.close();
