# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Obzorarr is a "Wrapped for Plex" SvelteKit app that syncs Plex viewing history into SQLite and renders an animated yearly recap. Runtime is Bun end-to-end (dev server, test runner, production build via `svelte-adapter-bun`).

## Commands

```bash
bun install              # installs deps AND sets up prek pre-commit hooks (postinstall)
bun run dev              # dev server (bun --bun vite dev)
bun run build            # production build -> ./build
bun run start            # run the built server (bun ./build)

bun run check            # svelte-kit sync + svelte-check (TypeScript + Svelte types)
bun run lint             # biome lint .
bun run lint:fix         # biome lint --write .
bun run format           # biome format --write .
bun run check:biome      # biome check . (lint + format, read-only)

bun run test             # runs bun test with --env-file=.env.test (coverage required ≥80% line/fn)
bun test path/to/file.test.ts                      # single file
bun test --test-name-pattern "regex of test name"  # single test by name

bun run db:generate      # drizzle-kit generate (creates migration from schema.ts changes)
bun run db:migrate       # bun run scripts/migrate.ts (applies migrations to DATABASE_PATH)
bun run db:studio        # drizzle-kit studio
```

`.env.test` forces `DATABASE_PATH=:memory:`; `src/lib/server/db/client.ts` actively **throws** if `NODE_ENV=test` tries to open a non-test path on disk — always run tests via `bun run test`, never bare `bun test`, so the env file is loaded.

Pre-push hooks (via prek) run `bun run check` and `bun test`. CI (`.github/workflows/code-quality.yml`) runs prek hooks → type-check → tests sequentially.

## Architecture

### Request pipeline (`src/hooks.server.ts`)

All requests pass through `sequence(...)` in this order:
`requestFilter → rateLimit → proxy (x-forwarded-*) → csrf → initialization → securityHeaders → auth → onboarding → authorization`.

- **CSRF** is origin-based, configured from DB (`app_settings`) first, then `ORIGIN` env var. SvelteKit's built-in origin check is disabled (`trustedOrigins: ['*']` in `svelte.config.js`) because this app sits behind a reverse proxy; protection comes from the custom `csrfHandle` + SameSite=Lax cookies.
- **CSP** is set in `svelte.config.js` with `mode: 'nonce'`.
- **`authorizationHandle`** gates `/admin` to `locals.user.isAdmin`. The root `+page.server.ts` redirects logged-in users to `/admin` or `/dashboard`.
- **`DEV_BYPASS_AUTH`** (dev only) short-circuits auth by creating a hardcoded `DEV_SESSION_ID`. Tuned with `DEV_BYPASS_USER` (empty/`random`/plexId/username) and optional `DEV_PLEX_TOKEN` for onboarding testing. See `src/lib/server/auth/dev-bypass.ts`.

### Authentication

Plex OAuth PIN flow in `src/lib/server/auth/` (`plex-oauth.ts` requests/polls PIN → `login-completion.ts` creates session). Sessions live in the `sessions` table for 7 days; membership is periodically revalidated against Plex.tv (`revalidation.ts`). `locals.user` is `{ id, plexId, username, isAdmin }`.

### Data layer

Drizzle ORM + `bun:sqlite`. Schema in `src/lib/server/db/schema.ts` (users, sessions, playHistory, syncStatus, cachedStats, shareSettings, slideConfig, customSlides, appSettings, plexAccounts, metadataCache, logs). `src/lib/server/db/client.ts` opens the DB with WAL + `busy_timeout=5000` and **auto-runs migrations on import** (except in-memory). To change the schema: edit `schema.ts`, run `db:generate`, commit the file under `drizzle/`. Runtime applies it on next boot.

### Sync system (`src/lib/server/sync/`)

- `service.ts` — `startSync()` paginates Plex history, inserts batches, enriches metadata, updates `syncStatus`. Only one sync may run at a time (`isSyncRunning()`).
- `scheduler.ts` — `croner`-backed recurring sync, cron expression stored as an app setting (`SYNC_CRON_EXPRESSION`) or env fallback.
- `live-sync.ts` — `triggerLiveSyncIfNeeded()` kicks a short incremental sync on wrapped page loads (fire-and-forget, silent on error).
- `plex-accounts.service.ts` — mirrors Plex server users into `plexAccounts` so stats can display usernames.
- After sync, stats cache is invalidated via `invalidateCache()` in `$lib/server/stats/engine`.

### Stats + wrapped rendering

