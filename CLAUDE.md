# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Obzorarr is a **"Wrapped for Plex"** app (SvelteKit + Svelte 5, Bun runtime). It syncs
viewing history from a Plex Media Server into SQLite, computes yearly stats, and renders an
animated slideshow (like Spotify Wrapped). No Tautulli — it talks to the Plex API directly.

Stack: Bun · SvelteKit/Svelte 5 (runes) · SQLite via Drizzle ORM (`bun:sqlite`) · UnoCSS +
shadcn-svelte · GSAP/Motion · Biome (lint/format) · `prek` git hooks.

Where things live:
- `src/routes/` — pages & API. `+page.server.ts` holds `load`/`actions`; `api/**/+server.ts`
  holds JSON endpoints. Major route groups: `admin/`, `onboarding/`, `dashboard/`,
  `wrapped/[year=year]/u/[identifier]/`, `auth/`, `api/`.
- `src/lib/server/<domain>/` — all server-side business logic, one folder per domain:
  `sync`, `stats`, `sharing`, `auth`, `plex`, `funfacts`, `onboarding`, `slides`, `admin`
  (settings), `logging`, `security`, `ratelimit`, `anonymization`, `logo`, `db`.
- `src/lib/components/` — UI; shadcn-svelte primitives in `src/lib/components/ui/`,
  slideshow in `components/slides/` + `components/wrapped/`.
- `src/lib/{stats,sharing,slides,sync}/` (non-`server`) — shared types/pure helpers usable on
  client and server. Server code re-exports/extends these.
