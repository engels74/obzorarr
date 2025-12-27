# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Obzorarr is a "Plex Wrapped" application that syncs viewing history from Plex Media Server and generates yearly statistics with animated slideshow presentations. Built with SvelteKit 5, Bun runtime, SQLite (Drizzle ORM), and UnoCSS + shadcn-svelte for styling.

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

## Development Commands

```bash
# Install dependencies
bun install

# Development server (http://localhost:3000)
bun run dev

# Build for production
bun run build

# Run built application
bun run start

# Type checking
bun run check

# Format code
bun run format

# Run all tests
bun test --env-file=.env.test

# Run a single test file
bun test tests/unit/stats/calculators.test.ts --env-file=.env.test

# Database migrations
bun run db:generate    # Generate migration files
bun run db:migrate     # Run migrations
bun run db:studio      # Open Drizzle Studio
```

## Architecture

### Server-Side Structure (`src/lib/server/`)

- **auth/**: Plex OAuth, session management, dev bypass mode (`DEV_BYPASS_AUTH=true`)
- **plex/**: Plex API client, pagination, server name service
- **sync/**: Background sync scheduler (croner), live sync, Plex accounts caching
- **stats/**: Statistics calculation engine with modular calculators (watch-time, ranking, distributions, percentile, binge-detector)
- **slides/**: Slide configuration, custom slides (markdown), renderer
- **funfacts/**: AI-generated or template-based fun facts system
- **sharing/**: Wrapped page visibility controls (public, private-oauth, private-link)
- **onboarding/**: First-run setup flow

### Request Flow

1. `hooks.server.ts` runs three middleware in sequence: auth → onboarding → authorization
2. Auth populates `event.locals.user` from session cookie
3. Onboarding redirects to `/onboarding/*` if setup incomplete
4. Admin routes (`/admin/*`) require `isAdmin: true`

### Database Schema (`src/lib/server/db/schema.ts`)

Key tables:
- `users`: Plex users who authenticated
- `playHistory`: Viewing history (intentionally no FK to users for historical preservation)
- `plexAccounts`: Cached server members for username display
- `cachedStats`: Pre-calculated statistics JSON
- `sessions`: Auth sessions with Plex token
- `slideConfig`/`customSlides`: Wrapped presentation configuration

### UI Components (`src/lib/components/`)

- `ui/`: Base shadcn-svelte components
- `slides/`: Individual slide components for wrapped presentation
- `wrapped/`: Wrapped slideshow container and controls
- `onboarding/`: Setup wizard components

### Routes (`src/routes/`)

- `/`: Landing/dashboard (redirects based on auth state)
- `/auth/*`: Plex OAuth callback
- `/admin/*`: Admin panel (users, sync, slides, settings)
- `/wrapped/*`: User's wrapped presentations
- `/onboarding/*`: First-run setup wizard
- `/api/*`: Internal API endpoints

## Testing

Tests use Bun's test runner with an in-memory SQLite database.

- **Unit tests** (`tests/unit/`): Test individual functions and services
- **Property tests** (`tests/property/`): Use fast-check for generative testing

Test setup (`tests/setup.ts`) mocks SvelteKit's `$env` modules and creates all database tables.

## Styling

UnoCSS with shadcn preset. Theme colors defined in `src/app.css` using CSS custom properties with oklch. Use the `cn()` utility from `$lib/utils.ts` for class merging.

## Dev Bypass Mode

Set `DEV_BYPASS_AUTH=true` in `.env` to skip Plex OAuth during development. Optionally set `DEV_BYPASS_USER` to simulate a specific user (empty=owner, "random", plexId, or username).
