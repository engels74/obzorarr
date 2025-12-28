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
bun run db:migrate       # Apply migrations
bun run db:studio        # Open Drizzle Studio GUI

# Testing
bun test                 # Run all tests (uses in-memory SQLite)
bun test tests/unit/stats/percentile.test.ts  # Run single test file

# Build & Production
bun run build            # Build for production
bun run preview          # Preview production build
bun ./build              # Run production server

# Code Quality
bun run check            # TypeScript + Svelte type checking
bun run format           # Format with Prettier
bun run format:check     # Check formatting
```

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

1. `authHandle` - Session validation, populates `event.locals.user`
2. `onboardingHandle` - Redirects to setup wizard if needed
3. `authorizationHandle` - Admin route protection

### Directory Structure

- **`src/lib/server/`** - Backend services (auth, sync, stats, plex client, etc.)
- **`src/lib/components/`** - Svelte components
  - `slides/` - Animated presentation slides (17 types)
  - `ui/` - shadcn/bits-ui primitives
- **`src/lib/stores/`** - Svelte runes stores (`*.svelte.ts`)
- **`src/routes/`** - SvelteKit routes with SSR data loading

### Key Services (`src/lib/server/`)

| Service     | Purpose                                                |
| ----------- | ------------------------------------------------------ |
| `auth/`     | Plex OAuth flow, session management, dev bypass        |
| `plex/`     | Plex API client with pagination                        |
| `sync/`     | History sync engine with Croner scheduler              |
| `stats/`    | Stats calculation with caching (1hr TTL)               |
| `slides/`   | Slide configuration and custom slides                  |
| `funfacts/` | AI-generated or templated fun facts                    |
| `sharing/`  | Share tokens, access modes (public/restricted/private) |

### Database Schema (`src/lib/server/db/schema.ts`)

Key tables:

- `users` - Plex users (plexId vs accountId distinction matters)
- `playHistory` - Watch records (historyKey ensures uniqueness)
- `cachedStats` - Cached statistics with TTL
- `shareSettings` - Per-user, per-year share tokens
- `plexAccounts` - Maps local accountId to Plex identity

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
```

## Testing

Tests use Bun's test runner with in-memory SQLite. Test setup (`tests/setup.ts`) mocks SvelteKit's `$env` modules.

- **Unit tests**: `tests/unit/` - Direct function testing
- **Property tests**: `tests/property/` - fast-check based property testing

## Key Patterns

### SSR Data Loading

Data fetching happens in `+page.server.ts` files, not client-side API calls.

### Sync Progress

Uses Server-Sent Events (SSE) via `/api/sync/status/stream` for real-time progress updates.

### Validation

Zod schemas validate all external data (Plex API responses, form inputs).

### Anonymization

Stats can be anonymized per-user with modes: REAL, ANONYMOUS, HYBRID.
