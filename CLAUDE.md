# CLAUDE.md

This file provides guidance to AI coding agents when working in this repository.

## Project overview

Obzorarr is a "Wrapped for Plex" SvelteKit app that syncs Plex viewing history into SQLite and renders an animated yearly recap. Runtime is Bun end-to-end (dev server, test runner, production build via `svelte-adapter-bun`).

Where things live:

- `src/routes/**` — SvelteKit pages and form actions (UI + SSR data loading).
- `src/lib/server/**` — server-only logic: auth, db, sync, stats, sharing, slides, funfacts, onboarding, logging, security, ratelimit. Never import from `.svelte` or client code.
- `src/lib/components/**`, `src/lib/client/**`, `src/lib/stores/**` — client-side UI, helpers, runes.
- `src/lib/server/db/schema.ts` — Drizzle schema (single source of truth for tables).
- `src/hooks.server.ts` — global request pipeline (auth, CSRF, rate limit, onboarding, admin gating).
- `drizzle/**` — generated SQL migrations (committed; auto-applied on boot).
- `tests/unit/**` mirrors `src/lib/server`; `tests/property/**` uses fast-check; `tests/helpers/**` has fixtures.
- `scripts/migrate.ts` — standalone migration runner; `scripts/scrub-dogfood-output.ts` — dogfood report scrubber.

## Commands

All commands run from the repo root with Bun.

```bash
bun install              # installs deps + sets up prek pre-commit hooks (via postinstall)
bun run dev              # dev server (bun --bun vite dev)
bun run build            # production build -> ./build
bun run start            # run the built server (bun ./build)

bun run check            # svelte-kit sync + svelte-check (TypeScript + Svelte types)
bun run lint             # biome lint .
bun run lint:fix         # biome lint --write .
bun run format           # biome format --write .
bun run check:biome      # biome check . (lint + format, read-only) — closest to CI

bun run test             # bun test --env-file=.env.test  (coverage threshold 80% line/function)
bun test path/to/file.test.ts                      # single test file
bun test --test-name-pattern "regex"               # single test by name

bun run db:generate      # drizzle-kit generate (creates SQL migration from schema.ts changes)
bun run db:migrate       # bun run scripts/migrate.ts (applies migrations to DATABASE_PATH)
bun run db:studio        # drizzle-kit studio
```

Important: `.env.test` forces `DATABASE_PATH=:memory:`; `src/lib/server/db/client.ts` **throws** if `NODE_ENV=test` opens a non-test on-disk path. Always invoke tests via `bun run test` (not bare `bun test`) so the env file is loaded — except for `bun test <path>` style single-file runs from CI/scripts that already have env set.

Pre-push (prek) runs `bun run check` and `bun test`. CI (`.github/workflows/code-quality.yml`) runs prek hooks → type-check → tests.

## High-level architecture

### Request pipeline (`src/hooks.server.ts`)

All requests flow through `sequence(...)`:
`requestFilter → rateLimit → proxy (x-forwarded-*) → csrf → initialization → securityHeaders → auth → onboarding → authorization`.

- **CSRF** is origin-based, configured via DB `app_settings` first, then `ORIGIN` env. SvelteKit's built-in origin check is disabled (`trustedOrigins: ['*']` in `svelte.config.js`) because this app sits behind a reverse proxy; the custom `csrfHandle` + SameSite=Lax cookies provide protection.
- **CSP** is set in `svelte.config.js` with `mode: 'nonce'`.
- **`authorizationHandle`** gates `/admin/**` to `locals.user.isAdmin`. Non-admins are redirected to `/dashboard` (logged in) or `/` (anonymous). The root `+page.server.ts` redirects logged-in users to `/admin` or `/dashboard`.
- **`DEV_BYPASS_AUTH`** (dev only) short-circuits auth via a hardcoded session. Configure with `DEV_BYPASS_USER` (empty/`random`/plexId/username) and `DEV_PLEX_TOKEN` for onboarding testing. See `src/lib/server/auth/dev-bypass.ts`.

### Authentication

Plex OAuth PIN flow in `src/lib/server/auth/`: `plex-oauth.ts` requests/polls PIN → `login-completion.ts` creates a session row. Sessions live in `sessions` for 7 days (`SESSION_DURATION_MS`); membership is periodically revalidated against Plex.tv (`revalidation.ts`). `locals.user` is `{ id, plexId, username, isAdmin }`.

### Data layer

