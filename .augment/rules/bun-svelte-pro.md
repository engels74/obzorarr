---
type: "agent_requested"
description: "Modern Bun + Svelte 5 + SvelteKit best practices for 2025"
---

# Modern Bun + Svelte 5 + SvelteKit best practices for 2025

**Svelte 5's runes system fundamentally changes how reactivity works**, replacing stores with `$state`, reactive statements with `$derived`, and enabling fine-grained updates that significantly improve performance. Combined with Bun's native SQLite driver, SvelteKit 2's enhanced type safety, and modern animation libraries, this stack delivers exceptional developer experience with production-grade performance. The patterns below represent verified best practices from official documentation, core maintainer guidance, and authoritative community sources.

---

## Code design and TypeScript patterns

### Svelte 5 Runes: The new reactivity primitives

**Use `$state` for reactive primitives and objects, `$state.raw` for large immutable data structures.** The `$state` rune creates deeply reactive Proxy objects that trigger updates when properties change. For data replaced wholesale (API responses, large arrays), `$state.raw` avoids proxy overhead by only reacting to reassignment, not mutation. Use `$state.snapshot()` to get a plain object for APIs like `structuredClone()`.

```svelte
<script lang="ts">
  // Deep reactivity - mutations trigger updates
  let editor = $state({ theme: 'dark', content: '' });
  editor.content = 'updated'; // ✓ triggers UI update
  
  // Shallow reactivity - better for large immutable data
  let items = $state.raw<Item[]>([]);
  items = [...items, newItem]; // ✓ must reassign, not mutate
  
  // Get plain object from proxy
  const snapshot = $state.snapshot(editor);
</script>
```

*When to deviate*: Use `$state.raw` when working with immutable data patterns, external libraries that don't work with Proxies, or datasets exceeding hundreds of items.

**Source**: "$state • Svelte Docs", svelte.dev, 2024-10

---

**Use `$derived(expression)` for simple computations; use `$derived.by(() => {})` when you need loops, conditionals, or multiple statements.** Derived values are memoized and recalculate only when dependencies change. Unlike the legacy `$:` syntax, `$derived` tracks dependencies at runtime. Never set `$state` inside `$derived`—this causes infinite loops and compilation errors.

```svelte
<script lang="ts">
  let width = $state(100);
  let numbers = $state([1, 2, 3]);
  
  // Simple expression
  const area = $derived(width * width);
  
  // Complex logic requires $derived.by
  const total = $derived.by(() => {
    let sum = 0;
    for (const n of numbers) sum += n;
    return sum;
  });
</script>
```

**Source**: "$derived • Svelte Docs", svelte.dev, 2024-10

---

**Use `$effect` sparingly as an "escape hatch" for side effects—DOM manipulation, analytics, third-party libraries—never for state synchronization.** Effects run after DOM updates and track dependencies automatically. **90% of cases where you think you need `$effect`, you actually want `$derived`**. Always return a cleanup function for resource disposal to prevent memory leaks.

```svelte
<script lang="ts">
  let canvas: HTMLCanvasElement;
  let size = $state(50);

  $effect(() => {
    const ctx = canvas.getContext('2d');
    ctx.fillRect(0, 0, size, size);
    
    // Cleanup runs before re-run AND on unmount
    return () => ctx.clearRect(0, 0, canvas.width, canvas.height);
  });
  
  // ❌ WRONG: Don't synchronize state with effects
  // $effect(() => { doubled = count * 2; });
  
  // ✓ CORRECT: Use $derived instead
  const doubled = $derived(count * 2);
</script>
```

*Variants*: `$effect.pre()` runs before DOM updates; `$effect.tracking()` checks if inside reactive context; `$effect.root()` provides manual cleanup control.

**Source**: "$effect • Svelte Docs", svelte.dev, 2024-10; "Understanding Svelte 5 Runes", HTML All The Things, 2024

---

### Component composition: Props and snippets

**Destructure props with `$props()`, define an interface for TypeScript safety, use default values in destructuring, and spread rest props.** The `$props()` rune replaces `export let` declarations. TypeScript requires an explicit interface since types cannot be inferred from destructuring assignment.

