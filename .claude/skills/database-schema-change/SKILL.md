---
name: database-schema-change
description: Keep Obzorarr's Drizzle schema, generated migrations, and manually mirrored Bun test database synchronized.
---

# Database schema change

1. Edit the source schema in `src/lib/server/db/schema.ts`.
2. Run `bun run db:generate`. Commit the new SQL migration and Drizzle metadata under `drizzle/`;
   inspect the SQL, but do not hand-edit `drizzle/meta/*.json`.
3. Mirror the production shape in the in-memory DDL in `tests/setup.ts`. This preload does not run
   file-based migrations because the DB client skips migrations for `:memory:` databases.
4. When adding or removing a table, update `sharedTestDbTables` and the foreign-key-safe deletion
   order in `tests/helpers/db.ts`.
5. Run the schema parity test:
   `bun test --env-file=.env.test tests/unit/core-contracts.test.ts -t 'database schema'`
6. Run `bun run check`, `bun run test`, and `bun run build`.
7. Apply migrations to a configured file database only when that is part of the task:
   `bun run db:migrate`. The application also applies `./drizzle` migrations automatically when
   `src/lib/server/db/client.ts` opens a non-memory database.
