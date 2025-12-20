# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Coding Guidelines

**Follow `.augment/rules/bun-svelte-pro.md`** for all implementation work. This contains comprehensive Bun + Svelte 5 patterns and best practices.

## Codebase Search

**Always use the `mcp__auggie-mcp__codebase-retrieval` tool as the primary method for:**
- Exploring the codebase and understanding architecture
- Finding existing patterns before implementing new features
- Locating relevant code when the exact file location is unknown
- Gathering context before making edits
- Planning tasks in plan mode

This semantic search tool provides better results than grep/find for understanding code relationships. Use grep only for finding exact string matches or all occurrences of a known identifier.

## Project Overview

Obzorarr is a self-hosted "Year in Review" application for Plex Media Server. It generates Spotify Wrapped-style viewing summaries with a Soviet/communist aesthetic, designed for Docker deployment.

**Status**: Specification and planning phase - implementation not yet started.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Runtime | Bun |
| Framework | SvelteKit 2 + Svelte 5 |
| Language | TypeScript (strict mode, `noUncheckedIndexedAccess: true`) |
| Styling | UnoCSS + unocss-preset-shadcn |
| UI Components | shadcn-svelte + tweakcn theming |
| Database | Bun native SQLite (`bun:sqlite`) + Drizzle ORM |
| Animations | Motion One (primary) + GSAP (complex timelines) |
| Validation | Zod + Superforms |
| Scheduling | Croner |
| Testing | Bun test runner + fast-check (property-based) |

## Development Commands

```bash
bun run dev              # Development server
bun run build            # Production build
bun run preview          # Preview production build
bun run check            # Type checking (svelte-check + tsc)
bun test                 # Run test suite
bun run db:generate      # Generate database migrations
bun run db:migrate       # Apply migrations
bun run generate:plex-client  # Generate Plex API client
```

## Critical: Svelte 5 Runes

**Use Svelte 5 runes, NOT Svelte 4 stores.** This is mandatory throughout the codebase.

```svelte
<script lang="ts">
  // State (NOT writable() stores)
  let count = $state(0);
  let items = $state.raw<Item[]>([]);  // For large immutable data

  // Derived values (NOT $: reactive statements)
  const doubled = $derived(count * 2);
  const total = $derived.by(() => items.reduce((a, b) => a + b, 0));

  // Side effects - use sparingly, only for DOM/analytics/third-party libs
  $effect(() => {
    // Always return cleanup function
    return () => cleanup();
  });

  // Props (NOT export let)
  let { title, count = 0 }: Props = $props();
</script>
```

Use `{#snippet}` and `{@render}` instead of slots.

## Architecture

Three-layer design:
1. **Data Collection** - Plex API client with pagination, incremental sync, SQLite storage
2. **Statistics Processing** - Modular calculators, caching, 23 formal correctness properties
3. **Presentation** - Story Mode (full-screen slides) + Scroll Mode (scrollable page)

### Key Conventions

- **Server-only code**: `src/lib/server/` (import via `$lib/server/*`)
- **Shared reactive state**: `.svelte.ts` files with runes
- **Server secrets**: Use `$env/static/private`, never expose to client
- **Forms**: Named actions with `use:enhance` for progressive enhancement
- **Database**: WAL mode enabled, parameterized queries always

## Database Patterns

```typescript
// Enable WAL mode for concurrent reads
db.run('PRAGMA journal_mode = WAL;');
db.run('PRAGMA synchronous = NORMAL;');
db.run('PRAGMA foreign_keys = ON;');

// Always use parameterized queries (SQL injection prevention)
const stmt = db.query('SELECT * FROM users WHERE id = ?');
```

## Animation Guidelines

- **Motion One** for most animations (2.6-18kb, hardware-accelerated WAAPI)
- **GSAP** only for complex timelines or SVG morphing
- Always return cleanup in `$effect`
- Respect `prefers-reduced-motion`
- Animate only GPU-accelerated properties: `transform`, `opacity`, `filter`, `clipPath`

## Testing

Property-based testing with 23 formal correctness properties defined in `.kiro/specs/obzorarr/design.md`.

```bash
bun test                    # Run all tests
bun test --watch            # Watch mode
bun test tests/unit/        # Run specific directory
```

- Minimum 100 iterations per property-based test
- Coverage threshold: 80% lines and functions
- Test tag format: `Feature: obzorarr, Property {N}: {title}`

## Project Structure

```
src/
├── routes/                 # SvelteKit file-based routing
│   ├── admin/             # Admin panel (protected)
│   ├── wrapped/[year]/    # Year in review pages
│   └── auth/plex/         # OAuth callback
├── lib/
│   ├── server/            # Server-only (db, auth, sync, stats)
│   ├── components/        # UI, slides, admin components
│   └── generated/         # Generated Plex API client
└── hooks.server.ts        # Auth hook, error handling

tests/
├── unit/                  # Unit tests
└── property/              # Property-based tests
```

## Key Documentation

- **Best practices**: `.augment/rules/bun-svelte-pro.md` (Bun + Svelte 5 patterns)
- **Requirements**: `.kiro/specs/obzorarr/requirements.md` (17 requirements with acceptance criteria)
- **Design**: `.kiro/specs/obzorarr/design.md` (architecture, 23 correctness properties)
- **Implementation roadmap**: `.kiro/specs/obzorarr/tasks.md` (21 phases)
- **Plex API**: `docs/api_docs/plex_media_server-openapi.json`
