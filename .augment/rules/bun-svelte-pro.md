---
type: "agent_requested"
description: "Modern Bun + Svelte 5 + SvelteKit best practices for 2025"
---

# Bun + Svelte 5 + SvelteKit: 2025 Full-Stack Best Practices

Modern full-stack development with this stack requires understanding Svelte 5's runes-based reactivity, SvelteKit's data loading patterns, Bun's native SQLite driver, and proper integration of animation, styling, and testing tools. This guide synthesizes **authoritative, cross-verified recommendations** from official documentation, core maintainer content, and trusted community sources—excluding all Svelte 4 patterns and deprecated APIs.

---

## 1. Code Design

### TypeScript strict patterns

- **Enable strict mode with Svelte-specific settings.** Use `verbatimModuleSyntax: true` and `isolatedModules: true`—Svelte/Vite cannot determine value vs type imports, and cross-file analysis isn't supported. Extend `@tsconfig/svelte` as your base configuration.
```json
{
  "compilerOptions": {
    "strict": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "moduleResolution": "bundler"
  }
}
```
*Source: @tsconfig/svelte npm package (2024-12); svelte.dev/docs/svelte/typescript*

### Svelte 5 Runes ($state, $derived, $effect, $props)

- **Use `$state()` for any value requiring reactivity.** Objects and arrays become deeply reactive Proxies automatically. Class instances are NOT proxied—use `$state` in class fields instead.
```svelte
<script>
  let count = $state(0);
  let todos = $state([{ done: false, text: 'Learn runes' }]);
</script>
```
*Source: svelte.dev/docs/svelte/$state (2024-12)*

- **Use `$derived()` for computed values—not `$effect`.** Derived values automatically update when dependencies change. Expression must be side-effect-free. As of Svelte 5.25, derived values can be directly overridden for optimistic UI patterns.
```svelte
<script>
  let count = $state(0);
  let doubled = $derived(count * 2);
</script>
```
*Source: svelte.dev/docs/svelte/$derived (2024-12)*

- **Use `$derived.by()` for complex multi-step derivations** requiring loops, conditionals, or multiple statements.
```svelte
<script>
  let cart = $state([{ item: '🍎', total: 10 }, { item: '🍌', total: 10 }]);
  let total = $derived.by(() => {
    let sum = 0;
    for (const item of cart) sum += item.total;
    return sum;
  });
</script>
```
*Source: joyofcode.xyz/learn-svelte (2024)*

- **Use `$effect()` ONLY as an escape hatch for side effects**: localStorage persistence, API calls on dependency change, third-party library integration, DOM manipulation. Never update state inside effects—use `$derived` instead.
```svelte
<script>
  let count = $state(0);
  $effect(() => {
    localStorage.setItem('count', count.toString());
    return () => console.log('cleanup');
  });
</script>
```
*Source: svelte.dev/docs/svelte/$effect "When not to use $effect" section (2024-12)*

- **Declare props via `$props()` destructuring.** Use rest props for wrapper components. Supports renaming reserved words and default values.
```svelte
<script>
  let { name = 'World', class: className, ...rest } = $props();
</script>
```
*Source: svelte.dev/docs/svelte/v5-migration-guide (2024-12)*

### Snippets vs slots in Svelte 5

- **Replace slots with snippets for all new code.** Snippets offer explicit scope, data passing, and better TypeScript support. Slots remain only for Web Components.
```svelte
<!-- Parent.svelte -->
<List {items}>
  {#snippet item(data)}
    <li>{data.name}</li>
  {/snippet}
  {#snippet empty()}
    <p>No items</p>
  {/snippet}
</List>

<!-- List.svelte -->
<script>
  let { items, item, empty } = $props();
</script>
{#each items as entry}
  {@render item(entry)}
{:else}
  {@render empty?.()}
{/each}
```
*Source: svelte.dev/docs/svelte/snippet; frontendmasters.com/blog/snippets-in-svelte-5 (2024)*

- **Type snippets explicitly** using Svelte's `Snippet` type for props that accept render functions.
```typescript
import type { Snippet } from 'svelte';
interface Props {
  header: Snippet;
  row: Snippet<[{ name: string; value: number }]>;
}
```
*Source: svelte.dev/docs/svelte/snippet (2024-12)*

### SvelteKit API design (+server.ts patterns)

- **Use form actions for mutations, not +server.ts POST endpoints.** Form actions provide progressive enhancement, automatic CSRF protection, and integrate with SvelteKit's data flow. Reserve +server.ts for REST APIs and external integrations.
```typescript
// +page.server.ts
export const actions = {
  create: async ({ request }) => {
    const data = await request.formData();
    // validate and process
    return { success: true };
  }
} satisfies Actions;
```
*Source: svelte.dev/docs/kit/form-actions (2024-12)*

- **Import `RequestHandler` from `./$types` for type-safe API endpoints.**
```typescript
// routes/api/posts/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
  const posts = await db.query('SELECT * FROM posts').all();
  return json(posts);
};
```
*Source: svelte.dev/docs/kit/routing (2024-12)*