```svelte
<script lang="ts">
  interface Props {
    title: string;
    count?: number;
    children?: import('svelte').Snippet;
  }

  let { 
    title, 
    count = 0, 
    class: klass = '', // rename reserved keywords
    ...rest 
  }: Props = $props();

  // For bindable two-way binding props
  let { value = $bindable() } = $props();
</script>

<div class={klass} {...rest}>{title}: {count}</div>
```

**Source**: "$props • Svelte Docs", svelte.dev, 2024-10

---

**Use `{#snippet}` and `{@render}` for component composition—slots are deprecated in Svelte 5.** Snippets are reusable markup blocks that accept parameters, can be passed as props, and render multiple times. They solve slots' limitations: more readable, flexible positioning, explicit data passing.

```svelte
<!-- Parent.svelte -->
<Card>
  <!-- Default children snippet -->
  <h1>Title</h1>
  
  <!-- Named snippet with parameters -->
  {#snippet footer(date: string)}
    <footer>{date}</footer>
  {/snippet}
</Card>

<!-- Card.svelte -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  
  interface Props {
    children: Snippet;
    footer?: Snippet<[string]>;
  }
  
  let { children, footer }: Props = $props();
</script>

<article>
  {@render children()}
  {#if footer}
    {@render footer(new Date().toISOString())}
  {/if}
</article>
```

**Source**: "{#snippet ...} • Svelte Docs", svelte.dev, 2024-10; "Snippets in Svelte 5", Frontend Masters, 2024-10

---

### SvelteKit API design (+server.ts patterns)

**Export HTTP verb functions (GET, POST, PUT, DELETE) from `+server.ts` files; use the `json()` helper for responses.** SvelteKit's server routes provide full control over responses using web-standard Request/Response objects. Place API routes in `/routes/api/` for clarity.

```typescript
// routes/api/posts/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
  const limit = Number(url.searchParams.get('limit') ?? 10);
  const posts = await db.getPosts(limit);
  return json(posts);
};

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) error(401, 'Unauthorized');
  
  const data = await request.json();
  const post = await db.createPost(data);
  return json(post, { status: 201 });
};
```

*When to deviate*: Prefer form actions over API routes when handling form submissions—they provide better progressive enhancement and type safety.

**Source**: "SvelteKit API Endpoints", Joy of Code, 2024

---

### Error handling and separation of concerns

**Implement `handleError` in hooks.server.ts for error logging; return sanitized error messages to users.** The hook catches unexpected errors for logging services while protecting sensitive information. Use Zod's `safeParse()` in form actions to prevent exceptions and enable graceful error handling.

```typescript
// src/hooks.server.ts
export const handleError: HandleServerError = async ({ error, event }) => {
  console.error('Unexpected error:', error);
  // Send to error tracking (Sentry, etc.)
  await reportError(error, event.url.pathname);
  
  // Return sanitized message to user
  return { message: 'An unexpected error occurred' };
};
```

**Source**: "SvelteKit Hooks", svelte.dev/docs/kit/hooks, 2024

---

## Reactivity and state management

### Migration from stores to Runes

**Replace Svelte 4 writable stores with `$state` in `.svelte.ts` files for shared reactive state; migrate bottom-up (child components first).** Runes unify reactivity inside and outside components. Files with the `.svelte.ts` extension can use runes and export reactive state that works everywhere.

```typescript
// OLD: store.ts (Svelte 4)
import { writable } from 'svelte/store';
export const count = writable(0);

// NEW: store.svelte.ts (Svelte 5)
class CounterStore {
  count = $state(0);
  doubled = $derived(this.count * 2);
  
  increment() { this.count++; }
}
export const counterStore = new CounterStore();
```

**Key migration rules**:
- `let x = 0` → `let x = $state(0)`
- `$: doubled = x * 2` → `const doubled = $derived(x * 2)`
- `$: { sideEffect() }` → `$effect(() => { sideEffect() })`
- `export let prop` → `let { prop } = $props()`
- Rename `.ts` to `.svelte.ts` when using runes