Stats engine (`$lib/server/stats/engine`) exposes `calculateUserStats`, `calculateServerStats`, `getServerStatsWithAnonymization`, with a `cachedStats` TTL cache. Wrapped pages at `/wrapped/[year]` (server-wide) and `/wrapped/[year]/u/[identifier]` (per-user) load stats + slide config + fun facts in parallel. Slides come from `$lib/server/slides` — built-in `slideConfig` rows plus admin-defined `customSlides` interleaved with AI/template fun facts (`$lib/server/funfacts`). Markdown is rendered server-side (`renderMarkdownSync`) and sanitized before hitting the client.

### Sharing & access control

`$lib/server/sharing/` enforces three modes (`public`, `private-oauth`, `private-link` with tokens). `checkServerWrappedAccess` / `checkWrappedAccess` are called at the top of wrapped `+page.server.ts` loads; `ShareAccessDeniedError` → `error(403)`, `InvalidShareTokenError` → `error(404)`. Per-user settings are in `shareSettings`; global defaults live in app settings.

### Onboarding

5-step flow (`csrf → plex → sync → settings → complete`) in `$lib/server/onboarding`. `onboardingHandle` in hooks redirects everything except `/onboarding`, `/auth`, `/_app`, `/favicon`, `/api/onboarding`, `/api/sync` until `ONBOARDING_COMPLETED=true` in app settings.

### Route map

- `/` — landing + username form (redirects logged-in users)
- `/auth/*` — Plex PIN callback flow
- `/onboarding/*` — first-run wizard
- `/dashboard` — non-admin user home (redirects admins to `/admin`)
- `/admin` (layout-gated admin) → `settings`, `sync`, `users`, `logs`, `slides`, `wrapped`
- `/wrapped/[year]` and `/wrapped/[year]/u/[identifier]` — slideshow
- `/api/{sync,onboarding,security}` — JSON endpoints for client-side polling/actions

## Conventions

**Project rules live in `.augment/rules/bun-svelte-pro.md`** — read it before non-trivial work. Highlights:

- **Svelte 5 runes only** (`$state`, `$derived`, `$effect`, `$props()`). No Svelte 4 patterns, no stores for component-local state.
- **Data loading in `+page.server.ts`** (SSR). Reserve `+server.ts` for REST/external integrations; use form actions with `use:enhance` for mutations.
- **Form actions return `fail(status, {...})` for validation and `redirect(303, ...)` for success.** Client components call `$lib/utils/form-toast.ts`'s `handleFormToast(form)` from a `$effect` to surface toasts.
- **Zod** validates every form action payload. Share schemas from `$lib/server/.../types.ts` when a value is used in multiple places.
- **Import aliases**: `$lib/...` for shared code, `$lib/server/...` is server-only (never import from a `.svelte` or client file). Use `./$types` for `PageServerLoad`, `Actions`, `PageData`, `PageProps`.
- **Errors**: throw via `error(status, msg)` from `@sveltejs/kit` for expected HTTP errors; let `handleError` in `hooks.server.ts` sanitize unexpected errors (logs via `$lib/server/logging`, returns generic message to client).
- **Styling**: UnoCSS (`uno.config.ts`) with `presetShadcn` + `presetIcons` + `presetAnimations`. Design tokens are oklch colors in `src/app.css`. shadcn-svelte primitives live under `src/lib/components/ui/`.
- **Biome** formats with **tabs**, single quotes, no trailing commas, 100-col width. Svelte files have relaxed rules (unused imports/vars allowed to support `<script>` patterns).
- **Commits**: Conventional Commits, lowercase, imperative. Types: `feat|fix|refactor|perf|style|test|docs|build|ops|chore`. Use `!` for breaking.
- **Don't commit** files that look like secrets (`.env`, tokens in code). The large-file hook blocks >500KB.

## Testing

- `bun:test` with `tests/setup.ts` preloaded (sets `NODE_ENV=test`, `DATABASE_PATH=:memory:`, mocks `$env/dynamic/private`).
- Structure: `tests/unit/**` (mirrors `src/lib/server`), `tests/property/**` (fast-check property tests), `tests/helpers/**` (shared fixtures/factories).
- Coverage threshold is 80% line/function (`bunfig.toml`). Don't drop it when adding tests.
- For code that touches DB, use in-memory SQLite; migrations run automatically on import in normal boot but tests typically use helpers to set up schema — check `tests/helpers/` before inventing a new setup.
