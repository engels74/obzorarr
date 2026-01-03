# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Obzorarr is a "Plex Wrapped" application that generates annual statistics and animated slideshow presentations from Plex Media Server viewing history. It's built with Bun, SvelteKit 5, SQLite (Drizzle ORM), and uses GSAP/Motion for animations.

## Common Commands

```bash
# Development
bun install              # Install dependencies
bun run dev              # Start dev server (localhost:3000)

# Database
bun run db:generate      # Generate Drizzle migrations
bun run db:migrate       # Apply migrations (scripts/migrate.ts)
bun run db:studio        # Open Drizzle Studio GUI

# Testing
bun test                 # Run all tests (uses in-memory SQLite)
bun test <file>          # Run single test file

# Build & Production
bun run build            # Build for production
bun run preview          # Preview production build
bun run start            # Run production server (bun ./build)

# Code Quality
bun run check            # TypeScript + Svelte type checking
bun run format           # Format with Prettier
bun run format:check     # Check formatting
```

## Coding Guidelines

**Always follow the coding patterns established in:**
`.augment/rules/bun-svelte-pro.md`

Before making any changes, review this file to ensure consistency with project standards.

### Comment Philosophy

This codebase maintains a comment-minimal style. Follow these principles:

- **Remove redundant comments** that restate what the code does—the code is the documentation
- **Keep comments that explain WHY**, not WHAT (business logic rationale, non-obvious decisions)
- **Preserve essential context** that isn't obvious from reading the code itself
- **Avoid over-explanatory JSDoc** where TypeScript types already provide sufficient documentation
- **Never add section dividers** or decorative comment blocks

## Architecture

### Request Flow

Requests flow through sequential hooks in `src/hooks.server.ts`:

1. `requestFilterHandle` - Blocks suspicious requests (path traversal, etc.)
2. `rateLimitHandle` - Rate limiting for API endpoints
3. `proxyHandle` - Handles X-Forwarded-\* headers for reverse proxies
4. `csrfHandle` - CSRF protection
5. `initializationHandle` - One-time startup tasks (clears conflicting settings)
6. `securityHeadersHandle` - Sets security headers (X-Frame-Options, CSP, etc.)
7. `authHandle` - Session validation, populates `event.locals.user`
8. `onboardingHandle` - Redirects to setup wizard if not configured
9. `authorizationHandle` - Admin route protection

### Directory Structure

- **`src/lib/server/`** - Backend services (auth, sync, stats, plex client, etc.)
- **`src/lib/components/`** - Svelte components
  - `slides/` - Animated presentation slides (19 types)
  - `ui/` - shadcn/bits-ui primitives
- **`src/lib/stores/`** - Svelte runes stores (`*.svelte.ts`)
- **`src/routes/`** - SvelteKit routes with SSR data loading

### Key Services (`src/lib/server/`)

| Service          | Purpose                                                |
| ---------------- | ------------------------------------------------------ |
| `admin/`         | Settings management, user administration               |
| `anonymization/` | User stats anonymization (REAL, ANONYMOUS, HYBRID)     |
| `auth/`          | Plex OAuth flow, session management, dev bypass        |
| `funfacts/`      | AI-generated or templated fun facts                    |
| `logging/`       | Structured logging with retention policies             |
| `logo/`          | Wrapped logo visibility settings                       |
| `onboarding/`    | Setup wizard flow and step management                  |
| `plex/`          | Plex API client with pagination                        |
| `ratelimit/`     | Rate limiting for API endpoints                        |
| `security/`      | Request filtering, CSRF protection, security headers   |
| `sharing/`       | Share tokens, access modes (public/restricted/private) |
| `slides/`        | Slide configuration and custom slides                  |
| `stats/`         | Stats calculation with caching (1hr TTL)               |
| `sync/`          | History sync engine with Croner scheduler              |

### Database Schema (`src/lib/server/db/schema.ts`)

Key tables:

- `users` - Plex users (plexId vs accountId distinction matters)
- `playHistory` - Watch records (historyKey ensures uniqueness)
- `syncStatus` - Sync job tracking and progress
- `cachedStats` - Cached statistics with TTL
- `shareSettings` - Per-user, per-year share tokens and access modes
- `customSlides` - Admin-created custom slides with markdown content
- `slideConfig` - Slide ordering and enable/disable state
- `appSettings` - Key-value store for application settings
- `sessions` - User authentication sessions
- `logs` - Structured application logs with retention
- `plexAccounts` - Maps local accountId to Plex identity
- `metadataCache` - Cached metadata for media items (genres, duration, year)

### Account ID vs Plex ID

The codebase distinguishes between:

- **plexId** - Global Plex.tv user ID
- **accountId** - Local server account ID (used in watch history)

This matters for server owners who appear in history under accountId=1 but have a different plexId.

### Dev Authentication Bypass

Set in `.env` for development without real Plex OAuth:

```
DEV_BYPASS_AUTH=true
DEV_BYPASS_USER=              # empty=owner, "random", <plexId>, or <username>
DEV_PLEX_TOKEN=               # For onboarding testing when PLEX_TOKEN is empty
```

To test the onboarding flow, set `DEV_PLEX_TOKEN` to a valid Plex.tv token while leaving `PLEX_SERVER_URL` and `PLEX_TOKEN` empty.

## Testing

Tests use Bun's test runner with in-memory SQLite. Test setup (`tests/setup.ts`) mocks SvelteKit's `$env` modules and creates all database tables.

- **Unit tests**: `tests/unit/` - Direct function testing
- **Property tests**: `tests/property/` - fast-check based generative testing

Tests run with `--env-file=.env.test` (configured in package.json).

## Key Patterns

### SSR Data Loading

Data fetching happens in `+page.server.ts` files, not client-side API calls.

### Sync Progress

Uses Server-Sent Events (SSE) via `/api/sync/status/stream` for real-time progress updates.

### Validation

Zod schemas validate all external data (Plex API responses, form inputs).

### Logging

Uses structured logging via `logger` from `$lib/server/logging`. Logs are stored in SQLite with configurable retention.