**Source**: "Svelte 5 migration guide", svelte.dev, 2024-10; "Converting global Svelte stores to runes", Inorganik, 2025-01

---

### Context API with Runes

**Store reactive `$state` objects in context (not primitives) for proper mutation propagation; use context for SSR-safe global state.** Context is bound during component initialization and scoped per-request in SSR, preventing data leakage between users. Pass objects so mutations propagate correctly.

```typescript
// context.ts - Type-safe context pattern
import { createContext } from 'svelte';

interface User { name: string; }
export const [getUser, setUser] = createContext<User>();

// Parent.svelte
<script lang="ts">
  import { setUser } from './context';
  let user = $state({ name: 'Alice' });
  setUser(user);
</script>

// Child.svelte
<script lang="ts">
  import { getUser } from './context';
  const user = getUser();
</script>
<p>{user.name}</p> <!-- reactive! -->
```

*Critical*: For SSR/SvelteKit apps, **always use context instead of module-level state** to avoid data leakage between requests.

**Source**: "Context • Svelte Docs", svelte.dev, 2024-10; "Runes and Global state", Mainmatter, 2025-03

---

### Avoiding reactivity pitfalls

| Anti-pattern | Why it's bad | Correct approach |
|-------------|--------------|------------------|
| `$effect(() => { stateVar = derived })` | Infinite loops | Use `$derived()` |
| Setting `$state` inside `$derived` | Compilation error | Keep `$derived` pure |
| Module-level `$state` in SvelteKit | SSR data leakage | Use context API |
| Mutating `$state.raw` objects | Changes won't trigger updates | Reassign entire object |
| Reading state after `await` in `$effect` | Loses reactivity tracking | Capture before await |

```svelte
<script>
  // ❌ BAD: State read after await loses tracking
  $effect(async () => {
    await somePromise;
    console.log(count); // Not tracked!
  });
  
  // ✓ GOOD: Capture before await
  $effect(() => {
    const currentCount = count; // Tracked
    doAsyncWork(currentCount);
  });
</script>
```

**Source**: "Runtime warnings • Svelte Docs", svelte.dev, 2024-10

---

## Data loading and mutations

### Load functions: +page.ts vs +page.server.ts

**Use `+page.server.ts` for database access, secrets, and sensitive operations; use `+page.ts` for external APIs and non-serializable data.** Server load functions run only on the server, providing security. Universal load functions run on both server (SSR) and client (navigation), reducing round-trips.

```typescript
// +page.server.ts - Server-only (database, secrets)
import type { PageServerLoad } from './$types';
import db from '$lib/server/database';

export const load: PageServerLoad = async ({ params }) => {
  return { post: await db.getPost(params.slug) };
};

// +page.ts - Universal (external APIs, component constructors)
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, data }) => {
  const comments = await fetch('/api/comments');
  return { ...data, comments: await comments.json() };
};
```

*When to deviate*: Use server load exclusively when you need `cookies`, `locals`, or `request` access. Use universal load for returning component constructors or non-serializable values.

**Source**: "SvelteKit Loading data", kit.svelte.dev/docs/load, 2024

---

### Form actions and progressive enhancement

**Use named actions (`?/login`, `?/register`) when a page has multiple forms; always return `fail()` for validation errors to preserve form state.** Form actions work without JavaScript as a baseline. Using `fail()` returns a 4xx status while preserving user input.

```typescript
// +page.server.ts
import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from './$types';

export const actions: Actions = {
  login: async ({ request, cookies }) => {
    const data = await request.formData();
    const email = data.get('email');
    
    if (!email) return fail(400, { email, missing: true });
    
    cookies.set('session', 'token', { path: '/' });
    redirect(303, '/dashboard');
  }
};
```

**Always add `use:enhance` to forms for seamless JavaScript-enhanced submissions** while maintaining the no-JS baseline. It prevents full page reloads, updates `form` and `$page.status` automatically, and handles redirects.