### Bun SQLite schema design

- **Use INTEGER PRIMARY KEY AUTOINCREMENT for most tables.** For distributed systems, consider UUID with `randomblob(16)`.
```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```
*Source: bun.sh/docs/runtime/sqlite (2024)*

- **Create indexes on frequently queried columns.** Use composite indexes for multi-column WHERE clauses and partial indexes for filtered queries.
```typescript
db.run("CREATE INDEX idx_orders_user_date ON orders(user_id, created_at)");
db.run("CREATE INDEX idx_active_users ON users(email) WHERE active = 1");
```
*Source: SQLite documentation; bun.sh/docs/runtime/sqlite*

### Error handling patterns

- **Use SvelteKit's `error()` helper for expected errors.** Returns proper HTTP status and renders +error.svelte. Never expose stack traces to users.
```typescript
import { error } from '@sveltejs/kit';

export function load({ locals }) {
  if (!locals.user) error(401, 'Not logged in');
  if (!locals.user.isAdmin) error(403, 'Not authorized');
}
```
*Source: svelte.dev/docs/kit/load#Errors (2024-12)*

- **Implement `handleError` hook for unexpected errors.** Log securely server-side, return generic message to client.
```typescript
// hooks.server.ts
export async function handleError({ error, event }) {
  console.error(error);
  return { message: 'Something went wrong', code: generateErrorId() };
}
```
*Source: svelte.dev/tutorial/kit/handleerror (2024-12)*

### Separation of concerns

- **Place shared state in `.svelte.js` or `.svelte.ts` files.** These files enable runes outside components. Export objects (not primitives) for reactivity to work correctly.
```javascript
// counter.svelte.js
export const counter = $state({ count: 0 });
export function increment() { counter.count += 1; }
```
*Source: svelte.dev/docs/svelte/v5-migration-guide (2024-12)*

- **Use callback props instead of events for component communication.** Better TypeScript inference and explicit contracts.
```svelte
<!-- Pump.svelte -->
<script>
  let { inflate, deflate } = $props();
</script>
<button onclick={() => inflate(5)}>Inflate</button>
```
*Source: svelte.dev/docs/svelte/v5-migration-guide (2024-12)*

---

## 2. Reactivity & State

### Runes migration from stores

- **Replace `writable()` stores with `$state()` in `.svelte.js` modules.** Export an object containing state properties; consumers import and use directly without `$` prefix.

| Svelte 4 | Svelte 5 |
|----------|----------|
| `let count = 0` (implicit) | `let count = $state(0)` |
| `$: doubled = count * 2` | `let doubled = $derived(count * 2)` |
| `$: { console.log(count) }` | `$effect(() => { console.log(count) })` |
| `export let prop` | `let { prop } = $props()` |
| `writable(0)` | `$state()` in `.svelte.js` file |

*Source: svelte.dev/docs/svelte/v5-migration-guide (2024-12)*

### Fine-grained reactivity patterns

- **Svelte 5 uses signals under the hood.** Changes to specific object properties only update DOM nodes referencing those properties—no full re-renders.
```svelte
<script>
  let todos = $state([{ done: false, text: 'Learn' }]);
  todos[0].done = true; // Only updates UI where todos[0].done is used
</script>
```
*Source: frontendmasters.com/blog/fine-grained-reactivity-in-svelte-5 (2024)*

- **Use Svelte's reactive built-in classes for Map, Set, Date, URL.**
```svelte
<script>
  import { SvelteSet, SvelteMap } from 'svelte/reactivity';
  let selectedItems = new SvelteSet();
</script>
```
*Source: svelte.dev/docs/svelte/svelte-reactivity (2024-12)*

### $state.raw vs $state

- **Use `$state.raw()` for large immutable data.** Avoids Proxy overhead; objects aren't deeply reactive. Requires full reassignment to trigger updates.
```svelte
<script>
  let person = $state.raw({ name: 'Heraclitus', age: 49 });
  person.age += 1;  // ❌ NO effect
  person = { ...person, age: 50 };  // ✅ Must reassign
</script>
```
*When to use:* Large arrays from APIs, performance-critical scenarios, data you won't mutate in place.

*Source: svelte.dev/docs/svelte/$state#$state.raw (2024-12)*

- **Use `$state.snapshot()` when passing reactive state to external APIs** that don't expect Proxies.
```typescript
const snapshot = $state.snapshot(reactiveObject);
externalLibrary.process(snapshot);
```
*Source: svelte.dev/docs/svelte/$state (2024-12)*

### $derived.by patterns

- **Use `$derived.by()` when derivation logic requires intermediate variables, loops, or conditionals.**
```svelte
<script>
  let items = $state([1, 2, 3, 4, 5]);
  let stats = $derived.by(() => {
    const sum = items.reduce((a, b) => a + b, 0);
    return { sum, avg: sum / items.length, count: items.length };
  });
</script>
```
*Source: svelte.dev/docs/svelte/$derived (2024-12)*

