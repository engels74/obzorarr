import type { Database as BunDatabase } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import * as schema from './schema';

const databasePath = process.env.DATABASE_PATH ?? 'data/obzorarr.db';

// Prevent test environment from accessing production database
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

if (databasePath !== ':memory:') {
	mkdirSync(dirname(databasePath), { recursive: true });
}

// Keep adapter-bun/Rolldown from resolving Bun's builtin at build time.
const sqliteModuleName = ['bun', 'sqlite'].join(':');
const { Database } = (await import(
	/* @vite-ignore */ sqliteModuleName
)) as typeof import('bun:sqlite');
const sqlite: BunDatabase = new Database(databasePath, {
	strict: true,
	create: true
});

sqlite.exec('PRAGMA journal_mode = WAL');
sqlite.exec('PRAGMA synchronous = NORMAL');
sqlite.exec('PRAGMA foreign_keys = ON');
sqlite.exec('PRAGMA busy_timeout = 5000');
sqlite.exec('PRAGMA cache_size = 10000');

export const db = drizzle(sqlite, { schema });

if (databasePath !== ':memory:') {
	migrate(db, { migrationsFolder: './drizzle' });

	// Reconcile sync rows orphaned in the `running` state by a crash/restart,
	// exactly once at process start — before any request can begin a sync
	// (ISSUE-001 restart deadlock). Dynamic import of the LIGHT reconcile module
	// (no Plex/`$env` graph) avoids a static import cycle — `sync/reconcile.ts`
	// imports `db` from this module, which is already assigned above — and is
	// skipped entirely for in-memory test databases.
	const { reconcileInterruptedSyncs } = await import('$lib/server/sync/reconcile');
	await reconcileInterruptedSyncs();
}

export { sqlite };