```svelte
<script lang="ts">
  import { enhance } from '$app/forms';
  let { form } = $props();
</script>

<form method="POST" action="?/login" use:enhance>
  {#if form?.missing}<p class="error">Email required</p>{/if}
  <input name="email" value={form?.email ?? ''}>
  <button>Login</button>
</form>
```

**Source**: "Form Actions", svelte.dev/docs/kit/form-actions, 2024

---

### Streaming with nested promises

**Return nested promises (not top-level) from server load to stream non-essential data; use `{#await}` blocks for loading states.** Top-level promises are awaited; only nested promises stream. This improves perceived performance.

```typescript
// +page.server.ts
export const load: PageServerLoad = async ({ params }) => {
  return {
    post: await loadPost(params.slug),      // Essential - blocks render
    comments: loadComments(params.slug)      // Non-essential - streams (no await!)
  };
};
```

```svelte
{#await data.comments}
  <p>Loading comments...</p>
{:then comments}
  {#each comments as comment}<Comment {comment} />{/each}
{:catch error}
  <p>Failed: {error.message}</p>
{/await}
```

*When to deviate*: Avoid streaming for essential SEO content. Streaming requires JavaScript.

**Source**: "Streaming, snapshots, and other new features", svelte.dev/blog, 2023

---

### Invalidation patterns

**Use `invalidate(url)` for targeted reloading; use `invalidateAll()` sparingly; define custom dependencies with `depends()`.** SvelteKit tracks dependencies automatically via `fetch()` calls. Custom dependencies enable fine-grained control.

```typescript
// +page.ts
export const load: PageLoad = async ({ fetch, depends }) => {
  depends('app:user-posts'); // Custom dependency
  const posts = await fetch('/api/posts');
  return { posts: await posts.json() };
};
```

```svelte
<script>
  import { invalidate, invalidateAll } from '$app/navigation';
  
  async function refresh() {
    await invalidate('app:user-posts'); // Targeted
    // await invalidateAll(); // Nuclear option - reruns ALL loads
  }
</script>
```

**Source**: "Invalidation", svelte.dev/tutorial/kit/invalidation, 2024

---

### Superforms integration

**Use Superforms with Zod adapters for comprehensive server and client-side form validation.** Define schemas outside load functions for caching. Superforms provides auto-focusing on errors, tainted field detection, and seamless ActionResult handling.

```typescript
// schema.ts
import { z } from 'zod';
export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

// +page.server.ts
import { superValidate, fail } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';

export const load: PageServerLoad = async () => {
  const form = await superValidate(zod(loginSchema));
  return { form };
};

export const actions: Actions = {
  default: async ({ request }) => {
    const form = await superValidate(request, zod(loginSchema));
    if (!form.valid) return fail(400, { form });
    return { form };
  }
};
```

**Source**: "Superforms Documentation", superforms.rocks, 2024

---

## Animations

### Motion One vs GSAP: Decision criteria

| Factor | Motion One | GSAP |
|--------|-----------|------|
| **Bundle size** | 2.6-18kb | 23kb + plugins |
| **GPU acceleration** | ✓ Native WAAPI | ✗ JavaScript-based |
| **Spring physics** | ✓ Built-in | ✗ Not supported |
| **Mutable timelines** | ✗ | ✓ Add/remove during playback |
| **SVG morphing** | Requires Flubber | ✓ MorphSVG plugin |
| **ScrollTrigger** | 0.5kb | 12kb |

**Choose Motion for performance-critical, smaller bundles with hardware acceleration; choose GSAP for complex timelines, mutable sequences, and advanced plugins.**

**Source**: "GSAP vs Motion: A detailed comparison", motion.dev, 2025-01

---

### Motion One with Svelte 5

**Use Motion's `animate()` function with `$effect` for hardware-accelerated animations; return a cleanup function to stop animations on unmount.**

```svelte
<script>
  import { animate, spring, stagger } from 'motion';
  
  let box: HTMLElement;
  
  $effect(() => {
    if (!box) return;
    const animation = animate(box, { 
      transform: 'rotate(360deg)',
      opacity: [0, 1]
    }, { duration: 2, easing: spring() });
    
    return () => animation.stop();
  });
</script>

<div bind:this={box}></div>
```

