# Design Document: Obzorarr

## Overview

Obzorarr is a SvelteKit application built with Bun runtime that generates Spotify Wrapped-style viewing summaries for Plex Media Server users.

### Tech Stack (per bun-svelte-pro.md guidelines)

- **Bun** runtime with native SQLite (`bun:sqlite`) and WAL mode
- **SvelteKit + Svelte 5** with runes (`$state`, `$derived`, `$effect`, `$props`)
- **TypeScript** strict mode with `noUncheckedIndexedAccess`
- **Drizzle ORM** for type-safe database access
- **UnoCSS + unocss-preset-shadcn** for styling
- **shadcn-svelte** UI components
- **tweakcn** for theme customization
- **Motion One + GSAP** for animations
- **Croner** for cron scheduling
- **Zod** for runtime validation

### Key Svelte 5 Patterns

- Use `$state.raw()` for large API responses (stats arrays)
- Use `$derived()` for computed values, `$derived.by()` for complex logic
- Use `$effect()` with cleanup for animations
- Use `{#snippet}` and `{@render}` instead of slots
- Use `.svelte.ts` files for shared reactive state

## Architecture

The system has three layers: Data Collection, Statistics Processing, and Presentation.

## Components

### Database (Bun SQLite + Drizzle)

Uses `bun:sqlite` with WAL mode, Drizzle ORM for migrations.

### Plex Client

Server-only module using `$env/static/private` for tokens. Implements paginated fetch for `/status/sessions/history/all`.

### Stats Engine

Calculates watch time, rankings, distributions, percentiles, and binge detection.

### Slide System

Modular slide components with Motion One animations and GSAP ScrollTrigger.

## Data Models

### Drizzle Schema

Tables: users, play_history, sync_status, cached_stats, share_settings, custom_slides, slide_config, app_settings, sessions.

## File Structure

Standard SvelteKit layout with `$lib/server/` for server-only code.


## Detailed Component Interfaces

### 1. Database Client

```typescript
// src/lib/server/db/client.ts
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import * as schema from './schema';

const sqlite = new Database(process.env.DATABASE_PATH ?? 'data/obzorarr.db', {
  strict: true,
  create: true
});

// WAL mode for concurrent reads (per guidelines)
sqlite.exec('PRAGMA journal_mode = WAL');
sqlite.exec('PRAGMA synchronous = NORMAL');
sqlite.exec('PRAGMA foreign_keys = ON');
sqlite.exec('PRAGMA busy_timeout = 5000');

export const db = drizzle(sqlite, { schema });
```

### 2. Plex API Client

```typescript
// src/lib/server/plex/client.ts
import { PLEX_TOKEN, PLEX_SERVER_URL } from '$env/static/private';

const PLEX_HEADERS = {
  'Accept': 'application/json',
  'X-Plex-Token': PLEX_TOKEN,
  'X-Plex-Client-Identifier': 'obzorarr',
  'X-Plex-Product': 'Obzorarr',
  'X-Plex-Version': '1.0.0'
} as const;

export async function plexRequest<T>(endpoint: string): Promise<T> {
  const response = await fetch(new URL(endpoint, PLEX_SERVER_URL), {
    headers: PLEX_HEADERS
  });
  if (!response.ok) throw new Error(`Plex API error: ${response.status}`);
  return response.json();
}
```

### 3. Auth Hook

```typescript
// src/hooks.server.ts
import type { Handle } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
  const sessionId = event.cookies.get('session');
  if (sessionId) {
    event.locals.user = await validateSession(sessionId);
  }
  
  if (event.url.pathname.startsWith('/admin') && !event.locals.user?.isAdmin) {
    throw redirect(303, '/');
  }
  
  return resolve(event);
};
```

### 4. Sync Service with Croner

```typescript
// src/lib/server/sync/scheduler.ts
import { Cron } from 'croner';

export function setupSyncScheduler(cronExpression: string) {
  return new Cron(cronExpression, {
    name: 'plex-sync',
    timezone: 'UTC',
    protect: true,
    catch: (err, job) => console.error(`Sync job failed:`, err)
  }, async () => {
    await runSync();
  });
}
```

### 5. Stats Engine Types

