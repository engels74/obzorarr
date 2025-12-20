# Project Structure

```
src/
├── routes/                      # SvelteKit routes
│   ├── +page.svelte            # Public landing page
│   ├── +layout.svelte          # Root layout
│   ├── auth/
│   │   └── plex/+server.ts     # OAuth callback
│   ├── admin/
│   │   ├── +layout.svelte      # Admin layout (protected)
│   │   ├── +page.svelte        # Dashboard
│   │   ├── sync/               # Sync management
│   │   ├── users/              # User management
│   │   ├── slides/             # Slide configuration
│   │   └── settings/           # API, theme, archive settings
│   ├── wrapped/
│   │   └── [year]/
│   │       ├── +page.svelte    # Server-wide wrapped
│   │       └── u/
│   │           └── [identifier]/+page.svelte  # Per-user wrapped
│   └── api/                    # API endpoints
│
├── lib/
│   ├── components/
│   │   ├── slides/             # Individual slide components
│   │   ├── wrapped/            # StoryMode, ScrollMode, ModeToggle
│   │   └── ui/                 # shadcn-svelte components
│   │
│   ├── server/                 # Server-only code
│   │   ├── db/
│   │   │   ├── client.ts       # Database connection
│   │   │   └── schema.ts       # Drizzle schema
│   │   ├── auth/
│   │   │   ├── plex-oauth.ts   # OAuth flow
│   │   │   └── session.ts      # Session management
│   │   ├── plex/
│   │   │   └── client.ts       # Plex API client
│   │   ├── sync/
│   │   │   ├── service.ts      # Sync logic
│   │   │   └── scheduler.ts    # Croner scheduling
│   │   ├── stats/
│   │   │   ├── engine.ts       # Stats facade
│   │   │   └── calculators/    # Individual calculators
│   │   ├── sharing/
│   │   │   └── service.ts      # Share settings & tokens
│   │   └── funfacts/
│   │       └── service.ts      # Fun fact generation
│   │
│   ├── generated/              # Generated code (Plex client)
│   └── stores.svelte.ts        # Shared reactive state (runes)
│
├── hooks.server.ts             # Auth hook, error handling
└── app.d.ts                    # Type declarations

drizzle/                        # Database migrations
docs/
├── api_docs/                   # OpenAPI specs
│   └── plex_media_server-openapi.json
└── obzorarr-prompt.md          # Project specification

tests/                          # Property-based and unit tests
```

## Key Conventions

- Server-only code lives in `src/lib/server/` (never imported client-side)
- Use `$lib/server/*` imports for server modules
- Slide components are modular and self-contained
- Each calculator in `stats/calculators/` handles one statistic type
- Generated Plex client goes in `src/lib/generated/`
- Database schema defined with Drizzle ORM in single schema file