### Context API with Runes

- **Pass reactive objects to context for child reactivity.** Alternatively, pass getter functions.
```svelte
<!-- Parent.svelte -->
<script>
  import { setContext } from 'svelte';
  let counter = $state({ count: 0 });
  setContext('counter', counter);
</script>

<!-- Child.svelte -->
<script>
  import { getContext } from 'svelte';
  const counter = getContext('counter');
</script>
<p>{counter.count}</p>
```
*Source: svelte.dev/docs/svelte/context (2024-12)*

- **Use typed `createContext()` (Svelte 5.x) for type-safe context.**
```typescript
import { createContext } from 'svelte';
export const [getUserContext, setUserContext] = createContext<User>();
```
*Source: mainmatter.com/blog/2025/03/11/global-state-in-svelte-5 (2025-03)*

### Avoiding reactivity pitfalls

- **Never destructure reactive objects in the script block**—this breaks reactivity.
```svelte
<script>
  // ❌ BAD - loses reactivity
  let { done, text } = todos[0];
  
  // ✅ GOOD - maintain reference
  let todo = todos[0]; // Access as todo.done
</script>
```
*Source: jamesy.dev/blog/svelte-5-states-avoiding-common-reactivity-traps (2024)*

- **Read all reactive values upfront in `$effect`** to avoid short-circuit tracking issues.
```typescript
$effect(() => {
  const isInit = initialized;
  const nodeChanged = nodeRef !== prevNodeRef;
  if (!isInit || nodeChanged) { /* ... */ }
});
```
*Source: github.com/sveltejs/svelte/issues/11806 (2024)*

- **Use `tick()` before imperative DOM operations** after state changes.
```typescript
import { tick } from 'svelte';
async function submit() {
  inputValue = 'new value';
  await tick();
  form.submit();
}
```
*Source: svelte.dev/docs/svelte (2024-12)*

---

## 3. Data Loading & Mutations

### SvelteKit load functions

- **Use `+page.server.ts` for database access, private env vars, cookies.** Data is serializable only.
```typescript
// +page.server.ts
import type { PageServerLoad } from './$types';
import * as db from '$lib/server/database';

export const load: PageServerLoad = async ({ params }) => {
  return { post: await db.getPost(params.slug) };
};
```
*Source: svelte.dev/docs/kit/load (2024-12)*

- **Use `+page.ts` (universal) when returning non-serializable values** (components, custom classes) or fetching from public APIs.
```typescript
// +page.ts
export const load: PageLoad = async ({ data }) => {
  const module = data.cool 
    ? await import('./CoolComponent.svelte') 
    : await import('./BoringComponent.svelte');
  return { component: module.default };
};
```
*Source: svelte.dev/tutorial/kit/universal-load-functions (2024-12)*

### Form actions

- **Always add `use:enhance` for progressive enhancement.** Forms work without JavaScript; enhancement adds smoothness.
```svelte
<script>
  import { enhance } from '$app/forms';
</script>
<form method="POST" action="?/login" use:enhance>
  <input name="email" />
  <button>Login</button>
</form>
```
*Source: svelte.dev/docs/kit/form-actions (2024-12)*

- **Use `fail()` for validation errors, `redirect()` for success.**
```typescript
import { fail, redirect } from '@sveltejs/kit';

export const actions = {
  login: async ({ request }) => {
    const data = await request.formData();
    if (!data.get('email')) return fail(400, { missing: true });
    // ... validate
    redirect(303, '/dashboard');
  }
} satisfies Actions;
```
*Source: svelte.dev/docs/kit/form-actions (2024-12)*

### Streaming with defer

- **Stream non-essential data by returning unwrapped promises.** Essential data should be awaited.
```typescript
export const load: PageServerLoad = async ({ params }) => {
  return {
    post: await loadPost(params.slug),      // Essential - await
    comments: loadComments(params.slug)     // Non-essential - stream
  };
};
```
```svelte
{#await data.comments}
  <p>Loading comments...</p>
{:then comments}
  {#each comments as c}<p>{c.content}</p>{/each}
{/await}
```
*Caveat:* Streaming requires JavaScript—only stream non-essential data.

*Source: svelte.dev/blog/streaming-snapshots-sveltekit (2023)*

### Invalidation patterns

- **Use `depends()` to register custom dependencies, `invalidate()` to selectively rerun load functions.**
```typescript
// +page.ts
export async function load({ fetch, depends }) {
  depends('app:todos');
  return { todos: await fetch('/api/todos').then(r => r.json()) };
}

// Component
import { invalidate } from '$app/navigation';
await invalidate('app:todos');
```
*Source: svelte.dev/docs/kit/$app-navigation (2024-12)*

### Optimistic UI patterns

- **Update UI immediately before server confirms using `use:enhance` callbacks.**
```svelte
<form method="POST" action="?/delete"
  use:enhance={() => {
    deleting = [...deleting, todo.id];
    return async ({ update }) => {
      await update();
      deleting = deleting.filter(id => id !== todo.id);
    };
  }}>
```
*Source: svelte.dev/tutorial/kit/customizing-use-enhance (2024-12)*