**Source**: "Motion Documentation", motion.dev, 2024-12

---

### GSAP ScrollTrigger with Svelte 5

**Register ScrollTrigger once at module scope, create instances inside `$effect`, and use `gsap.context()` for easy batch cleanup.** Always kill both the tween AND its ScrollTrigger in cleanup to prevent memory leaks.

```svelte
<script>
  import { gsap } from 'gsap';
  import { ScrollTrigger } from 'gsap/ScrollTrigger';
  
  gsap.registerPlugin(ScrollTrigger);
  
  let section: HTMLElement;
  
  $effect(() => {
    if (!section) return;
    
    const ctx = gsap.context(() => {
      gsap.from('.animate-in', {
        y: 50,
        opacity: 0,
        stagger: 0.2,
        scrollTrigger: {
          trigger: section,
          start: 'top 70%',
          toggleActions: 'play none none reverse'
        }
      });
    }, section);
    
    return () => ctx.revert(); // Kills all animations + ScrollTriggers
  });
</script>
```

**Source**: "GSAP & ScrollTrigger Playground", svelte.dev Playground, 2024-11

---

### Performance: GPU acceleration

**Animate only `transform`, `opacity`, `filter`, and `clipPath` for GPU acceleration; apply `will-change` sparingly and remove after animations complete.** These properties can be composited on the GPU without triggering layout/paint.

```svelte
<script>
  let isAnimating = $state(false);
</script>

<div 
  style:will-change={isAnimating ? 'transform, opacity' : 'auto'}
  class="transform-gpu"
>
  Animated content
</div>
```

**Performance tier list**: S-Tier = Hardware-accelerated WAAPI (Motion); A-Tier = JS animations with composited properties; C-Tier = Paint-triggering (color, background); D-Tier = Layout-triggering (width, height, top).

**Source**: "The Web Animation Performance Tier List", motion.dev, 2025-01

---

### Accessibility: prefers-reduced-motion

**Use Svelte 5's built-in `prefersReducedMotion` from `svelte/motion` to disable or reduce animations for users with vestibular disorders.**

```svelte
<script>
  import { prefersReducedMotion } from 'svelte/motion';
  import { fly } from 'svelte/transition';
</script>

{#if visible}
  <p transition:fly={{ y: prefersReducedMotion.current ? 0 : 200 }}>
    Animated content
  </p>
{/if}
```

**Source**: "svelte/motion Documentation", svelte.dev, 2024-12

---

## Performance optimization

### Bun runtime and bun:sqlite setup

**Use `new Database()` with `{ strict: true }` for type-safe parameter binding; enable WAL mode immediately after opening for concurrent read performance.**

```typescript
import { Database } from 'bun:sqlite';

const db = new Database('app.db', { strict: true, create: true });

// Enable WAL mode (persistent - set once)
db.run('PRAGMA journal_mode = WAL;');
db.run('PRAGMA synchronous = NORMAL;');  // Safe with WAL
db.run('PRAGMA cache_size = 10000;');
db.run('PRAGMA busy_timeout = 5000;');
```

**WAL (Write-Ahead Logging)** allows concurrent readers while writing, improving throughput **4-10x** in read-heavy workloads.

**Source**: "Bun SQLite", bun.sh/docs, 2024-12

---

### Prepared statements and SQL injection prevention

**Use `db.query()` for cached/reusable statements; always use parameterized queries to prevent SQL injection.** `db.query()` caches compiled SQL bytecode, avoiding recompilation overhead on repeated queries.

```typescript
// CACHED: Same Statement instance for same SQL
const getUserQuery = db.query<User, [number]>(
  'SELECT * FROM users WHERE id = ?'
);
const user = getUserQuery.get(1);

// Named parameters with strict mode
const insertStmt = db.query(
  'INSERT INTO users (name, email) VALUES ($name, $email)'
);
insertStmt.run({ name: 'Alice', email: 'alice@example.com' });

// ❌ NEVER: SQL injection risk!
// db.run(`SELECT * FROM users WHERE id = ${userId}`);
```

