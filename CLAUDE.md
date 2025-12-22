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

## Commands

```bash
# Development
bun run dev              # Start dev server with hot reload (localhost:3000)
bun run build            # Production build
bun run preview          # Preview production build

# Code quality
bun run check            # Type check with svelte-check
bun run format           # Format with Prettier (tabs, single quotes, 100 char width)
bun run format:check     # Check formatting

# Database
bun run db:generate      # Generate Drizzle migrations
bun run db:migrate       # Run migrations
bun run db:studio        # Open Drizzle Studio UI

# Testing
bun test                 # Run all tests
bun test <file>          # Run specific test file
bun test --watch         # Watch mode
```

## Architecture

Obzorarr is a "Plex Wrapped" application - syncs viewing history from Plex and generates yearly statistics with an animated slideshow.

### Stack

- **Runtime**: Bun
- **Framework**: SvelteKit 2 + Svelte 5
- **Database**: SQLite via Drizzle ORM
- **Styling**: UnoCSS + shadcn-svelte
- **Animation**: GSAP + Motion

### Key Directories

```
src/lib/server/           # Backend services
  ├── stats/              # Stats calculation engine with modular calculators
  ├── sync/               # Background Plex sync (Croner scheduler)
  ├── funfacts/           # AI/template fun facts with persona registry
  ├── plex/               # Plex API client (Zod-validated)
  ├── auth/               # Plex OAuth + session management
  ├── sharing/            # Share modes (public, private-oauth, private-link)
  └── db/                 # Drizzle schema and client

src/lib/components/       # Svelte components
  ├── slides/             # Slide type components (10+ types)
  └── ui/                 # shadcn-svelte base components

src/routes/               # SvelteKit routes
  ├── admin/              # Admin dashboard (settings, users, logs, sync)
  ├── wrapped/            # Year-in-review slideshow pages
  └── auth/               # OAuth flow endpoints
```

### Service Patterns

Services follow a modular pattern:

- `*service.ts` - Business logic
- `types.ts` - Zod schemas and TypeScript types
- Index files for clean exports

Stats engine uses composable calculators in `stats/calculators/` orchestrated by `engine.ts`.

Fun facts use a template registry pattern with AI fallback - templates in `funfacts/templates/` registered via `registry.ts`.

### Database

SQLite with Drizzle ORM. Schema in `src/lib/server/db/schema.ts`.

Key design decision: `playHistory.accountId` is intentionally NOT a foreign key to preserve historical data when users leave the Plex server.

Migrations auto-run on startup. Database path: `data/obzorarr.db` (or `DATABASE_PATH` env var).

### Authentication

Plex PIN-based OAuth flow. Session validation in `hooks.server.ts` via `authHandle` middleware.

Dev bypass mode: Set `DEV_BYPASS_AUTH=true` to skip OAuth in development.

### Testing

Bun's native test runner with `fast-check` for property-based tests.

Test setup (`tests/setup.ts`) configures in-memory SQLite and mocks SvelteKit `$env` modules.

Structure:

- `tests/unit/` - Unit tests by domain
- `tests/property/` - Property-based tests
- `tests/integration/` - Integration tests

### Environment Variables

Required:

- `PLEX_SERVER_URL` - Plex server address
- `PLEX_TOKEN` - Plex auth token
- `ORIGIN` - App URL for OAuth callbacks

Optional AI fun facts:

- `OPENAI_API_URL`, `OPENAI_API_KEY`, `OPENAI_MODEL`