### Bun SQLite query patterns

- **Use `db.query()` for cached prepared statements (repeated queries), `db.prepare()` for one-off dynamic SQL.**
```typescript
const stmt = db.query<User, [number]>("SELECT * FROM users WHERE id = ?");
const user = stmt.get(1);
const users = stmt.all();
```
*Source: bun.sh/docs/runtime/sqlite (2024)*

- **Use transactions for batch operations**—dramatically faster.
```typescript
const insert = db.prepare("INSERT INTO users (name) VALUES (?)");
const insertMany = db.transaction((users) => {
  for (const user of users) insert.run(user);
});
insertMany(['Alice', 'Bob', 'Charlie']);
```
*Source: bun.sh/docs/runtime/sqlite (2024)*

---

## 4. Animations

### Motion (motiondivision/motion) integration with Svelte 5

- **Use Motion's vanilla JavaScript API with `$effect` for lifecycle management.** No official Svelte 5 wrapper exists yet (Issue #2895).
```svelte
<script>
  import { animate } from 'motion';
  let element;
  
  $effect(() => {
    if (!element) return;
    const animation = animate(element, 
      { opacity: [0, 1], x: [-100, 0] }, 
      { duration: 0.5 }
    );
    return () => animation.stop();
  });
</script>
<div bind:this={element}>Animated</div>
```
*Source: motion.dev Quick Start (2024-12); github.com/motiondivision/motion*

- **For declarative components, use community wrappers:** `motion-svelte`, `@humanspeak/svelte-motion`, or `motion-sv`.
```bash
bun i motion-svelte
```
*Source: github.com/epavanello/motion-svelte (2024-11)*

### GSAP ScrollTrigger and timeline patterns

- **Register GSAP plugins at module level, use `gsap.context()` for cleanup.**
```svelte
<script>
  import { gsap } from 'gsap';
  import { ScrollTrigger } from 'gsap/ScrollTrigger';
  
  gsap.registerPlugin(ScrollTrigger);
  
  let container;
  
  $effect(() => {
    const ctx = gsap.context(() => {
      gsap.from('.element', {
        scrollTrigger: { trigger: '.element', start: 'top 80%' },
        y: 50, opacity: 0
      });
    }, container);
    return () => ctx.revert();
  });
</script>
```
*Source: GSAP Forum "SvelteKit 2 + GSAP - ScrollTrigger" (2024-06)*

- **Use timeline position parameters for precise sequencing.**
```javascript
const tl = gsap.timeline({ defaults: { duration: 1 } });
tl.to('.element-1', { x: 100 })
  .to('.element-2', { y: 50 }, '<')      // Same time as previous
  .to('.element-3', { opacity: 0 }, '+=0.5'); // 0.5s after previous
```
*Source: gsap.com/docs/v3/GSAP/Timeline (2024)*

### Animation composition

- **Use Motion's stagger for multi-element coordination.**
```javascript
import { animate, stagger } from 'motion';
animate("li", { opacity: 1, y: 0 }, { delay: stagger(0.1) });
```
*Source: motion.dev/docs/stagger (2024-12)*

- **Use GSAP context's `add()` method for dynamic animations.**
```javascript
let ctx = gsap.context((self) => {
  self.add("playIntro", () => gsap.from('.intro', { opacity: 0 }));
});
ctx.playIntro();
```
*Source: gsap.com/docs/v3/GSAP/gsap.context() (2024)*

### Performance considerations

- **Animate only `transform` and `opacity` for GPU acceleration.** Avoid `width`, `height`, `left`, `top`.
```javascript
// ✅ GPU-accelerated
animate(element, { transform: "translateX(100px) scale(2)" });

// ❌ Triggers layout
animate(element, { width: "200px" });
```
*Source: motion.dev/docs/performance (2024-12)*

- **Motion's shorthand properties (x, y, scale) use CSS variables which are NOT hardware accelerated.** Use full `transform` strings for critical animations.
```javascript
// ❌ Uses CSS variables
animate(".box", { x: 100, scale: 2 });

// ✅ Hardware accelerated
animate(".box", { transform: "translateX(100px) scale(2)" });
```
*Source: motion.dev/docs/performance (2024-12)*

- **Use `will-change` sparingly**—each layer uses GPU memory.
```javascript
element.style.willChange = "transform";
animate(element, { borderRadius: "50%" });
```
*Source: motion.dev/docs/performance (2024-12)*

### Reduced motion accessibility

- **Use Svelte 5's built-in `prefersReducedMotion` (v5.7.0+).**
```svelte
<script>
  import { prefersReducedMotion } from 'svelte/motion';
  import { fly } from 'svelte/transition';
</script>
{#if visible}
  <p transition:fly={{ y: prefersReducedMotion.current ? 0 : 200 }}>Content</p>
{/if}
```
*Source: svelte.dev/docs/svelte/svelte-motion (2024-12)*