**Source**: "Bun SQLite", bun.sh/docs, 2024-12

---

### bunfig.toml configuration

**Place `bunfig.toml` in project root; use `preload` for plugins, `[test]` for test runner, `[install]` for package manager options.**

```toml
# bunfig.toml
preload = ["./setup.ts"]

[test]
root = "./__tests__"
preload = ["./test-setup.ts"]
coverage = true
coverageThreshold = { line = 0.8, function = 0.8 }

[install]
frozenLockfile = true

[loader]
".sql" = "text"
".graphql" = "text"
```

**Source**: "bunfig.toml", bun.sh/docs/runtime/bunfig, 2024-12

---

### UnoCSS + unocss-preset-shadcn integration

**Use `unocss-preset-shadcn` with `presetAnimations` to replace Tailwind while maintaining full shadcn component compatibility.**

```typescript
// uno.config.ts
import { defineConfig } from 'unocss';
import { presetWind } from '@unocss/preset-wind3';
import presetAnimations from 'unocss-preset-animations';
import { presetShadcn } from 'unocss-preset-shadcn';

export default defineConfig({
  presets: [
    presetWind(),
    presetAnimations(),
    presetShadcn({ color: 'slate' })
  ],
  shortcuts: {
    'btn': 'py-2 px-4 font-semibold rounded-lg shadow-md cursor-pointer',
    'btn-primary': 'btn bg-blue-500 text-white hover:bg-blue-700'
  }
});
```

**Source**: "unocss-preset-shadcn", GitHub, 2024-12

---

### SSR/SSG strategies

**Return non-essential promises without await in load functions to enable streaming; use `+layout.ts` for shared data to avoid duplicate fetches.** Configure adapter-static for SSG when appropriate.

---

## Tooling and QA

### Testing setup comparison

| Tool | Use case | Configuration |
|------|----------|---------------|
| **Bun test** | Fast unit tests | `bunfig.toml` + svelte-loader plugin |
| **Vitest Browser Mode** | Real browser component tests | `vitest-browser-svelte` + Playwright |
| **Playwright** | E2E tests | `webServer` config for build+preview |

**Use `vitest-browser-svelte` with Playwright for real browser testing—superior to jsdom for Svelte 5 runes.**

```typescript
// vite.config.ts
export default defineConfig({
  test: {
    browser: {
      enabled: true,
      provider: 'playwright',
      instances: [{ browser: 'chromium' }]
    }
  }
});
```

**Source**: "From JSDOM to Real Browsers", sveltest.dev, 2024-12

---

### Biome for Svelte

**Enable experimental Svelte support in Biome v2.3+; disable false-positive rules for `.svelte` files.**

```json
{
  "overrides": [{
    "includes": ["**/*.svelte"],
    "linter": {
      "rules": {
        "style": { "useConst": "off", "useImportType": "off" },
        "correctness": { "noUnusedVariables": "off" }
      }
    }
  }]
}
```

**Source**: "Biome Language Support", biomejs.dev, 2024-12

---

### svelte-check and TypeScript strict mode

**Run `svelte-check` alongside `tsc` in CI to catch type errors in both `.svelte` templates and TypeScript files.**

```json
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "strictNullChecks": true
  }
}
```

**The `noUncheckedIndexedAccess` option adds `undefined` to array/object index access types**, catching null pointer errors at compile time.

**Source**: "Svelte ❤ TypeScript", svelte.dev/blog, 2020-07 (updated)

---

## Type safety

### Generated types ($types)

**Import types from `./$types` for full type safety; use `PageProps` (SvelteKit 2.16+) for component props.**

```svelte
<script lang="ts">
  import type { PageProps } from './$types';
  let { data, form }: PageProps = $props();
</script>
```

**Source**: "SvelteKit Types", svelte.dev/docs/kit/types, 2024

---

### Zod/Valibot runtime validation