```typescript
// src/lib/server/stats/types.ts
interface UserStats {
  userId: number;
  year: number;
  totalWatchTimeMinutes: number;
  totalPlays: number;
  topMovies: RankedItem[];
  topShows: RankedItem[];
  topGenres: RankedItem[];
  watchTimeByMonth: number[];
  watchTimeByHour: number[];
  percentileRank: number;
  longestBinge: BingeSession | null;
  firstWatch: WatchRecord | null;
  lastWatch: WatchRecord | null;
}

interface RankedItem {
  rank: number;
  title: string;
  count: number;
  thumb: string | null;
}
```

### 6. Svelte 5 Component Example

```svelte
<!-- src/lib/components/slides/TotalTimeSlide.svelte -->
<script lang="ts">
  import { animate, spring } from 'motion';
  import type { Snippet } from 'svelte';
  
  interface Props {
    totalMinutes: number;
    children?: Snippet;
  }
  
  let { totalMinutes, children }: Props = $props();
  
  // Use $derived for computed values
  const hours = $derived(Math.floor(totalMinutes / 60));
  const days = $derived((totalMinutes / 60 / 24).toFixed(1));
  
  let container: HTMLElement;
  
  // Use $effect with cleanup for animations
  $effect(() => {
    if (!container) return;
    const animation = animate(container, 
      { opacity: [0, 1], transform: ['scale(0.9)', 'scale(1)'] },
      { duration: 0.6, easing: spring() }
    );
    return () => animation.stop();
  });
</script>

<div bind:this={container} class="slide">
  <h2>You watched</h2>
  <p class="stat">{hours} hours</p>
  <p class="sub">That's {days} days!</p>
  {#if children}
    {@render children()}
  {/if}
</div>
```

### 7. Form Action with Zod Validation

```typescript
// src/routes/admin/settings/+page.server.ts
import { fail } from '@sveltejs/kit';
import { z } from 'zod';
import type { Actions } from './$types';

const settingsSchema = z.object({
  plexUrl: z.string().url(),
  cronSchedule: z.string().regex(/^[\d\s\*\/\-,]+$/),
  defaultShareMode: z.enum(['public', 'private-oauth', 'private-link'])
});

export const actions: Actions = {
  default: async ({ request }) => {
    const formData = await request.formData();
    const data = Object.fromEntries(formData);
    
    const result = settingsSchema.safeParse(data);
    if (!result.success) {
      return fail(400, { errors: result.error.flatten().fieldErrors });
    }
    
    await saveSettings(result.data);
    return { success: true };
  }
};
```


## Database Schema (Drizzle)

```typescript
// src/lib/server/db/schema.ts
import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  plexId: integer('plex_id').unique().notNull(),
  username: text('username').notNull(),
  email: text('email'),
  thumb: text('thumb'),
  isAdmin: integer('is_admin', { mode: 'boolean' }).default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).defaultNow()
});

export const playHistory = sqliteTable('play_history', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  historyKey: text('history_key').unique().notNull(),
  ratingKey: text('rating_key').notNull(),
  title: text('title').notNull(),
  type: text('type').notNull(),
  viewedAt: integer('viewed_at').notNull(),
  accountId: integer('account_id').notNull(),
  librarySectionId: integer('library_section_id').notNull(),
  thumb: text('thumb'),
  duration: integer('duration'),
  grandparentTitle: text('grandparent_title'),
  parentTitle: text('parent_title')
});

export const syncStatus = sqliteTable('sync_status', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  startedAt: integer('started_at', { mode: 'timestamp' }).notNull(),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
  recordsProcessed: integer('records_processed').default(0),
  lastViewedAt: integer('last_viewed_at'),
  status: text('status').notNull(),
  error: text('error')
});

export const cachedStats = sqliteTable('cached_stats', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id'),
  year: integer('year').notNull(),
  statsType: text('stats_type').notNull(),
  statsJson: text('stats_json').notNull(),
  calculatedAt: integer('calculated_at', { mode: 'timestamp' }).defaultNow()
});

export const shareSettings = sqliteTable('share_settings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull(),
  year: integer('year').notNull(),
  mode: text('mode').notNull().default('public'),
  shareToken: text('share_token').unique(),
  canUserControl: integer('can_user_control', { mode: 'boolean' }).default(false)
});

export const customSlides = sqliteTable('custom_slides', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  content: text('content').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).default(true),
  sortOrder: integer('sort_order').notNull(),
  year: integer('year')
});

export const appSettings = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull()
});

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: integer('user_id').notNull(),
  plexToken: text('plex_token').notNull(),
  isAdmin: integer('is_admin', { mode: 'boolean' }).default(false),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull()
});
```