- **Use `gsap.matchMedia()` for GSAP accessibility.**
```javascript
let mm = gsap.matchMedia();
mm.add("(prefers-reduced-motion: no-preference)", () => {
  gsap.from(".box", { rotation: 360 });
});
mm.add("(prefers-reduced-motion: reduce)", () => {
  gsap.from(".box", { opacity: 0 }); // Fade only
});
```
*Source: gsap.com/docs/v3/GSAP/gsap.matchMedia() (2024)*

### Coordinating Motion with GSAP

| Feature | Motion | GSAP |
|---------|--------|------|
| Best for | Simple UI transitions, declarative API | Complex timelines, scroll, SVG morphing |
| Bundle size | ~32KB | ~23KB core |
| API style | Declarative | Imperative |
| License | MIT | Free (Webflow-owned restrictions) |
| ScrollTrigger | Less mature | Excellent, mature |

*Recommendation:* Use Motion for entry/exit animations and simple interactions; use GSAP for complex scroll-linked animations and precise timeline control.

*Source: motion.dev "GSAP vs Motion: A detailed comparison" (2024)*

### Svelte 5 lifecycle integration

- **Use `$effect` for both Motion and GSAP, always return cleanup functions.**
```svelte
$effect(() => {
  const animation = animate(element, { x: 100 });
  return () => animation.stop();
});
```
*Source: Svelte 5 documentation (2024-12)*

---

## 5. Performance

### Bun runtime optimizations

- **Bun achieves 28% lower latency for SSR** vs Node.js, **4x more requests/second** for React SSR.
- Use `bun --hot` for development hot reload without restarts.
- Create single-file executables: `bun build --compile --minify ./server.ts --outfile server`

*Source: vercel.com/blog/bun-runtime-on-vercel-functions (2024-12)*

### Svelte 5 compiler improvements

- **Fine-grained reactivity** means only affected DOM nodes update—no virtual DOM diffing.
- **Smaller runtime** due to signals-based architecture.

*Source: vercel.com/blog/whats-new-in-svelte-5 (2024)*

### UnoCSS configuration

- **Use `@unocss/svelte-scoped` for large apps** to inject styles into component `<style>` blocks, avoiding global CSS bloat.
```typescript
// vite.config.ts
import UnoCSS from '@unocss/svelte-scoped/vite';
export default defineConfig({
  plugins: [UnoCSS({ injectReset: '@unocss/reset/tailwind.css' }), sveltekit()]
});
```
*Source: unocss.dev/integrations/svelte-scoped (2024)*

- **Enable attributify mode for cleaner markup.**
```svelte
<button bg="blue-400 hover:blue-500" text="sm white" p="y-2 x-4">
  Button
</button>
```
*Source: unocss.dev/presets/attributify (2024)*

### SSR/SSG strategies

- **Use `export const prerender = true` for static content.**
- **Disable SSR per route with `export const ssr = false`** for GSAP-heavy pages.
```typescript
// +page.js
export const ssr = false;
```
*Source: svelte.dev/docs/kit/page-options (2024-12)*

### Bundle optimization

- **Import Lucide icons via direct paths** to avoid loading entire library.
```svelte
<!-- ✅ Optimized -->
<script>
  import CircleAlert from '@lucide/svelte/icons/circle-alert';
</script>

<!-- ❌ Loads entire library -->
<script>
  import { User, Settings } from 'lucide-svelte';
</script>
```
*Source: lucide.dev/guide/packages/lucide-svelte (2024)*

### Bun SQLite query optimization

- **Enable WAL mode for concurrent reads.**
```typescript
const db = new Database("mydb.sqlite");
db.run("PRAGMA journal_mode = WAL;");
```
*Source: bun.sh/docs/runtime/sqlite (2024)*

- **Use `EXPLAIN QUERY PLAN` to debug slow queries.**
```typescript
const plan = db.query("EXPLAIN QUERY PLAN SELECT * FROM users WHERE email = ?")
  .all("[email protected]");
```
*Source: bun.sh/docs/runtime/sqlite (2024)*

---

## 6. Tooling & QA

### Bun test runner

- **Bun test is 10-30x faster than Jest** but lacks some features.
```bash
bun test                    # Run all tests
bun test --coverage         # With coverage
bun test --watch            # Watch mode with HMR
```
*Source: bun.sh/docs/cli/test (2024)*

- **For SvelteKit, use `bun run test` (not `bun test`)** to invoke Vitest via package scripts.

### Vitest integration

- **Use browser mode with `vitest-browser-svelte` for modern testing (2025 recommendation).**
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
*Source: scottspence.com "Testing Svelte with Vitest Browser Mode" (2025)*

### Playwright for E2E

- **Use Playwright Docker container in CI** to save ~30% on browser downloads.
```yaml
container:
  image: mcr.microsoft.com/playwright:v1.52.0-noble
```
*Source: playwright.dev; svelte.dev/docs/svelte/testing (2024-12)*