**Use `safeParse()` for validation to prevent exceptions; integrate with Superforms for comprehensive form handling.**

```typescript
const result = schema.safeParse(data);
if (!result.success) {
  return fail(400, { errors: result.error.flatten().fieldErrors });
}
```

---

### TypeScript satisfies operator

**Use `satisfies` to validate object shapes while preserving inferred literal types.**

```typescript
const routes = {
  home: { path: '/', exact: true },
  users: { path: '/users' }
} satisfies Record<string, Route>;

routes.home.path; // '/' (literal preserved, not widened to string)
```

**Source**: "TypeScript 4.9 Release Notes", typescriptlang.org, 2022-11

---

## Security

### CSRF protection

**Keep SvelteKit's default `checkOrigin: true`; use `trustedOrigins` for specific allowed cross-origin sources.**

```typescript
// svelte.config.js
kit: {
  csrf: {
    checkOrigin: true,
    trustedOrigins: ['https://payment-gateway.com']
  }
}
```

**Source**: "SvelteKit Configuration", svelte.dev/docs/kit/configuration, 2024-12

---

### Authentication hooks

**Use the `handle` hook to validate sessions and populate `event.locals` with auth state.**

```typescript
// hooks.server.ts
const authHandle: Handle = async ({ event, resolve }) => {
  const sessionId = event.cookies.get('session');
  if (sessionId) {
    event.locals.user = await validateSession(sessionId);
  }
  
  if (event.url.pathname.startsWith('/admin') && !event.locals.user) {
    throw redirect(303, '/login');
  }
  
  return resolve(event);
};
```

**Source**: "SvelteKit Auth Docs", svelte.dev/docs/kit/auth, 2024-12

---

### Environment variable handling

**Use `$env/static/private` for server-only secrets; prefix client-accessible values with `PUBLIC_`.**

```typescript
// Server-only - build error if imported client-side
import { DATABASE_URL } from '$env/static/private';

// Client-accessible
import { PUBLIC_APP_NAME } from '$env/static/public';
```

**Source**: "$env/static/private Docs", svelte.dev/docs/kit, 2024-12

---

### Plex API authentication

**Store `X-Plex-Token` as a server-side environment variable; never expose to clients.**

```typescript
// $lib/server/plex.server.ts
import { PLEX_TOKEN, PLEX_SERVER_URL } from '$env/static/private';

export async function plexRequest(endpoint: string) {
  return fetch(new URL(endpoint, PLEX_SERVER_URL), {
    headers: {
      'Accept': 'application/json',
      'X-Plex-Token': PLEX_TOKEN,
      'X-Plex-Client-Identifier': 'your-app-id',
      'X-Plex-Product': 'Your App',
      'X-Plex-Version': '1.0.0'
    }
  });
}
```

**Key Plex endpoints**: `/library/sections` (libraries), `/library/sections/{id}/all` (items), `/status/sessions` (active streams), `/library/recentlyAdded`, `/library/onDeck`.

**Source**: "Finding an authentication token / X-Plex-Token", Plex Support, 2024

---

## UI patterns

### shadcn-svelte philosophy

**Components are copied into your project for full ownership—not installed as dependencies.** This solves the common problem of needing to wrap components or override styles. Updates come through the headless foundation (bits-ui).

```bash
npx shadcn-svelte@latest init
npx shadcn-svelte@latest add button dialog
```

**Source**: "Introduction - shadcn-svelte", shadcn-svelte.com, 2024-12

---

### tweakcn theming

**Use tweakcn's visual editor to generate custom CSS variable themes; export Tailwind-compatible configuration with OKLCH color values.**

```css
:root {
  --background: oklch(0.9491 0.0085 197.0126);
  --foreground: oklch(0.3772 0.0619 212.6640);
  --primary: oklch(0.5624 0.0947 203.2755);
}
.dark {
  --background: oklch(0.2500 0.0200 212.0000);
}
```

**Source**: "tweakcn — Theme Generator", tweakcn.com, 2024-12

---

### Lucide icon optimization

