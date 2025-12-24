# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Codebase Search Strategy

**Always use `mcp__auggie-mcp__codebase-retrieval` as your primary method for:**

- Exploring the codebase and understanding architecture
- Finding existing patterns before implementing new features
- Locating relevant code when the exact file location is unknown
- Gathering context before making edits
- Planning tasks in plan mode

> **Note:** This semantic search tool provides better results than grep/find for understanding code relationships. Use grep only for finding exact string matches or all occurrences of a known identifier.

## Coding Guidelines

**Always follow the coding patterns established in:**
`.augment/rules/bun-svelte-pro.md`

Before making any changes, review this file to ensure consistency with project standards.

## Project Overview

Obzorarr is a "Plex Wrapped" application that syncs viewing history from Plex Media Server and generates yearly statistics with animated slideshow presentations. Built with Bun, SvelteKit, Svelte 5, SQLite (Drizzle ORM), UnoCSS, and GSAP/Motion for animations.

## Common Commands

```bash
# Development
bun install              # Install dependencies
bun run dev              # Start dev server at http://localhost:3000
bun run build            # Production build
bun run start            # Run production build

# Database
bun run db:migrate       # Run migrations
bun run db:generate      # Generate migration from schema changes
bun run db:studio        # Open Drizzle Studio GUI

# Quality
bun run check            # Type check with svelte-check
bun run test             # Run tests (uses .env.test)
bun run format           # Format with Prettier
bun run format:check     # Check formatting

# Run single test file
bun test tests/unit/auth/session.test.ts
```

## Architecture

### Directory Structure

- `src/lib/server/` - All server-only code (database, Plex API, sync, stats, auth)
- `src/lib/components/` - Svelte components (slides/, wrapped/, ui/)
- `src/lib/stores/` - Svelte 5 rune-based stores (.svelte.ts files)
- `src/routes/` - SvelteKit file-based routing
- `tests/` - Test suite (unit/, property/, integration/)
- `drizzle/` - Database migrations

### Key Server Modules

- `src/lib/server/db/schema.ts` - Drizzle schema defining all tables
- `src/lib/server/db/client.ts` - Database connection
- `src/lib/server/plex/client.ts` - Plex Media Server API client
- `src/lib/server/sync/` - Background sync system with croner scheduler
- `src/lib/server/auth/` - Plex OAuth + session management
- `src/lib/server/stats/` - Statistics calculation services
- `src/lib/server/slides/` - Slide data generation
- `src/lib/server/funfacts/` - AI and templated fun fact generation

### Data Flow

1. Users authenticate via Plex OAuth (`src/lib/server/auth/plex-oauth.ts`)
2. Background scheduler syncs play history from Plex (`src/lib/server/sync/scheduler.ts`)
3. Stats are calculated and cached per user/year (`src/lib/server/stats/`)
4. Slides render animated year-in-review presentations (`src/lib/components/slides/`)

### Slide System

13 built-in slide types in `src/lib/components/slides/`:
- TotalTimeSlide, TopMoviesSlide, TopShowsSlide, TopViewersSlide
- GenresSlide, DistributionSlide, PercentileSlide, BingeSlide
- FirstLastSlide, FunFactSlide, CustomSlide

All extend BaseSlide.svelte. View modes: StoryMode (animated slideshow), ScrollMode.

## Testing

Uses Bun's native test runner with in-memory SQLite. Test setup in `tests/setup.ts` creates tables and mocks Plex API.

```bash
bun test                          # All tests
bun test tests/unit/sharing/      # Directory
bun test --watch                  # Watch mode
```

Coverage threshold: 80% (configured in bunfig.toml).

## Development Auth Bypass

Set in `.env` for local development without Plex OAuth:
```
DEV_BYPASS_AUTH=true
DEV_BYPASS_USER=random  # or specific plexId/username
```
Only works in dev mode, ignored in production builds.

## Tech Stack Patterns

### Svelte 5 Runes
- Use `$state()` for reactive values
- Use `$derived()` for computed values (not `$effect`)
- Use `$effect()` only for side effects (localStorage, DOM manipulation)
- Use `$props()` for component props
- Use snippets instead of slots for composition

### Form Handling
- Use SvelteKit form actions for mutations, not +server.ts POST endpoints
- Add `use:enhance` for progressive enhancement

### Animations
- GSAP for complex scroll-linked animations and timelines
- Motion for simple UI transitions
- Always clean up with `return () => animation.stop()` in `$effect`

### Database
- Drizzle ORM with SQLite
- Play history table intentionally has no FK to users to preserve history after user removal
- Use parameterized queries (never string interpolation)

## Environment Variables

Key variables (see `.env.example`):
- `ORIGIN` - App URL for OAuth callbacks (required)
- `PLEX_SERVER_URL`, `PLEX_TOKEN` - Plex connection (can also set in admin UI)
- `DATABASE_PATH` - SQLite file location
- `SYNC_CRON_SCHEDULE` - Auto-sync schedule (default: `0 */6 * * *`)
- `OPENAI_API_URL`, `OPENAI_API_KEY` - Optional AI fun facts
