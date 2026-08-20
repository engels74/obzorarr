# AGENTS.md

This file provides guidance to AI coding agents when working with code in this
repository.

Obzorarr is a "Wrapped for Plex" app: SvelteKit 2 / Svelte 5 on Bun, SQLite via Drizzle,
shipped as a single Bun server (`svelte-adapter-bun`).

## Commands

Bun is the only package manager. `bun install` also runs `svelte-kit sync` (`prepare`) and
`prek install` (`postinstall`) — the latter installs the git hooks, including
`no-commit-to-branch --branch main`, so after installing you must work on a branch.

| Command | Purpose |
| --- | --- |
| `bun run dev` | Dev server. **Does not load `.env`** — configure Plex via onboarding/admin UI |
| `bun run dev:env` | Dev server with `--env-file=.env`; only needed to exercise env-locked settings UI |
| `bun run check` | `svelte-kit sync && svelte-check` — the type gate |
| `bun run test` | Full suite (`bun test --env-file=.env.test`) |
| `bun run check:biome` | Lint + format check; `bun run lint:fix` / `bun run format` to autofix |
| `bun run build` | Production build into `build/` |
| `bun run db:generate` | Generate a migration in `drizzle/` from `schema.ts` |
| `bun run db:migrate` | Apply migrations standalone (the app also migrates on boot) |

Single file / single case:

```bash
bun test --env-file=.env.test tests/unit/sharing/service.test.ts
bun test --env-file=.env.test -t "rejects stale settingsVersion"
```

`bunfig.toml` forces coverage on with `line = 0.8, function = 0.8`, so a partial run reports a
failing coverage table even when its tests pass — judge partial runs by the pass/fail counts,
not the exit code, and gate on a full `bun run test`.

`$lib/*` and `$app/*` resolve through `.svelte-kit/tsconfig.json` for both `svelte-check` and
`bun test`. If imports suddenly fail to resolve, run `bunx svelte-kit sync`.

Local order matches CI (`.github/workflows/code-quality.yml`): `check:biome` → `check` → `test`,
plus `build` and `smoke:production`. Commits are Conventional Commits (enforced at `commit-msg`).

## Layout

- `src/lib/server/**` — server-only domain modules. SvelteKit keeps them out of the client bundle.
- `src/lib/**` (non-`server`) — shared zod schemas, client helpers, components. The server
  re-exports shared schemas (e.g. `src/lib/server/slides/types.ts` does `export * from
  '$lib/slides/types'`).
- `src/routes/**` — thin loads and form actions delegating to `$lib/server/*`. No business logic.
- `tests/` — `unit/` mirrors the domain folders, plus `property/` (fast-check), `integration/`,
  `helpers/`. Bun's runner only: `tests/unit/test-architecture.test.ts` fails the build if a test
  imports Vitest/Jest APIs or nests under `tests/unit/server/`.

Generated, do not hand-edit: `drizzle/meta/**` (drizzle-kit snapshots), `.svelte-kit/`, `build/`.
A `drizzle/NNNN_*.sql` body may be hand-extended only for data salvage — `0010_cynical_screwball.sql`
is the worked example. `docs/` is gitignored scratch space; never add tracked docs there.

## Gotchas

- **The test DB schema is hand-mirrored.** `tests/setup.ts` builds the in-memory schema with raw
  `CREATE TABLE` statements; migrations never run against `:memory:`. Any change to
  `src/lib/server/db/schema.ts` must be mirrored there, and new tables added to
  `sharedTestDbTables` / `resetSharedTestDb()` in `tests/helpers/db.ts`.
- **Never wrap migration SQL in `BEGIN`/`COMMIT`** — drizzle's bun-sqlite migrator already runs
  each file in one transaction.
- **One DB handle.** Import `db` / `sqlite` from `src/lib/server/db/client.ts`; do not construct
  another `Database` in app code (pure/property tests may, and must say so).
- **Env outranks DB for settings.** `src/lib/server/admin/settings.service.ts` owns `app_settings`,
  and `clearConflictingDbSettings()` drops DB rows an env var now controls at startup. Read
  settings through the service, not `process.env`, inside routes.
- **Admin settings writes go through OCC**, not `setAppSetting`: expose
  `settingsVersionISO(await getAppSettingsUpdatedAt(KEYS))` in `load`, call `inlineOccCheck` or
  `externalOccCheck` in the action, wrap the action map in `requireAdminActions({...})`, and pass
  `surfaceOccConflict` to superForm's `onUpdate` — without the last step a discarded 409 write
  still renders a success toast.
- **`OCC_CONFLICT_CODE` / `OCC_CONFLICT_MESSAGE` are duplicated across the server/client boundary**
  (`server/admin/occ-helpers.ts` and `utils/occ-form.ts`) and asserted verbatim by many tests.
  Change all three in one commit.
- **Guard form actions explicitly.** Actions do not run the route's redirecting `load`, so an
  unauthenticated POST lands in the handler with `locals.user` undefined. Use
  `requireAdminActions` / `requireUserActions` from `$lib/server/auth/guards` rather than the
  route load or ad-hoc `if (!locals.user?.isAdmin)`.
