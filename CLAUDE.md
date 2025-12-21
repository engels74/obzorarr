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

Obzorarr is a "Plex Wrapped" application - a year-in-review statistics generator for Plex Media Server. It syncs viewing history from Plex and generates animated slideshow presentations showing yearly statistics (similar to Spotify Wrapped).

**Stack**: Bun runtime, SvelteKit + Svelte 5, SQLite via Drizzle ORM, UnoCSS + shadcn-svelte, GSAP + Motion for animations.

## Commands

```bash
# Development
bun install              # Install dependencies
bun run dev              # Start dev server (http://localhost:3000)
bun run build            # Production build
bun run preview          # Preview production build

# Testing
bun test                 # Run all tests (unit + property tests)
bun test tests/unit/stats/calculators.test.ts  # Run single test file

# Type checking
bun run check            # Run svelte-check

# Code quality
bun run format           # Format with Prettier
bun run format:check     # Check formatting

# Database
bun run db:generate      # Generate Drizzle migrations
bun run db:migrate       # Run migrations (uses scripts/migrate.ts)
bun run db:studio        # Open Drizzle Studio GUI
```

## Architecture

### Server-Side Structure (`src/lib/server/`)

- **auth/**: Plex OAuth authentication, session management, membership verification
- **db/**: SQLite client (`client.ts`) and schema definitions (`schema.ts`)
- **plex/**: Plex API client for fetching history and metadata
- **sync/**: Background sync service that fetches viewing history from Plex
  - `service.ts`: Core sync logic with incremental and backfill modes
  - `scheduler.ts`: Cron-based automatic sync
- **stats/**: Statistics calculation engine
  - `engine.ts`: Orchestrates calculators, handles caching
  - `calculators/`: Individual stat calculators (watch-time, rankings, percentiles, binge detection)
- **slides/**: Slide configuration and custom markdown slides
- **sharing/**: Share settings and access control for wrapped pages
- **anonymization/**: User anonymization modes (real, anonymous, hybrid)
- **funfacts/**: AI-generated fun facts with OpenAI integration + fallback templates
- **logging/**: Application logging with database persistence

### Routes (`src/routes/`)

- `/`: Home page (login or redirect to dashboard)
- `/dashboard/`: User dashboard
- `/wrapped/[year]/`: Animated wrapped slideshow for authenticated user
- `/wrapped/[year]/u/[identifier]/`: Shared wrapped page
- `/admin/*`: Admin-only routes (sync, users, slides, settings, logs)
- `/auth/plex`: Plex OAuth callback
- `/plex/thumb/[...path]`: Proxies Plex thumbnail images

### Client Components (`src/lib/components/`)

- **slides/**: Individual slide components (TotalTimeSlide, TopMoviesSlide, etc.)
- **wrapped/**: Slideshow navigation components (StoryMode, ScrollMode, ProgressBar)

### Database Schema

Key tables in `src/lib/server/db/schema.ts`:
- `users`: Plex user accounts
- `playHistory`: Viewing history records (not FK-linked to users for data preservation)
- `syncStatus`: Sync operation tracking
- `cachedStats`: Pre-calculated statistics cache
- `shareSettings`: Per-user visibility controls
- `customSlides`: Admin-created markdown slides
- `slideConfig`: Slide ordering and visibility

### Hooks

`src/hooks.server.ts` handles:
1. Authentication middleware (validates session cookie)
2. Authorization middleware (protects `/admin/*` routes)
3. Dev bypass mode (`DEV_BYPASS_AUTH=true` skips Plex OAuth in development)

## Testing

Tests use Bun's built-in test runner with `bun:test`:
- **Unit tests**: `tests/unit/` - standard unit tests
- **Property tests**: `tests/property/` - property-based tests using `fast-check`

Test setup in `tests/setup.ts`.

## Environment Variables

See `.env.example` for all options. Key variables:
- `PLEX_SERVER_URL` / `PLEX_TOKEN`: Plex server connection
- `DATABASE_PATH`: SQLite database location
- `ORIGIN`: Application URL for OAuth callbacks
- `SYNC_CRON_SCHEDULE`: Auto-sync cron expression
- `DEV_BYPASS_AUTH`: Skip Plex OAuth in development

## Key Patterns

- **Account ID vs Plex ID**: `playHistory.accountId` is the server's local account ID; `users.plexId` is the Plex.tv account ID. The schema intentionally doesn't FK-link these to preserve historical data when users are removed.
- **Stats Caching**: Stats are cached in `cachedStats` table. Cache is invalidated after sync operations.
- **Year Filtering**: Stats engine uses UTC year boundaries (Jan 1 00:00:00 to Dec 31 23:59:59).
