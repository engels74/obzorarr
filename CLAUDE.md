# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Obzorarr is a "Plex Wrapped" application - a SvelteKit web app that syncs viewing history from Plex Media Server and generates yearly statistics with an animated slideshow presentation (similar to Spotify Wrapped). It uses Bun as the runtime, SQLite for data storage, and supports Plex OAuth for authentication.

## Common Commands

```bash
# Development
bun run dev              # Start dev server (uses Vite)
bun run build            # Build for production
bun run preview          # Preview production build

# Type checking
bun run check            # Run svelte-check
bun run check:watch      # Watch mode

# Testing
bun test                 # Run all tests
bun test tests/unit      # Run unit tests only
bun test tests/property  # Run property-based tests only
bun test <filename>      # Run a specific test file

# Code formatting
bun run format           # Format with Prettier
bun run format:check     # Check formatting

# Database
bun run db:generate      # Generate Drizzle migrations
bun run db:migrate       # Apply migrations
bun run db:studio        # Open Drizzle Studio
```

## Architecture

### Tech Stack
- **Runtime**: Bun
- **Framework**: SvelteKit with Svelte 5
- **Database**: SQLite via Drizzle ORM
- **Styling**: UnoCSS with shadcn-svelte presets
- **Validation**: Zod schemas
- **Testing**: Bun test with fast-check for property-based testing

### Directory Structure

- `src/lib/server/` - Server-side modules (never imported client-side)
  - `auth/` - Plex OAuth, session management, membership verification
  - `db/` - Drizzle schema and client
  - `plex/` - Plex API client for fetching history
  - `sync/` - Sync service with scheduler for periodic history sync
  - `stats/` - Statistics engine with calculator modules
  - `slides/` - Slide configuration and custom slides service
  - `sharing/` - Wrapped page access control
  - `funfacts/` - AI-generated or templated fun facts
  - `anonymization/` - User anonymization modes for server stats

- `src/routes/` - SvelteKit routes
  - `/` - Home page with login/wrapped preview
  - `/admin/` - Admin dashboard (protected, requires isAdmin)
  - `/wrapped/[year]/` - User's yearly wrapped slideshow
  - `/auth/` - OAuth callback handling

- `src/lib/components/` - Svelte components
  - `slides/` - Individual slide components (TotalTimeSlide, TopMoviesSlide, etc.)
  - `wrapped/` - Wrapped presentation container and navigation

- `tests/` - Test files
  - `unit/` - Unit tests
  - `property/` - Property-based tests using fast-check
  - `setup.ts` - Test setup with in-memory SQLite

### Key Design Patterns

**Historical Data Preservation**: The `playHistory.accountId` is intentionally not a foreign key to `users.plexId`. This allows viewing history to persist when users are removed from Plex, enabling server-wide statistics and history restoration when users re-authenticate.

**Statistics Engine**: The stats engine (`src/lib/server/stats/engine.ts`) orchestrates multiple calculator modules and handles caching. Stats are validated with Zod schemas and cached in the database.

**Year Filtering**: All statistics use UTC timestamps. For any year Y, records are filtered where `viewedAt` falls between Jan 1 00:00:00 UTC and Dec 31 23:59:59 UTC.

**Server Hooks**: Authentication and authorization are handled in `src/hooks.server.ts`. Admin routes (`/admin/*`) require both authentication and `isAdmin` flag.

### Database

SQLite with Drizzle ORM. Schema is in `src/lib/server/db/schema.ts`. Key tables:
- `users` - Plex users with OAuth info
- `playHistory` - Synced viewing history from Plex
- `cachedStats` - Pre-calculated statistics JSON
- `sessions` - Authentication sessions
- `shareSettings` - Wrapped page visibility controls
- `customSlides` / `slideConfig` - Slide configuration

Migrations are in `drizzle/` and applied via `bun run db:migrate`.

### Environment Variables

See `.env.example` for all variables. Key ones:
- `PLEX_SERVER_URL` / `PLEX_TOKEN` - Plex server connection
- `DATABASE_PATH` - SQLite database file location
- `ORIGIN` - App URL for CSRF protection and OAuth callbacks
- `SYNC_CRON_SCHEDULE` - Cron schedule for automatic history sync

## Testing

Tests use Bun's built-in test runner. Property-based tests use fast-check for exhaustive input testing. Test setup (`tests/setup.ts`) creates an in-memory SQLite database with all tables.

Run specific property tests:
```bash
bun test tests/property/stats.property.test.ts
```