- **Hook order in `src/hooks.server.ts` is load-bearing.** `proxyHandle` is the only place
  `X-Forwarded-*` may rewrite the URL (gated on `TRUST_PROXY`), so everything downstream — the HSTS
  decision included — reads `event.url`, never the raw headers.
- **CSRF is app-owned.** `svelte.config.js` sets `csrf.trustedOrigins: ['*']` on purpose because
  `security/csrf-handle.ts` does configured-origin checks and owns the self-lockout repair path.
  Adjust `csrf-handle.ts`; do not re-enable SvelteKit's built-in gate.
- **New third-party origins need a CSP entry** in `svelte.config.js` (nonce mode, `script-src:
  self`) or they are blocked at runtime.
- **Wrapped denials are deliberately uniform 404s** — unknown identifier, non-public profile and
  stale identity mapping are indistinguishable so the endpoint cannot enumerate users. Do not add
  a specific message to that path; route access decisions through
  `server/sharing/access-control.ts`.
- **Cached stats are schema-validated on read.** `stats/serialization.ts` parses `cached_stats`
  rows against the zod schemas in `src/lib/stats/types.ts`, so changing those schemas without an
  `invalidateCache()` path makes existing rows throw `StatsParseError`.
- **Schedulers take a resolved timezone.** `timezone` is a required option precisely so nothing
  silently defaults to UTC — resolve with `getSchedulerTimezone()` (`TZ` env over the
  `scheduler_timezone` row). Operator intent lives in the `sync_scheduler_state` row; an action
  that starts/pauses/stops the scheduler must persist it or a restart loses it.
- **Plex `accountId` is PMS-local, not a Plex.tv id** (owner is always `accountId=1`). Mappings are
  created only by a complete reconciliation in `server/plex/account-reconciliation.ts`; a partial
  or failed observation must keep the prior mapping. Do not hand-edit account ids or backfill
  history to fix attribution.
- **Log through `logger`** from `$lib/server/logging` as `(message, source, metadata?)`;
  `logging/redactor.ts` scrubs it. Anything that could carry a Plex token must not bypass it.
- **Form actions bypass `handleError`** and must sanitize themselves — `slideErrorToFail`,
  `sanitizeApiError` / `sanitizeConnectionError` from `$lib/server/security`.
- **`cn` comes from `$lib/utils.js`** (`src/lib/utils.ts`, clsx + tailwind-merge). The `cn` in
  `src/lib/utils/index.ts` is a different, unused implementation; `$lib/utils/*` subpath imports
  (`format`, `occ-form`, `animation-presets`, …) are the only intended use of that directory.
- **Classes only reachable in portalled markup must be safelisted** in `uno.config.ts` — UnoCSS's
  static scan misses them and the style silently no-ops.
- **QA scripts refuse unsafe databases.** `db/client.ts` throws under `NODE_ENV=test` unless the
  path is `:memory:` or contains `test`; `bun run qa:wrapped-lookup` rejects relative, existing, or
  production-looking paths — give it a fresh absolute path under the system temp dir. Both it and
  `bun run smoke:production` need their own `DATABASE_PATH` and a prior `bun run build`.

## Adding a Wrapped slide

The type literal lives in five places: the `SlideType` union and `DEFAULT_SLIDE_ORDER` in
`src/lib/components/slides/types.ts`, `SlideTypeSchema` in `src/lib/slides/types.ts`, the branch in
`src/lib/components/wrapped/SlideRenderer.svelte`, and the two label maps in
`src/routes/admin/slides/+page.svelte` and `src/routes/onboarding/settings/+page.server.ts`. Add the
component under `src/lib/components/slides/` and export it from that directory's `index.ts`. New
data means a calculator in `server/stats/calculators/` (exported from its `index.ts`), wiring in
`stats/engine.ts`, and a schema extension in `src/lib/stats/types.ts`.

Fun-fact templates follow the same shape: register the array in `initializeTemplates()` and in
`ALL_TEMPLATES` / `TEMPLATES_BY_CATEGORY` in `src/lib/server/funfacts/templates/index.ts`.

## Reference

- `.agents/rules/bun-svelte-pro.md` — Bun / Svelte 5 runes / SvelteKit 2 / UnoCSS / shadcn-svelte
  idioms. Large; read a targeted section when unsure of a modern pattern, not end to end.
- `tests/helpers/README.md` — helper tiers, DB contract, `mock.module` ordering. Read before adding
  or changing a test helper, fixture, or module mock.
- `.env.example` — read before adding an environment variable; documents defaults and how
  placeholder values are treated.
- `README.md` — user-facing: onboarding/bootstrap token, `ORIGIN` vs `TRUST_PROXY`, Plex identity
  matching rules, instance reset.
- `src/hooks.server.ts` — inline rationale for the SSE denial split (303 for `/admin/*/stream`,
  401 JSON for `/api/sync/status/stream`) and the `handleError` demotion rules. Read before
  "unifying" any of it.
- `src/lib/server/slides/sanitize.ts` — the custom-slide HTML allowlist policy; tighten it there,
  not at call sites.
