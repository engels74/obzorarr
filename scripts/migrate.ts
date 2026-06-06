/**
 * Database migration script for Obzorarr
 *
 * Run with: bun run scripts/migrate.ts
 */

import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';

const databasePath = process.env.DATABASE_PATH ?? 'data/obzorarr.db';

console.log(`Migrating database at: ${databasePath}`);

if (databasePath !== ':memory:') {
	mkdirSync(dirname(databasePath), { recursive: true });
}

const sqlite = new Database(databasePath, {
	strict: true,
	create: true
});

sqlite.exec('PRAGMA journal_mode = WAL');
sqlite.exec('PRAGMA synchronous = NORMAL');
sqlite.exec('PRAGMA foreign_keys = ON');

const db = drizzle(sqlite);

console.log('Running migrations...');
migrate(db, { migrationsFolder: './drizzle' });

console.log('Migrations completed successfully!');
sqlite.close();