Drizzle ORM + `bun:sqlite`. Schema: `src/lib/server/db/schema.ts` (users, sessions, playHistory, syncStatus, cachedStats, shareSettings, slideConfig, customSlides, appSettings, plexAccounts, metadataCache, logs, etc.). `src/lib/server/db/client.ts` opens with WAL + `busy_timeout=5000` and **auto-runs `drizzle/` migrations on import** (skipped for `:memory:`). The bun:sqlite module is loaded via dynamic `import('bun:sqlite')` so the adapter/Rolldown won't try to bundle it.

### Sync system (`src/lib/server/sync/`)

- `service.ts` — `startSync()` paginates Plex history, batch-inserts, enriches metadata, updates `syncStatus`. Single-flight via `isSyncRunning()`.
- `scheduler.ts` — `croner`-backed recurring sync. Cron expression stored as app setting (`SYNC_CRON_EXPRESSION`) with env fallback `SYNC_CRON_SCHEDULE`.
- `live-sync.ts` — `triggerLiveSyncIfNeeded()` fires a short incremental sync on wrapped page loads (fire-and-forget, silent on error).
- `plex-accounts.service.ts` — mirrors Plex server users into `plexAccounts` so stats can display usernames.
- After sync, stats cache is invalidated via `$lib/server/stats/engine#invalidateCache()`.

### Stats + wrapped rendering

`$lib/server/stats/engine` exposes `calculateUserStats`, `calculateServerStats`, `getServerStatsWithAnonymization`, backed by a `cachedStats` TTL cache. Wrapped pages at `/wrapped/[year]` (server-wide) and `/wrapped/[year]/u/[identifier]` (per-user) load stats + slide config + fun facts in parallel. Slides come from `$lib/server/slides` — built-in `slideConfig` rows plus admin-defined `customSlides`, interleaved with AI or template fun facts (`$lib/server/funfacts`). Markdown is rendered server-side (`renderMarkdownSync`) and sanitized before reaching the client.

### Sharing & access control

`$lib/server/sharing/` enforces three modes (`public`, `private-oauth`, `private-link` with tokens). `checkServerWrappedAccess` / `checkWrappedAccess` are called at the top of wrapped `+page.server.ts` loads. Map errors: `ShareAccessDeniedError` → `error(403)`, `InvalidShareTokenError` → `error(404)`. Per-user state lives in `shareSettings`; global defaults are in `app_settings`.

### Onboarding

5-step flow (`csrf → plex → sync → settings → complete`) in `$lib/server/onboarding`. The `onboardingHandle` redirects everything except `/onboarding`, `/auth`, `/_app`, `/favicon`, `/api/onboarding`, `/api/sync` until `ONBOARDING_COMPLETED=true` in app settings.

### Route map

- `/` — landing + username form (redirects logged-in users)
- `/auth/*` — Plex PIN callback flow
- `/onboarding/*` — first-run wizard
- `/dashboard` — non-admin home (admins redirected to `/admin`)
- `/admin/**` (admin-gated layout) → `settings`, `sync`, `users`, `logs`, `slides`, `wrapped`
- `/wrapped/[year]` and `/wrapped/[year]/u/[identifier]` — slideshow
- `/api/{sync,onboarding,security}` — JSON endpoints for client-side polling/actions

## Task workflows

### Adding/changing a database table or column

1. Edit `src/lib/server/db/schema.ts`.
2. Run `bun run db:generate` — Drizzle Kit writes a new file in `drizzle/`. Commit it.
3. Restart the app (or run `bun run db:migrate`) — `src/lib/server/db/client.ts` auto-applies pending migrations on next boot.
4. If tests touch the new column, update fixtures in `tests/helpers/`.

### Adding a new admin form action

1. Add the action to the route's `+page.server.ts` inside `requireAdminActions({ ... })` (see `src/routes/admin/settings/+page.server.ts`).
2. Validate the form payload with a Zod schema; return `fail(status, { error, fieldErrors? })` for validation, `{ success: true, ... }` or `redirect(303, ...)` for success.
3. In the `.svelte` file, submit with `use:enhance` and call `handleFormToast(form)` from a `$effect` to surface toasts.

### Adding a new scheduled job

1. Use `Cron` from `croner` with a `name`, `timezone`, `catch` handler, and `protect: true` (see `src/lib/server/sync/scheduler.ts`).
2. Wire it from `src/hooks.server.ts` (or a module imported by it) guarded by `!building` from `$app/environment` so build-time analysis doesn't start the job.

### Adding a new wrapped slide or fun-fact source

- Built-in slide types live under `$lib/server/slides`; admin-defined slides go in the `customSlides` table.
- Fun-fact generation paths: AI (`OPENAI_*` env or app settings) and template fallback in `$lib/server/funfacts`. Server-rendered markdown must pass through the existing sanitizer.

