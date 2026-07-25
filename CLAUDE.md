# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this
repository.

## Toolchain and verification

- Use Bun for installs, scripts, and tests. The test suite enforces that test APIs come from
  `bun:test`, not Vitest or Jest.
- Install: `bun install`
- Typecheck: `bun run check`
- Format/lint check: `bun run check:biome`
- Test suite: `bun run test`
- Production build: `bun run build`
- Single file: `bun test --env-file=.env.test tests/unit/test-architecture.test.ts`
- Single case: `bun test --env-file=.env.test tests/unit/test-architecture.test.ts -t 'does not import Jest or Vitest test APIs'`
- CI runs prek, `bun run check`, and `bun run test`; it does not build. Run `bun run build` after
  route-module or build/config changes because typechecking does not catch every SvelteKit
  route-export failure.

## Repository invariants

- `bun run dev` intentionally does not load `.env`; use `bun run dev:env` when testing local
  environment overrides. Authoritative environment values override and lock corresponding DB
  settings through `src/lib/server/admin/settings.service.ts`; do not read DB settings directly
  when an effective Plex/OpenAI/proxy setting is required.
- In `+page.server.ts`, export only SvelteKit-reserved names, type-only declarations, or
  `_`-prefixed private helpers. Put reusable runtime helpers in a non-route module instead.
- `src/lib/server/db/schema.ts` is the database schema source. Do not hand-edit generated
  `drizzle/meta/*.json`; follow the database skill so migrations and the manually mirrored test
  database remain aligned.
- Tests preload `tests/setup.ts`, which sets `DATABASE_PATH=:memory:` before dynamically importing
  the DB singleton. Do not statically import the singleton earlier or create ad-hoc databases for
  route/service tests.

## Scoped guidance

- `tests/helpers/README.md` — shared test DB, helper tiers, mock ordering, toast assertions, and
  Svelte rune-test contract. Read before adding or restructuring tests.
- `.augment/rules/bun-svelte-pro.md` — stack-level Svelte 5/SvelteKit/Bun/UnoCSS guidance. Read
  before new UI or framework boilerplate; repository scripts and this file override its generic
  command examples.
- `.claude/skills/database-schema-change/SKILL.md` — schema/migration/test-mirror workflow. Use for
  any table, column, index, constraint, or migration change.