## File Structure

```
obzorarr/
├── src/
│   ├── lib/
│   │   ├── server/           # Server-only code
│   │   │   ├── db/
│   │   │   │   ├── client.ts
│   │   │   │   └── schema.ts
│   │   │   ├── plex/
│   │   │   │   └── client.ts
│   │   │   ├── auth/
│   │   │   │   └── service.ts
│   │   │   ├── sync/
│   │   │   │   ├── service.ts
│   │   │   │   └── scheduler.ts
│   │   │   ├── stats/
│   │   │   │   ├── engine.ts
│   │   │   │   └── calculators/
│   │   │   └── sharing/
│   │   │       └── service.ts
│   │   ├── components/
│   │   │   ├── ui/           # shadcn-svelte
│   │   │   ├── slides/
│   │   │   └── admin/
│   │   └── stores/           # .svelte.ts files for shared state
│   ├── routes/
│   │   ├── +layout.svelte
│   │   ├── +page.svelte
│   │   ├── auth/plex/+server.ts
│   │   ├── admin/
│   │   │   ├── +layout.svelte
│   │   │   ├── +page.svelte
│   │   │   ├── sync/+page.svelte
│   │   │   ├── users/+page.svelte
│   │   │   ├── slides/+page.svelte
│   │   │   └── settings/+page.svelte
│   │   └── wrapped/[year]/
│   │       ├── +page.svelte
│   │       └── u/[identifier]/+page.svelte
│   ├── hooks.server.ts
│   └── app.html
├── drizzle/                  # Migrations
├── static/
├── tests/
│   ├── unit/
│   └── property/
├── bunfig.toml
├── drizzle.config.ts
├── uno.config.ts
├── svelte.config.js
├── vite.config.ts
├── Dockerfile
└── docker-compose.yml
```


## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do.*

### Property 1: Role Assignment Correctness

*For any* authenticated Plex user, the Auth_Service SHALL assign admin privileges if and only if the user is the server owner, and member privileges otherwise.

**Validates: Requirements 1.3, 1.4**

### Property 2: Non-Member Access Denial

*For any* user who is not a member of the configured Plex server, the Auth_Service SHALL deny access.

**Validates: Requirements 1.5**

### Property 3: Session Invalidation

*For any* valid session, after logout is called, the session SHALL no longer be retrievable or valid.

**Validates: Requirements 1.7**

### Property 4: Pagination Completeness

*For any* total record count N and page size P, the Sync_Service SHALL fetch exactly ceil(N/P) pages and retrieve all N records.

**Validates: Requirements 2.2**

### Property 5: History Record Field Completeness

*For any* play history record stored in the database, it SHALL contain all required fields: historyKey, ratingKey, title, type, viewedAt, accountId, librarySectionId.

**Validates: Requirements 2.3**

### Property 6: Sync Timestamp Tracking

*For any* completed sync operation, the stored last sync timestamp SHALL equal the maximum viewedAt value from the synced records.

**Validates: Requirements 2.4**

### Property 7: Incremental Sync Filtering

*For any* subsequent sync after an initial sync, the Sync_Service SHALL only request records where viewedAt > lastSyncTimestamp.

**Validates: Requirements 2.5**

### Property 8: Year Date Range Filtering

*For any* year Y and set of play history records, the Stats_Engine SHALL include only records where viewedAt falls between Jan 1 00:00:00 and Dec 31 23:59:59 of year Y.

**Validates: Requirements 4.1**

### Property 9: Watch Time Aggregation

*For any* set of play history records with durations, the calculated total watch time SHALL equal the sum of all individual durations.

**Validates: Requirements 4.2**

### Property 10: Ranking Correctness

*For any* set of items with play counts, the top N ranking SHALL be ordered by count descending, with ties broken consistently.

**Validates: Requirements 4.3, 4.4, 4.5**

### Property 11: Monthly Distribution Completeness

*For any* set of play history records within a year, the sum of watch time across all 12 monthly buckets SHALL equal the total watch time.

**Validates: Requirements 4.6**

### Property 12: Hourly Distribution Completeness

*For any* set of play history records, the sum of watch time across all 24 hourly buckets SHALL equal the total watch time.

**Validates: Requirements 4.7**

### Property 13: Percentile Calculation