## Decision tables

| Situation | Use this | Avoid |
| --- | --- | --- |
| SSR-loaded page data | `+page.server.ts` `load` | `+page.ts` for server-only data |
| Form mutation | Form action + `use:enhance` | Hand-rolled `fetch` POST |
| REST/JSON endpoint for client polling | `+server.ts` under `/api/...` | Form action + JSON shape hacks |
| Validating input | Zod (`zod` v4) | Ad hoc `typeof` checks |
| Expected HTTP error | `error(status, msg)` from `@sveltejs/kit` | `throw new Error(...)` (becomes 500) |
| Auth guard in a page load | `requireAdmin(locals)` | Re-implementing the isAdmin check |
| Auth guard in form actions | wrap with `requireAdminActions({...})` | Per-action `requireAdminAction` repeats |
| Component-local state | Svelte 5 runes (`$state`, `$derived`) | Writable stores |
| Cross-route shared state | Existing module in `$lib/stores` or server load | New ad hoc store |
| DB access | Drizzle via `$lib/server/db/client` (`db`) | `new Database(...)` elsewhere |
| Scheduled task | `croner` (`Cron`) guarded by `!building` | `setInterval` |

## Code patterns

Form action with Zod validation and admin guard:

```ts
export const actions: Actions = requireAdminActions({
  updateThing: async ({ request }) => {
    const data = Object.fromEntries(await request.formData());
    const parsed = ThingSchema.safeParse(data);
    if (!parsed.success) {
      return fail(400, { error: 'Invalid input', fieldErrors: parsed.error.flatten().fieldErrors });
    }
    await saveThing(parsed.data);
    return { success: true };
  }
});
```

Croner job wiring:

```ts
new Cron(cronExpression, {
  name: 'plex-sync',
  timezone: 'UTC',
  protect: true,            // refuse overlapping runs
  catch: (err, job) => logger.error(`${job.name} failed: ${err}`, 'Scheduler')
}, async () => { /* ... */ });
```

DB query with Drizzle:

```ts
import { db } from '$lib/server/db/client';
import { sessions } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

const row = await db.select().from(sessions).where(eq(sessions.id, id)).get();
```

## Project-specific rules

- **Svelte 5 runes only** (`$state`, `$derived`, `$effect`, `$props()`). No Svelte 4 stores/reactive statements for component state.
- **Do not import from `$lib/server/...` in client code** (`.svelte`, files in `$lib/client`, `$lib/stores`); the bundle will fail or leak secrets. Server-only modules go under `$lib/server/...`.
- **Database access goes through `$lib/server/db/client#db`**; don't instantiate `bun:sqlite` directly except in `scripts/migrate.ts`.
- **HTTP errors:** use `error(status, msg)` and `fail(status, {...})` from `@sveltejs/kit`. Unexpected errors are sanitized by `handleError` in `hooks.server.ts`; don't leak internals in messages.
- **Form-action toasts:** client uses `handleFormToast(form)` from `$lib/utils/form-toast.ts` inside a `$effect`. Server returns `{ success: true, message }` or `fail(..., { error })`.
- **Markdown in wrapped output** must go through the existing server-side renderer + sanitizer (`$lib/server/funfacts` / `$lib/server/slides`); never render user-supplied markdown client-side without sanitization.
- **Tests must not touch a non-`:memory:` DB.** `bun run test` sets the env; if you write a script that bypasses it, set `DATABASE_PATH=:memory:` and `NODE_ENV=test` yourself or the client will throw.
- **Biome config**: tabs, single quotes, no trailing commas, 100-col width. Svelte files allow unused imports/vars on purpose — don't tighten those rules.
- **Commits:** Conventional Commits, lowercase, imperative. Allowed types: `feat|fix|refactor|perf|style|test|docs|build|ops|chore`. Use `!` for breaking changes.
- **Coverage threshold is 80%** line/function (`bunfig.toml`). Don't lower it; add tests instead.

## References

- `.augment/rules/bun-svelte-pro.md` — comprehensive Bun + SvelteKit + Drizzle conventions for this project; read before non-trivial work in any new area (routing, testing, SQLite, croner, Plex integration).
- `CONTRIBUTING.md` — getting-started, pre-commit hook details, commit message rules.
- `README.md` — user-facing setup, Docker quick start, tech stack overview.
- `drizzle/` — migration history; consult before changing existing tables to avoid double-writing migrations.
- `tests/setup.ts` — what is mocked globally (`$env/dynamic/private`, `$app/environment`, in-memory DB); read before adding tests that need extra mocks.
