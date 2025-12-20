# Tech Stack & Development

## Core Stack

| Layer | Technology |
|-------|------------|
| Runtime | Bun |
| Framework | SvelteKit 2 + Svelte 5 |
| Language | TypeScript (strict mode) |
| Styling | UnoCSS + unocss-preset-shadcn |
| UI Components | shadcn-svelte |
| Theming | tweakcn |
| Database | Bun native SQLite (via Drizzle ORM) |
| Animations | Motion One (primary) + GSAP (complex timelines) |
| Authentication | Plex OAuth |
| AI Integration | OpenAI-compatible endpoints (optional) |
| Scheduling | Croner |

## Svelte 5 Runes (Critical)

Use the new runes system, NOT Svelte 4 stores:

```svelte
// State
let count = $state(0);
let items = $state.raw<Item[]>([]); // For large immutable data

// Derived values (NOT $effect!)
const doubled = $derived(count * 2);
const total = $derived.by(() => items.reduce((a, b) => a + b, 0));

// Side effects (sparingly - DOM, analytics, third-party libs)
$effect(() => {
  // cleanup function required
  return () => cleanup();
});

// Props
let { title, count = 0 }: Props = $props();
```

## Key Patterns

- Use `{#snippet}` and `{@render}` instead of slots
- Use `.svelte.ts` files for shared reactive state
- Use context API for SSR-safe global state
- Use `+page.server.ts` for database/secrets, `+page.ts` for external APIs
- Use form actions with `use:enhance` for progressive enhancement
- Use `$env/static/private` for server secrets

## Database

```typescript
// Enable WAL mode for concurrent reads
db.run('PRAGMA journal_mode = WAL;');
db.run('PRAGMA synchronous = NORMAL;');

// Always use parameterized queries
const stmt = db.query('SELECT * FROM users WHERE id = ?');
```

## Commands

```bash
# Development
bun run dev

# Build
bun run build

# Preview production build
bun run preview

# Type checking
bun run check

# Tests
bun test

# Database migrations
bun run db:generate
bun run db:migrate

# Generate Plex API client
bun run generate:plex-client
```

## Animation Guidelines

- Use Motion One for most animations (hardware-accelerated WAAPI)
- Use GSAP only for complex timelines or SVG morphing
- Always return cleanup functions in `$effect`
- Respect `prefers-reduced-motion`
- Animate only `transform`, `opacity`, `filter`, `clipPath` for GPU acceleration