### @testing-library/svelte

- **Use `flushSync()` when testing external state with runes.**
```typescript
import { flushSync } from 'svelte';
double.set(5);
flushSync();
expect(double.value).toEqual(10);
```
*Source: svelte.dev/docs/svelte/testing (2024-12)*

- **Test files using runes must include `.svelte` in filename** (e.g., `*.svelte.test.ts`).

### biome vs eslint+prettier

- **Biome v2.3.0+ supports Svelte files experimentally**, ~35x faster than ESLint+Prettier.
- **For production stability, use ESLint+Prettier.** Biome lacks Svelte-specific lint rules.
```json
// biome.json
{
  "html": { "experimentalFullSupportEnabled": true }
}
```
*Source: biomejs.dev/blog/biome-v2-3 (2025)*

### svelte-check

- **Run `svelte-check` in CI before deployment.**
```json
{
  "scripts": {
    "check": "svelte-check --tsconfig ./tsconfig.json",
    "build": "npm run check && vite build"
  }
}
```
*Source: svelte.dev/docs/svelte/typescript (2024-12)*

### bunfig.toml configuration

```toml
[test]
preload = ["./test-setup.ts"]
coverage = true
coverageThreshold = { lines = 0.85 }
timeout = 10000

[install]
frozenLockfile = false
```
*Source: bun.sh/docs/runtime/bunfig (2024)*

### SQLite migrations

- **Use Drizzle Kit for structured migrations.**
```bash
bunx drizzle-kit generate   # Generate from schema changes
bunx drizzle-kit migrate    # Apply migrations
```
*Source: orm.drizzle.team (2024-2025)*

---

## 7. Type Safety

### TypeScript 5.x strict configuration

- **Extend `.svelte-kit/tsconfig.json`** and enable strict mode.
```json
{
  "extends": "./.svelte-kit/tsconfig.json",
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true
  }
}
```
*Source: svelte.dev/docs/kit/types (2024-12)*

### SvelteKit's generated types ($types)

- **Import from `./$types` for automatic route-specific typing.**
```typescript
import type { PageServerLoad, Actions, PageProps } from './$types';

export const load: PageServerLoad = async ({ params }) => { /* ... */ };

// In component
let { data, form }: PageProps = $props();
```
*Source: svelte.dev/docs/kit/types (2024-12)*

### zod/valibot for runtime validation

- **Zod:** Larger community, better docs, ~13.5KB.
- **Valibot:** Up to 98% smaller (~1.37KB), better for client-side.

```typescript
// Zod
const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

// Valibot
const schema = v.object({
  email: v.pipe(v.string(), v.email()),
  password: v.pipe(v.string(), v.minLength(8))
});
```
*Source: valibot.dev/guides/comparison (2024); builder.io/blog/introducing-valibot (2024)*

### satisfies operator patterns

- **Use `satisfies` to validate structure while preserving literal types.**
```typescript
const routes = {
  HOME: { path: '/' },
  AUTH: { path: '/auth' }
} as const satisfies Record<string, { path: string }>;

// routes.HOME.path is "/" (literal, not string)
```
*Source: typescriptlang.org/docs/handbook/release-notes/typescript-4-9 (2022)*

### Bun SQLite type patterns

- **Use generics on queries for type inference.**
```typescript
interface User { id: number; name: string; email: string; }
const user = db.query<User, [number]>("SELECT * FROM users WHERE id = ?").get(1);
```
*Source: bun.sh/docs/runtime/sqlite (2024)*

- **Enable strict mode to catch parameter binding errors.**
```typescript
const db = new Database(":memory:", { strict: true });
```
*Source: bun.sh/docs/runtime/sqlite (2024)*

### Generic components

- **Use the `generics` attribute for reusable type-safe components.**
```svelte
<script lang="ts" generics="T extends { id: string }">
  interface Props { items: T[]; onSelect: (item: T) => void; }
  let { items, onSelect }: Props = $props();
</script>
```
*Source: svelte.dev/docs/svelte/typescript#Generic-$props (2024-12)*

---

## 8. Security

### SQL injection prevention

- **Always use parameterized queries with `?` placeholders.**
```typescript
// ✅ SAFE
const stmt = db.prepare("SELECT * FROM users WHERE email = ?");
stmt.all(userInput);

// ❌ DANGEROUS
const query = db.query(`SELECT * FROM users WHERE email = '${userInput}'`);
```
*Source: bun.sh/docs/runtime/sqlite (2024); OWASP SQL Injection Prevention*

### CSRF protection

- **SvelteKit has built-in CSRF protection** checking Origin headers. Keep `checkOrigin: true` (default).
```javascript
// svelte.config.js
export default {
  kit: {
    csrf: {
      checkOrigin: true,
      trustedOrigins: ['https://trusted-payment-gateway.com']
    }
  }
};
```
*Source: svelte.dev/docs/kit/configuration#csrf (2024-12)*

### Input validation