**Import from `@lucide/svelte/icons/{icon-name}` for optimal tree-shaking.** Barrel imports include all icons in the bundle.

```svelte
<!-- ✓ Correct: Direct path import -->
<script>
  import CircleAlert from '@lucide/svelte/icons/circle-alert';
</script>

<!-- ❌ Avoid: Barrel import -->
<script>
  import * as icons from '@lucide/svelte';
</script>
```

**Source**: "Lucide Svelte", lucide.dev, 2024-12

---

### Dark mode with mode-watcher

**Use `mode-watcher` in root layout for system preference detection, persistence, and `.dark` class management.**

```svelte
<!-- +layout.svelte -->
<script>
  import { ModeWatcher } from 'mode-watcher';
</script>

<ModeWatcher />
{@render children?.()}
```

```svelte
<script>
  import { toggleMode, setMode } from 'mode-watcher';
</script>
<button onclick={() => toggleMode()}>Toggle theme</button>
```

**Source**: "Dark Mode - shadcn-svelte", shadcn-svelte.com, 2024-12

---

## Backend patterns

### Croner scheduling

**Use Croner for timezone-aware cron scheduling with built-in overrun protection and error handling.**

```typescript
import { Cron } from 'croner';

const job = new Cron('0 */15 * * * *', {
  name: 'data-sync',
  timezone: 'UTC',
  protect: true,  // Overrun protection
  catch: (err, job) => console.error(`Job ${job.name} failed:`, err)
}, async () => {
  await syncData();
});

// Pattern features: L = last day, # = nth weekday
const lastFriday = new Cron('0 0 * * 5#L', () => {});
```

**Source**: "Croner Documentation", croner.56k.guru, 2024

---

### Database migrations with Drizzle

**Use Drizzle ORM with `drizzle-kit` for production migrations; it integrates seamlessly with bun:sqlite.**

```typescript
// drizzle.config.ts
import { defineConfig } from 'drizzle-kit';
export default defineConfig({
  out: './drizzle',
  schema: './src/db/schema.ts',
  dialect: 'sqlite',
  dbCredentials: { url: process.env.DB_FILE! }
});

// migrate.ts
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { Database } from 'bun:sqlite';

const sqlite = new Database('app.db');
const db = drizzle(sqlite);
migrate(db, { migrationsFolder: './drizzle' });
```

**Source**: "Drizzle ORM + Bun SQLite", orm.drizzle.team, 2024

---

### OpenAPI TypeScript client generation

**Use `@hey-api/openapi-ts` to generate typed clients from OpenAPI specs like Plex's.**

```typescript
// openapi-ts.config.ts
import { defineConfig } from '@hey-api/openapi-ts';

export default defineConfig({
  input: './openapi/plex-api.json',
  output: { path: 'src/lib/generated/plex-client' },
  plugins: ['@hey-api/types', '@hey-api/sdk']
});
```

**Source**: "@hey-api/openapi-ts", GitHub, 2024

---

## Conclusion

The Svelte 5 + SvelteKit 2 + Bun stack represents a significant evolution in full-stack JavaScript development. **The runes system eliminates the cognitive overhead of stores** while providing fine-grained reactivity that outperforms React's virtual DOM. Bun's native SQLite driver delivers **3-6x better performance** than Node alternatives, and the combination with Motion One's hardware-accelerated animations creates a foundation for high-performance web applications.

Key architectural decisions that differ from Svelte 4: prefer `$derived` over `$effect` for computed values, use `.svelte.ts` files for shared reactive state, adopt snippets instead of slots for component composition, and leverage SvelteKit's generated `$types` for end-to-end type safety. For animation-heavy applications, Motion One provides the best performance for most use cases, with GSAP reserved for complex timelines requiring mutable sequences.

The integration of shadcn-svelte with UnoCSS via `unocss-preset-shadcn` offers Tailwind-like ergonomics with superior build-time performance, while tweakcn enables visual theme customization without breaking the component system. Combined with Superforms for type-safe form handling and Croner for background scheduling, this stack provides production-ready patterns for modern web applications.