- `src/hooks.server.ts` — request middleware chain (the app's control spine).
- `src/lib/server/db/schema.ts` — Drizzle schema (single source of truth for tables).

## Commands

Bun is the package manager and runtime. `bun run <script>` runs `package.json` scripts.

```bash
bun install                              # install deps (postinstall runs `prek install`)
bun run dev                              # dev server (bun --bun vite dev)
bun run build                            # production build (svelte-adapter-bun -> ./build)
bun run start                            # run the built server (bun ./build)

bun run test                             # full test suite (= bun test --env-file=.env.test)
bun test --env-file=.env.test tests/unit/<file>.test.ts   # single test file
bun test --env-file=.env.test -t "name"  # single test by name pattern

bun run lint                             # biome lint .
bun run format                           # biome format --write .
bun run check:biome                      # biome check . (lint + format, CI-style)
bun run check                            # svelte-kit sync && svelte-check (typecheck)

bun run db:generate                      # drizzle-kit generate (create migration from schema)
bun run db:migrate                       # apply migrations (scripts/migrate.ts)
bun run db:studio                        # drizzle-kit studio
```

Always pass `--env-file=.env.test` when running `bun test` directly: `src/lib/server/db/client.ts`
throws if a test process points at a non-`:memory:`/non-`test` database.

CI (`.github/workflows/code-quality.yml`) runs, in order: `prek` hooks → `bun run check`
→ `bun run test`. To mirror CI locally run all three.

## High-level architecture

**Request flow** — `src/hooks.server.ts` composes handlers via `sequence(...)`:
`requestFilter → rateLimit → proxy → csrf → initialization → securityHeaders → auth →
onboarding → authorization`. Auth resolves the session cookie into `event.locals.user`;
`onboardingHandle` redirects to `/onboarding/<step>` until setup completes; `authorizationHandle`
gates `/admin/**` to `locals.user.isAdmin`.

**Data layer** — Drizzle over `bun:sqlite` (`src/lib/server/db/client.ts`). The singleton `db`
runs migrations from `./drizzle` on import (skipped for `:memory:`). SQLite is in WAL mode.
Change tables by editing `schema.ts`, then `bun run db:generate`.

**Stats** — `src/lib/server/stats/engine.ts` reads `playHistory` and computes per-user
(`calculateUserStats`) and server-wide (`calculateServerStats`) stats, cached in the
`cached_stats` table with a TTL.

**Background sync** — `src/lib/server/sync/` pulls Plex history. `scheduler.ts` uses `croner`
(`Cron`) for the recurring sync job; `live-sync.ts` does on-demand refresh on page loads.

**Settings** — runtime config lives in the `app_settings` key/value table, accessed via
`src/lib/server/admin/settings.service.ts` (`AppSettingsKey`, `getAppSetting`/`setAppSetting`).
ENV vars take precedence over DB rows; conflicting DB rows are auto-cleared at startup.

## Task workflows

**Add/change a database table or column**
1. Edit `src/lib/server/db/schema.ts` (export `$inferSelect`/`$inferInsert` types too).
2. `bun run db:generate` to emit a migration into `drizzle/`.
3. Commit the generated migration; it applies automatically on next server/test start.

**Add a form action (mutation) on a page**
1. Define a Zod schema; validate with `sveltekit-superforms` (`superValidate` + `zod4` adapter)
   for new forms — see `src/routes/admin/settings/system/+page.server.ts`.
2. Return `fail(status, { form, error })` on invalid input, data object on success.
3. For admin routes wrap the `actions` object in `requireAdminActions({...})`
   (`src/lib/server/auth/guards.ts`) so every action enforces admin.
4. For settings forms with optimistic-concurrency, use `inlineOccCheck` / `OCC_CONFLICT_MESSAGE`
   (`src/lib/server/admin/occ-helpers.ts`) and return `fail(409, ...)` on conflict.

**Add a JSON API endpoint**
- Create `src/routes/api/<path>/+server.ts` exporting `GET`/`POST` (`RequestHandler`). Validate
  the body with Zod, return `json(...)`, throw `error(status, msg)` for failures.

**Add a Wrapped slide**
- Add the component under `src/lib/components/slides/`, register it in
  `components/wrapped/SlideRenderer.svelte` and the slide type/config in `components/slides/types.ts`
  and `src/lib/server/slides/config.service.ts`.

## Decision tables

| Situation | Use this | Avoid |
| --- | --- | --- |
| New form with validation | `sveltekit-superforms` + Zod (`zod4` adapter) | Hand-rolling `formData.get(...)` parsing for new forms |
| Admin-only page actions | `requireAdminActions({...})` wrapper | Re-checking `locals.user.isAdmin` per action by hand |
| Reading runtime config | `settings.service.ts` getters (ENV-over-DB resolution) | Reading `process.env` directly in feature code |
| Server logging | `logger` from `$lib/server/logging` (writes to `logs` table) | `console.log` in server code |
| Calling a form action from JS | `submitAction()` in `$lib/utils/submit-action.ts` | Raw `fetch` without the `x-sveltekit-action` header |
| Validating user input | Zod schemas at the route boundary | Trusting client values in services |
| Persisting computed stats | `cached_stats` via the stats engine cache | Recomputing on every request |

## Project-specific rules

- Import database types/tables from `src/lib/server/db/schema.ts`; never open a second
  `bun:sqlite` connection — use the shared `db` from `src/lib/server/db/client.ts`.
- Theme colors are OKLCH custom properties in `src/app.css`, consumed as `oklch(var(--token))`.
- Return generic error messages to clients; log the real error server-side with `logger`
  (see the slide-error contract in `src/lib/server/slides/types.ts`) to avoid leaking SQL/internals.
- Plex/server URLs must be normalized via `$lib/server/security/credentialed-url`
  (`normalizePlexServerUrl` / `normalizeOpenAIBaseUrl`) before use.
- `main` is protected by `prek` (`no-commit-to-branch`); work on a branch and open a PR.
- Tests live in `tests/` (`unit/`, `property/` with `fast-check`, `helpers/`); `tests/setup.ts`
  is preloaded and coverage thresholds are 80% line/function (`bunfig.toml`).

## References

- `README.md` — product overview, Docker deployment, env vars.
- `.env.example` — all supported environment variables and defaults.
- `.augment/rules/bun-svelte-pro.md` — Bun + Svelte 5 + SvelteKit conventions; read before
  non-trivial Svelte 5 runes, SvelteKit data-loading, or `bun:sqlite` work.
- `drizzle.config.ts` / `src/lib/server/db/schema.ts` — read before touching migrations.