- **Use sveltekit-superforms with Zod for validated form actions.**
```typescript
import { superValidate } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';

export const actions = {
  default: async ({ request }) => {
    const form = await superValidate(request, zod(schema));
    if (!form.valid) return fail(400, { form });
    // form.data is validated
  }
};
```
*Source: superforms.rocks (2024)*

### SvelteKit hooks for auth

- **Use `handle` hook for global auth, not layouts.**
```typescript
// hooks.server.ts
import { sequence } from '@sveltejs/kit/hooks';

const auth: Handle = async ({ event, resolve }) => {
  const session = event.cookies.get('session');
  event.locals.user = session ? await verifySession(session) : null;
  return resolve(event);
};

const authorize: Handle = async ({ event, resolve }) => {
  if (event.url.pathname.startsWith('/admin') && !event.locals.user) {
    throw redirect(303, '/login');
  }
  return resolve(event);
};

export const handle = sequence(auth, authorize);
```
*Source: svelte.dev/docs/kit/hooks (2024-12)*

### Secure headers

- **Configure CSP in svelte.config.js.**
```javascript
export default {
  kit: {
    csp: {
      mode: 'auto',
      directives: {
        'default-src': ['self'],
        'script-src': ['self'],
        'style-src': ['self', 'unsafe-inline']
      }
    }
  }
};
```
*Source: svelte.dev/docs/kit/configuration#csp (2024-12)*

### Environment variable handling

- **Use `$env/static/private` for secrets** (build-time, tree-shakeable).
- **Prefix public vars with `PUBLIC_`.**
```typescript
// Server only
import { PLEX_TOKEN } from '$env/static/private';

// Safe for browser
import { PUBLIC_API_URL } from '$env/static/public';
```
*Source: svelte.dev/tutorial/kit/env-static-private (2024-12)*

### Plex API authentication

- **Use X-Plex-Token header (preferred over URL parameter).**
```typescript
const response = await fetch(`http://${PLEX_IP}:32400/library/sections`, {
  headers: {
    'X-Plex-Token': process.env.PLEX_TOKEN,
    'X-Plex-Client-Identifier': 'unique-app-uuid',
    'Accept': 'application/json'
  }
});
```
*Source: support.plex.tv "Finding an authentication token" (2024)*

---

## 9. UI Patterns

### shadcn-svelte component customization

- **Initialize with `shadcn-svelte@next` for Svelte 5.**
```bash
pnpm dlx shadcn-svelte@next init
```
*Source: shadcn-svelte.com/docs/installation/sveltekit (2024)*

- **Use the `cn()` utility for conditional class merging.**
```typescript
// src/lib/utils.ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```
*Source: shadcn-svelte.com/docs/installation/manual (2024)*

### tweakcn theming system

- **tweakcn is a visual theme editor outputting CSS variables** compatible with both Tailwind and UnoCSS.
```css
:root {
  --primary: oklch(0.5624 0.0947 203.2755);
  --primary-foreground: oklch(1.0000 0 0);
}
```
*Source: tweakcn.com (2024-2025)*

### UnoCSS + unocss-preset-shadcn

```typescript
// uno.config.ts
import presetAnimations from "unocss-preset-animations";
import { presetShadcn } from "unocss-preset-shadcn";

export default defineConfig({
  presets: [
    presetWind(),
    presetAnimations(),
    presetShadcn({ color: "slate" })
  ]
});
```
*Source: github.com/unocss-community/unocss-preset-shadcn (2024)*

### Form handling with superforms

```svelte
<script>
  import { superForm } from 'sveltekit-superforms';
  import { zodClient } from 'sveltekit-superforms/adapters';
  
  const form = superForm(data.form, { validators: zodClient(schema) });
  const { form: formData, enhance } = form;
</script>

<form method="POST" use:enhance>
  <Form.Field {form} name="email">
    <Form.Control>
      {#snippet children({ props })}
        <Input {...props} bind:value={$formData.email} />
      {/snippet}
    </Form.Control>
    <Form.FieldErrors />
  </Form.Field>
</form>
```
*Source: shadcn-svelte.com/docs/components/form (2024); superforms.rocks (2024)*

### Accessible component patterns

- **shadcn-svelte uses Bits UI (WAI-ARIA compliant)** with keyboard navigation and screen reader support built-in.
- **Form components automatically spread ARIA attributes** via the `props` snippet parameter.

*Source: shadcn-svelte.com/docs/components/form (2024)*

---

## 10. Backend Patterns

### Bun native SQLite driver (bun:sqlite)

```typescript
import { Database } from "bun:sqlite";

// File-based with strict mode
const db = new Database("mydb.sqlite", { strict: true });

// Enable WAL mode
db.run("PRAGMA journal_mode = WAL;");

// Prevent persistent WAL files on macOS
import { constants } from "bun:sqlite";
db.fileControl(constants.SQLITE_FCNTL_PERSIST_WAL, 0);
```
*Source: bun.sh/docs/runtime/sqlite (2024)*

### Prepared statements