*For any* user U among N users, the percentile rank SHALL equal (number of users with less watch time than U) / N * 100.

**Validates: Requirements 4.8**

### Property 14: Binge Session Detection

*For any* sequence of plays, the longest binge session SHALL be the maximum contiguous sequence where each consecutive pair has viewedAt difference ≤ 30 minutes.

**Validates: Requirements 4.9**

### Property 15: Share Mode Access Control

*For any* wrapped page with share mode M:
- If M = 'public': all requests SHALL be allowed
- If M = 'private-oauth': only authenticated server members SHALL be allowed
- If M = 'private-link': only requests with valid share token SHALL be allowed

**Validates: Requirements 7.1, 7.2, 7.3**

### Property 16: Share Token Uniqueness

*For any* two generated share tokens T1 and T2, T1 SHALL NOT equal T2.

**Validates: Requirements 7.3**

### Property 17: Permission Enforcement

*For any* user U with admin-granted permission level P, the user's effective share settings SHALL NOT exceed P.

**Validates: Requirements 7.6**

### Property 18: Anonymization Mode Display

*For any* anonymization mode M and viewing user V:
- If M = 'real': all usernames SHALL be displayed as-is
- If M = 'anonymous': all usernames SHALL be replaced with generic identifiers
- If M = 'hybrid': only V's username SHALL be displayed, others anonymized

**Validates: Requirements 8.1, 8.2, 8.3**

### Property 19: Slide Order Persistence

*For any* slide ordering operation, after save and reload, the slide order SHALL be identical to the saved order.

**Validates: Requirements 9.4**

### Property 20: Disabled Slide Exclusion

*For any* slide configuration where a slide is disabled, the rendered wrapped page SHALL NOT include that slide.

**Validates: Requirements 9.5**

### Property 21: Statistics Serialization Round-Trip

*For any* valid UserStats or ServerStats object, serializing to JSON then deserializing SHALL produce an object equivalent to the original.

**Validates: Requirements 17.4**

### Property 22: URL Route Parsing

*For any* valid URL path matching `/wrapped/{year}` or `/wrapped/{year}/u/{identifier}`, the router SHALL correctly extract year and identifier parameters.

**Validates: Requirements 12.1, 14.3, 14.4**

### Property 23: Historical Data Preservation

*For any* user removed from the Plex server, their play history records SHALL remain in the database and be included in server-wide statistics.

**Validates: Requirements 13.1, 13.3**

## Error Handling

| Component | Error | Handling |
|-----------|-------|----------|
| Auth | OAuth failure | Display error, allow retry |
| Auth | Invalid token | Redirect to login |
| Auth | Non-member | Show "not a member" error |
| Sync | API unreachable | Retry with exponential backoff (max 5) |
| Sync | Invalid response | Log, skip record, continue |
| Sync | DB write failure | Rollback, mark sync failed |
| Stats | No data | Show "no history" message |
| Sharing | Invalid token | Return 404 |
| Sharing | Unauthorized | Return 403 |

## Testing Strategy

### Property-Based Testing

- **Library**: fast-check
- **Minimum iterations**: 100 per property
- **Tag format**: `Feature: obzorarr, Property {N}: {title}`

### Test Organization

```
tests/
├── unit/
│   ├── stats/
│   │   ├── watch-time.test.ts
│   │   ├── ranking.test.ts
│   │   └── binge-detector.test.ts
│   └── sharing/
│       └── access-control.test.ts
└── property/
    ├── stats.property.test.ts
    ├── sharing.property.test.ts
    └── serialization.property.test.ts
```

### Example Property Test

```typescript
// tests/property/stats.property.test.ts
import { fc } from 'fast-check';
import { calculateTotalWatchTime } from '$lib/server/stats/calculators';

// Feature: obzorarr, Property 9: Watch Time Aggregation
describe('Property 9: Watch Time Aggregation', () => {
  it('total equals sum of durations', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ duration: fc.nat({ max: 10000 }) })),
        (records) => {
          const expected = records.reduce((sum, r) => sum + r.duration, 0);
          return calculateTotalWatchTime(records) === expected;
        }
      ),
      { numRuns: 100 }
    );
  });
});
```

### bunfig.toml Configuration

```toml
[test]
root = "./tests"
preload = ["./tests/setup.ts"]
coverage = true
coverageThreshold = { line = 0.8, function = 0.8 }
```
