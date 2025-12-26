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

Obzorarr is a "Plex Wrapped" application that syncs viewing history from a Plex Media Server and generates yearly statistics with an animated slideshow presentation (similar to Spotify Wrapped).

**Tech Stack:**
- Runtime: Bun
- Framework: SvelteKit + Svelte 5
- Database: SQLite with Drizzle ORM
- Styling: UnoCSS + shadcn-svelte
- Animation: GSAP + Motion

## Commands

```bash
# Install dependencies
bun install

# Development server (http://localhost:3000)
bun run dev

# Type checking
bun run check

# Build for production
bun run build

# Preview production build
bun run preview

# Start production server
bun run start

# Run all tests
bun test

# Run single test file
bun test tests/unit/stats/engine.test.ts

# Run tests matching pattern
bun test --filter "calculateUserStats"

# Format code
bun run format

# Check formatting
bun run format:check

# Database operations
bun run db:generate   # Generate migration from schema changes
bun run db:migrate    # Apply migrations
bun run db:studio     # Open Drizzle Studio UI
```

## Architecture

### Server-Side Structure (`src/lib/server/`)

The server code follows a service-oriented architecture:

- **db/** - Drizzle ORM schema and database client. Schema defines tables for users, play_history, sync_status, cached_stats, custom_slides, etc.
- **sync/** - Plex history sync service. Fetches from Plex API, stores in play_history, handles incremental sync via `lastViewedAt` timestamps. Includes metadata enrichment (duration, genres) after sync.
- **stats/** - Statistics calculation engine. Calculators in `calculators/` compute watch time, rankings, percentiles, binge detection, distributions. Results are cached in `cached_stats` table.
- **auth/** - Plex OAuth authentication and session management. Sessions stored in database with expiration.
- **slides/** - Slide configuration and custom slide management. Controls which slides appear and in what order.
- **funfacts/** - AI-powered or template-based fun facts generation using OpenAI-compatible APIs.
- **anonymization/** - User identity anonymization for server-wide statistics (real/anonymous/hybrid modes).
- **logging/** - Persistent logging service with retention policies.
- **ratelimit/** - Rate limiting service for API endpoints.

### Frontend Structure

- **routes/** - SvelteKit file-based routing
  - `/` - Home/login page
  - `/dashboard` - User dashboard
  - `/wrapped` - Animated statistics slideshow
  - `/admin/*` - Admin panel (sync, logs, settings, slides, users)
- **components/slides/** - Slide presentation components (TotalTimeSlide, TopMoviesSlide, etc.). Each slide uses GSAP/Motion for entrance animations.
- **components/ui/** - shadcn-svelte UI components
- **stores/** - Svelte 5 state stores (slide-state.svelte.ts)

### Key Data Flow

1. **Sync**: Plex API → `startSync()` → play_history table → metadata enrichment
2. **Stats**: play_history → `calculateUserStats()`/`calculateServerStats()` → cached_stats table
3. **Display**: cached_stats → Wrapped page → Slide components with animations

### Authentication Flow

- Plex OAuth flow via `/auth/plex` and `/auth/plex/callback`
- Sessions stored in database, validated on each request via `hooks.server.ts`
- Server owner automatically gets admin privileges
- Dev bypass available via `DEV_BYPASS_AUTH=true` environment variable

### Database Schema Highlights

- `playHistory.accountId` is NOT a foreign key to users - intentionally preserves history when users leave
- `plexAccounts` caches all server members for username display in stats
- `metadataCache` stores fetched duration/genres to avoid repeated Plex API calls

## Testing

Tests are in `tests/` with three categories:
- `unit/` - Unit tests for individual services and calculators
- `property/` - Property-based tests using fast-check
- `integration/` - Integration tests

Tests use `setup.ts` for database mocking and test utilities.

## Environment Variables

Key configuration (see `.env.example` for full list):
- `PLEX_SERVER_URL` - Plex server URL
- `PLEX_TOKEN` - Plex authentication token
- `DATABASE_PATH` - SQLite database path
- `SYNC_CRON_SCHEDULE` - Auto-sync schedule (cron format)
- `DEV_BYPASS_AUTH` - Skip Plex OAuth in development