- **Use `db.query()` for cached statements, `db.prepare()` for one-off queries.**
```typescript
// Cached (reuse for repeated queries)
const users = db.query("SELECT * FROM users WHERE active = ?");
users.all(true);

// Non-cached (dynamic SQL)
const stmt = db.prepare(`SELECT * FROM ${validatedTable}`);
```
*Source: bun.sh/docs/runtime/sqlite (2024)*

### Using statement with automatic cleanup

```typescript
{
  using db = new Database("mydb.sqlite");
  using query = db.query("SELECT * FROM users");
  console.log(query.all());
} // Automatically closed
```
*Source: bun.sh/docs/runtime/sqlite (2024)*

### Croner scheduling patterns

```typescript
import { Cron } from "croner";

// Every 5 minutes
new Cron('0 */5 * * * *', async () => {
  await performCleanup();
});

// Daily at 2 AM with error handling
new Cron('0 0 2 * * *', {
  name: 'daily-backup',
  catch: (err, job) => console.error(`${job.name} failed:`, err)
}, runBackup);

// One-time scheduled task
new Cron('2025-01-23T14:30:00', { timezone: 'America/New_York' }, () => {
  console.log('One-time task');
});
```
*Source: github.com/Hexagon/croner (2024); croner.56k.guru (2024)*

### SvelteKit integration for scheduled jobs

```typescript
// hooks.server.ts
import { Cron } from 'croner';
import { building } from '$app/environment';

if (!building) {
  new Cron('0 */10 * * * *', { name: 'health-check' }, checkHealth);
  console.log('Scheduled jobs initialized');
}
```
*Source: dev.to/ranjanpurbey/background-jobs-in-sveltekit-with-bullmq (2025-01)*

### Plex Media Server API integration

- **Use @lukehagar/plexjs for typed Plex API access.**
```typescript
import { PlexAPI } from "@lukehagar/plexjs";

const plex = new PlexAPI({
  accessToken: process.env.PLEX_TOKEN,
  serverURL: "http://192.168.1.100:32400"
});

const history = await plex.sessions.getSessionHistory();
const stats = await plex.statistics.getStatistics({ timespan: 4 });
```
*Source: plexapi.dev/SDKs (2024); npm @lukehagar/plexjs*

### Key Plex endpoints

| Endpoint | Purpose |
|----------|---------|
| `/status/sessions/history/all` | Watch history |
| `/statistics/media?timespan=4` | Media statistics |
| `/status/sessions` | Currently playing |
| `/library/sections` | Library structure |
| `/library/recentlyAdded` | New content |

*Source: plexapi.dev/api-reference (2024)*

### Webhook handling

```typescript
// routes/api/webhooks/plex/+server.ts
export const POST: RequestHandler = async ({ request }) => {
  const formData = await request.formData();
  const payload = JSON.parse(formData.get('payload') as string);
  
  // Validate sender (Plex doesn't sign webhooks)
  if (payload.Account?.id !== expectedAccountId) {
    throw error(403, 'Unauthorized');
  }
  
  await enqueueWebhookJob(payload);
  return json({ received: true });
};
```
*Source: support.plex.tv/articles/115002267687-webhooks (2024)*

### Graceful shutdown

```typescript
import { scheduledJobs } from 'croner';

process.on('SIGTERM', async () => {
  for (const job of scheduledJobs) job.stop();
  
  // Wait for busy jobs
  const maxWait = 10000;
  const start = Date.now();
  while (scheduledJobs.some(j => j.isBusy()) && Date.now() - start < maxWait) {
    await new Promise(r => setTimeout(r, 100));
  }
  
  process.exit(0);
});
```
*Source: github.com/Hexagon/croner (2024)*

---

## Migration Quick Reference: Svelte 4 → 5

| Svelte 4 | Svelte 5 |
|----------|----------|
| `let count = 0` | `let count = $state(0)` |
| `$: doubled = count * 2` | `let doubled = $derived(count * 2)` |
| `$: { sideEffect() }` | `$effect(() => { sideEffect() })` |
| `export let prop` | `let { prop } = $props()` |
| `<slot>` | `{@render children()}` |
| `<slot name="header">` | `{@render header?.()}` |
| `<slot let:item>` | `{#snippet item(data)}...{/snippet}` |
| `createEventDispatcher()` | Callback props |
| `$$restProps` | `let { ...rest } = $props()` |
| `writable()` store | `$state()` in `.svelte.js` |

---

## Key Decision Matrix

| Scenario | Recommendation |
|----------|----------------|
| Package manager | Bun |
| Test runner | Vitest (browser mode for 2025) |
| Component testing | vitest-browser-svelte |
| E2E testing | Playwright |
| Linting | ESLint+Prettier (production); Biome (experimental) |
| Validation | Zod (server); Valibot (client-heavy) |
| Animation (simple) | Motion or Svelte transitions |
| Animation (complex) | GSAP |
| Styling | UnoCSS + shadcn-svelte |
| Scheduling | Croner |
| Database | bun:sqlite with Drizzle ORM |