---
type: "agent_requested"
description: "Bun + SvelteKit 2 + Svelte 5 + UnoCSS + shadcn-svelte coding guidelines"
---
# Bun + SvelteKit 2 / Svelte 5 Production Reference (UnoCSS · shadcn-svelte · Biome)

This stack pairs Bun as the package manager and production runtime with a Vite-powered SvelteKit 2 app running Svelte 5's signal-based runes, styled by UnoCSS in global mode with shadcn-svelte components themed through `unocss-preset-shadcn`, and kept clean by Biome. It is exceptional at fast cold installs, fine-grained reactivity with almost no runtime overhead, and a single-language full-stack story where server and client code share types automatically. Optimize for: explicit reactivity with runes, server/client boundaries that never leak state, UnoCSS in **global** mode (not `svelte-scoped`) so shadcn's CSS-variable theming works, and letting Bun own install + production serving while Vite/Node still drives dev and build.

The biggest ways an agent writes wrong-but-plausible code here come from importing habits from adjacent ecosystems: reaching for `$effect` to sync derived values (that is React's `useEffect` muscle memory — use `$derived`), writing `on:click` / `export let` / `$$props` / stores as if this were Svelte 4, declaring module-level mutable state in server files (a cross-request leak, not a convenience), assuming `bun test` runs Svelte components (it does not — the Svelte compiler runs through Vite/Vitest), and wiring UnoCSS with Tailwind's config file or `svelte-scoped` mode (shadcn needs global CSS variables and a Tailwind-style reset). Get those five right and most of the stack falls into place.

## Toolchain, runtime, and the Bun/Vite split

Bun is the package manager and the **production** runtime. It is *not* the dev/build engine: SvelteKit builds through Vite, and Vite's transforms run on Node unless you explicitly pass `--bun`. This is the single most misunderstood fact about the stack.

- `bun install` writes `bun.lock` — a text-based JSONC lockfile that has been the default since Bun 1.2, with `lockfileVersion` 2 on the 1.4 line. Commit it. Older Bun versions cannot read v2 lockfiles.
- `bun run dev` executes the `dev` script; Vite's dev server still uses Node. Add `--bun` only if you deliberately want Bun to execute Vite (`bun --bun run dev`).
- `bunx <pkg>` runs a package binary (equivalent to `npx`); `bun run <script>` runs a `package.json` script. Use `bunx shadcn-svelte@latest add …` for the component CLI.
- In production you run the built server under Bun: `bun ./build/index.js`.

`package.json` scripts (the coherent command set):

```json
{
  "name": "app",
  "type": "module",
  "scripts": {
    "dev": "vite dev",
    "build": "vite build",
    "preview": "vite preview",
    "start": "bun ./build/index.js",
    "check": "svelte-kit sync && svelte-check --tsconfig ./tsconfig.json",
    "check:watch": "svelte-kit sync && svelte-check --tsconfig ./tsconfig.json --watch",
    "format": "biome format --write .",
    "lint": "biome lint .",
    "fix": "biome check --write .",
    "test:unit": "vitest",
    "test:e2e": "playwright test"
  }
}
```

Day-to-day: `bun install`, `bun run dev`, `bun run fix` (Biome format+lint+safe fixes), `bun run check` (types), `bun run test:unit`, `bun run build`, then `bun ./build/index.js`.

## Project configuration

SvelteKit 2 can read its config from `vite.config.ts` directly since 2.62 — when you pass configuration to the `sveltekit()` plugin, `svelte.config.js` is ignored, giving you a single source of truth.

```ts
// vite.config.ts
import { sveltekit } from '@sveltejs/kit/vite';
import UnoCSS from 'unocss/vite';
import { defineConfig } from 'vite';
import adapter from '@sveltejs/adapter-node';

export default defineConfig({
  plugins: [
    // UnoCSS must come before sveltekit()
    UnoCSS(),
    sveltekit({
      // SvelteKit config lives here now; svelte.config.js becomes optional
      kit: {
        adapter: adapter(),
        alias: { $components: 'src/lib/components' }
      }
    })
  ]
});
```

If you keep a `svelte.config.js` (still fully supported, and required by some editor tooling), it looks like this:

```js
// svelte.config.js
import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

export default {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter()
  }
};
```

`tsconfig.json` — `verbatimModuleSyntax` is **required** by the Svelte Vite plugin's TypeScript preprocessing; extend the generated Svelte base:

```jsonc
{
  "extends": "./.svelte-kit/tsconfig.json",
  "compilerOptions": {
    "strict": true,
    "verbatimModuleSyntax": true,
    "moduleResolution": "bundler",
    "isolatedModules": true,
    "skipLibCheck": true
  }
}
```

`svelte-check` is the type-checker for `.svelte` files — `tsc` alone cannot see inside components. Run it via the `check` script; it needs `svelte-kit sync` first so generated `$types` exist.

## Svelte 5 runes — the reactive core

Runes are compiler keywords (prefixed `$`), not imports. They work in `.svelte`, `.svelte.js`, and `.svelte.ts` files only. You cannot alias them, store them in variables, or call them conditionally.

**`$state` / `$derived` / `$effect` — pick the right one.** `$state` holds a value, `$derived` computes one purely, `$effect` runs a side effect after the DOM updates (browser only, never during SSR). Reach for `$derived` before `$effect`; using an effect to copy one reactive value into another is the classic React-transplant bug.

```svelte
<script lang="ts">
  let quantity = $state(1);
  let unitPrice = $state(9.99);

  // Derived: pure, memoised, recomputed on dependency change. NOT an effect.
  let subtotal = $derived(quantity * unitPrice);

  // $derived.by for multi-statement derivations
  let label = $derived.by(() => {
    if (subtotal === 0) return 'Free';
    return `$${subtotal.toFixed(2)}`;
  });

  // Effect: genuine side effect + cleanup. Runs only in the browser.
  $effect(() => {
    const id = setInterval(() => (quantity += 1), 1000);
    return () => clearInterval(id); // teardown on re-run/unmount
  });
</script>

<button onclick={() => quantity++}>{quantity} × ${unitPrice} = {label}</button>
```

Key behaviours to respect as contracts:
- `$state` objects/arrays are **deep proxies** — nested mutation is reactive. `$state.raw(...)` opts out for large immutable structures you replace wholesale.
- `$state.snapshot(value)` produces a plain (non-proxy) clone — use it before handing state to non-Svelte APIs (`structuredClone`, external libs that choke on proxies).
- `SvelteMap` / `SvelteSet` from `svelte/reactivity` track membership and iteration, but values stored inside are **not** made deeply reactive — wrap an inner object in `$state` if you need to mutate its fields reactively.
- `$effect.pre(...)` runs before DOM updates; `untrack(() => …)` reads state without creating a dependency.

**`$props` and `$bindable`.** `export let` is gone. Destructure props, type them, and mark two-way props explicitly:

```svelte
<script lang="ts">
  interface Props {
    value: string;
    placeholder?: string;
    oninput?: (v: string) => void;
  }
  let { value = $bindable(''), placeholder = '', oninput }: Props = $props();
</script>

<input {placeholder} bind:value oninput={() => oninput?.(value)} />
```

Only `$bindable` props may be driven by `bind:` from a parent; plain props are read-only in the child.

**Snippets replace slots.** Use `{#snippet}` / `{@render}` and the implicit `children` snippet:

```svelte
<!-- Card.svelte -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  let { header, children }: { header?: Snippet; children: Snippet } = $props();
</script>

<section class="rounded-lg border bg-card text-card-foreground shadow-sm">
  {#if header}<div class="border-b p-4 font-semibold">{@render header()}</div>{/if}
  <div class="p-4">{@render children()}</div>
</section>
```

```svelte
<!-- usage -->
<Card>
  {#snippet header()}Invoices{/snippet}
  <p>Body content here</p>
</Card>
```

**Event attributes, not directives.** `onclick`, `oninput`, `onsubmit` — never `on:click`. There is no event-modifier syntax; call `event.preventDefault()` in the handler. Component events are just callback props (see `oninput` above), replacing `createEventDispatcher`.

**Shared state lives in `.svelte.ts` modules**, exposed through getters so reactivity survives the import boundary. Never export a bare reactive `let` and mutate it elsewhere.

```ts
// src/lib/state/cart.svelte.ts
class Cart {
  items = $state<{ id: string; qty: number }[]>([]);
  get count() {
    return this.items.reduce((n, i) => n + i.qty, 0);
  }
  add(id: string) {
    const existing = this.items.find((i) => i.id === id);
    if (existing) existing.qty += 1;
    else this.items.push({ id, qty: 1 });
  }
}
// One instance per module = fine for CLIENT state. See SSR note below.
export const cart = new Cart();
```

## SSR, server boundaries, and state safety

**Never keep mutable module-level state in code that runs on the server** (`+page.server.ts`, `+layout.server.ts`, `hooks.server.ts`, `.remote.ts`). Modules are shared across every request, so a top-level `let user` leaks one visitor's data to the next. Per-request state belongs in `event.locals`; per-user client state (like the `cart` above) is fine only because that module is instantiated fresh in each browser. `$effect` never runs during SSR, so anything that must appear in server-rendered HTML goes in a `load` function or a `$derived`, not an effect.

In Svelte 5 read navigation state from the rune-based `$app/state`, not the legacy `$app/stores`:

```svelte
<script lang="ts">
  import { page } from '$app/state'; // reactive object, no $ prefix
</script>
<p>Current path: {page.url.pathname}</p>
```

## Routing and the data layer

The stable data-flow model is **`load` functions + form actions**. Load runs on server and/or client; `+page.server.ts` load runs only on the server (use it for secrets and direct DB access).

```ts
// src/routes/invoices/+page.server.ts
import type { PageServerLoad, Actions } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) redirect(303, '/login');
  return { invoices: await db.invoices.findMany({ userId: locals.user.id }) };
};

export const actions: Actions = {
  create: async ({ request, locals }) => {
    const data = await request.formData();
    const amount = Number(data.get('amount'));
    if (!Number.isFinite(amount) || amount <= 0)
      return fail(400, { error: 'Amount must be positive' });
    await db.invoices.create({ userId: locals.user!.id, amount });
    return { success: true };
  }
};
```

```svelte
<!-- src/routes/invoices/+page.svelte -->
<script lang="ts">
  import { enhance } from '$app/forms';
  import type { PageProps } from './$types';
  let { data, form }: PageProps = $props();
</script>

<ul>{#each data.invoices as inv (inv.id)}<li>${inv.amount}</li>{/each}</ul>

<form method="POST" action="?/create" use:enhance>
  <input name="amount" type="number" step="0.01" required />
  <button>Add</button>
  {#if form?.error}<p class="text-destructive">{form.error}</p>{/if}
</form>
```

`$types` (`PageProps`, `PageServerLoad`, `Actions`) are generated by SvelteKit from your load/action signatures — never hand-write those types. Use `+server.ts` route handlers for public APIs, webhooks, and anything needing a stable URL contract.

**Remote functions are experimental — opt-in only.** SvelteKit's `.remote.ts` files (`query`, `form`, `command`, `prerender` from `$app/server`) provide type-safe RPC and have been available since 2.27, iterating steadily, but they remain behind `kit.experimental.remoteFunctions` and are explicitly outside semantic versioning — the SvelteKit config docs label experimental features "Here be dragons… not subject to semantic versioning, so breaking changes or removal can happen in any release." Default to `load` + form actions for production. If you enable them, treat every remote function as a public endpoint and validate input with a Standard Schema validator (Zod/Valibot); enabling them also requires `compilerOptions.experimental.async` for in-component `await`.

## Auth pattern (hooks + locals)

Authentication belongs in `hooks.server.ts`, populating `event.locals` for every request. Type `locals` in `src/app.d.ts`.

```ts
// src/hooks.server.ts
import type { Handle } from '@sveltejs/kit';
import { verifySession } from '$lib/server/auth';

export const handle: Handle = async ({ event, resolve }) => {
  const token = event.cookies.get('session');
  event.locals.user = token ? await verifySession(token) : null;
  return resolve(event);
};
```

```ts
// src/app.d.ts
declare global {
  namespace App {
    interface Locals {
      user: { id: string; email: string } | null;
    }
  }
}
export {};
```

Set cookies with `event.cookies.set(name, value, { path: '/', httpOnly: true, secure: true, sameSite: 'lax' })`. Guard pages in `load` (return `redirect(303, …)`), never rely on client-side checks.

## Styling: UnoCSS (global mode) + shadcn-svelte + unocss-preset-shadcn

This is where agents most often produce broken setups. The rules:

1. **Use UnoCSS in global mode (`unocss/vite`), not `@unocss/svelte-scoped`.** Svelte-scoped rewrites utility class names per component and distributes styles into component `<style>` blocks — that is designed for shippable component *libraries*, and it breaks shadcn-svelte, which depends on globally-scoped CSS custom properties (`--background`, `--primary`, …) and a Tailwind-style reset.
2. **`unocss-preset-shadcn` generates the shadcn CSS variables and theme.** Pair it with `presetWind3` and `unocss-preset-animations`.
3. **`presetWind4` is the package's default (since preset v1.0), but pin to the `presetWind3` path for reliability.** `presetWind4` switches colors to the `oklch` model with `color-mix()`, which has documented open bugs with this preset and, per UnoCSS's own docs, does not play well with `transformerDirectives` or `presetLegacyCompat`. Import the stable v3 entry: `unocss-preset-shadcn/v3`.
4. **`.ts`/`.js` files are not extracted by default** — you must add them to the content pipeline, or shadcn-svelte's `index.ts` barrel components lose their classes.

```bash
bun add -D unocss @unocss/preset-wind3 @unocss/extractor-svelte \
  unocss-preset-animations unocss-preset-shadcn
bun add -D @unocss/reset
```

```ts
// uno.config.ts
import { defineConfig } from 'unocss';
import { presetWind } from '@unocss/preset-wind3';
import extractorSvelte from '@unocss/extractor-svelte';
import presetAnimations from 'unocss-preset-animations';
import { presetShadcn } from 'unocss-preset-shadcn/v3';

export default defineConfig({
  extractors: [extractorSvelte()],
  presets: [
    presetWind(),
    presetAnimations(),
    presetShadcn({ color: 'zinc' }) // default darkSelector is `.dark` — correct for Svelte/bits-ui
  ],
  content: {
    pipeline: {
      include: [
        // default globs …
        /\.(vue|svelte|[jt]sx|mdx?|astro|elm|php|phtml|html)($|\?)/,
        // …plus JS/TS so shadcn-svelte barrels are scanned
        'src/**/*.{js,ts}'
      ]
    }
  }
});
```

Do **not** set `darkSelector: '[data-kb-theme="dark"]'` — that is the SolidUI/Kobalte default. shadcn-svelte uses the `.dark` class strategy, which is `presetShadcn`'s default. For a runtime color-swap UI, pass an array of themes (`presetShadcn(builtinColors.map((c) => ({ color: c })))`) and toggle the generated `theme-<color>` class on `document.body`; the preset ships no `updateTheme` helper.

Root layout wires the reset, generated utilities, and dark-mode manager. `mode-watcher` is still required — it sets the `.dark` class on `<html>` before paint, avoiding the light→dark flash that `onMount`-based toggles cause:

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import '@unocss/reset/tailwind.css'; // shadcn assumes the Tailwind reset
  import 'uno.css';
  import '../app.css'; // your theme vars / globals
  import { ModeWatcher } from 'mode-watcher';
  let { children } = $props();
</script>

<ModeWatcher />
{@render children?.()}
```

Theme toggle (Svelte 5 syntax, `@lucide/svelte` is the current icon package — the old `lucide-svelte` is deprecated and points users to `@lucide/svelte` for Svelte 5):

```svelte
<script lang="ts">
  import SunIcon from '@lucide/svelte/icons/sun';
  import MoonIcon from '@lucide/svelte/icons/moon';
  import { toggleMode } from 'mode-watcher';
  import { Button } from '$lib/components/ui/button/index.js';
</script>

<Button onclick={toggleMode} variant="outline" size="icon">
  <SunIcon class="h-[1.2rem] w-[1.2rem] scale-100 dark:scale-0" />
  <MoonIcon class="absolute h-[1.2rem] w-[1.2rem] scale-0 dark:scale-100" />
  <span class="sr-only">Toggle theme</span>
</Button>
```

**shadcn-svelte CLI with UnoCSS.** Because you are not using Tailwind, do **not** run `shadcn-svelte init`. Instead set up manually, then use `add`:

- Install the runtime deps the components import: `bun add bits-ui tailwind-variants clsx tailwind-merge @lucide/svelte mode-watcher`.
- Add `src/lib/utils.ts` with the `cn` helper:

```ts
// src/lib/utils.ts
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- Create `components.json` and an **empty `tailwind.config.js`** in the project root (the CLI expects both even though styling runs through UnoCSS):

```json
{
  "$schema": "https://shadcn-svelte.com/schema.json",
  "style": "default",
  "tailwind": { "config": "tailwind.config.js", "css": "src/app.css", "baseColor": "zinc" },
  "aliases": { "components": "$lib/components", "utils": "$lib/utils" }
}
```

- Then `bunx shadcn-svelte@latest add button card dialog` copies component source into `$lib/components/ui`. These files are **yours** — edit them directly; `bun update` never touches them. Re-run `add <name>` to pull upstream changes and reconcile.

shadcn-svelte components are runes-native (`$props`, snippets, `onclick`), built on **bits-ui** primitives (accessible, unstyled behaviour) with the styling layered on top. Compose them; for a sortable table use TanStack Table, and for validated forms use Formsnap + Superforms.

## Testing

`bun test` is **not** appropriate for Svelte components — it does not run the Svelte compiler or Vite transforms, and runes only work when compiled. Use **Vitest** through `@sveltejs/vite-plugin-svelte`. The modern component approach is **`vitest-browser-svelte`** (Browser Mode, real browser via Playwright) rather than `@testing-library/svelte` + jsdom, which mocked browser APIs; browser mode also correctly exercises runes that need a real DOM. Split into two Vitest projects: a browser project for components and a Node project for server logic.

```ts
// vite.config.ts (test section) — requires vitest 4.x, vitest-browser-svelte 3.x
import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
  plugins: [sveltekit()],
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'client',
          browser: { enabled: true, provider: 'playwright', instances: [{ browser: 'chromium' }] },
          include: ['src/**/*.svelte.{test,spec}.ts']
        }
      },
      {
        extends: true,
        test: {
          name: 'server',
          environment: 'node',
          include: ['src/**/*.{test,spec}.ts'],
          exclude: ['src/**/*.svelte.{test,spec}.ts']
        }
      }
    ]
  }
});
```

```ts
// src/lib/components/counter.svelte.test.ts
import { render } from 'vitest-browser-svelte';
import { expect, test } from 'vitest';
import Counter from './counter.svelte';

test('increments', async () => {
  const screen = render(Counter, { initialCount: 1 });
  await screen.getByRole('button', { name: 'Increment' }).click();
  // Locators auto-retry until the assertion passes — no manual act()/tick()
  await expect.element(screen.getByText('Count is 2')).toBeVisible();
});
```

Use **Playwright** for end-to-end flows (`test:e2e`). Do not use `act()` or `fireEvent` patterns from testing-library — `vitest-browser-svelte` exposes retrying locators and `expect.element` instead.

## Biome — format, lint, organize

Biome replaces ESLint + Prettier for this stack. It is a fast formatter and linter for JS/TS/JSX, JSON(C), and CSS. Its **`.svelte` support is experimental**, hidden behind `html.experimentalFullSupportEnabled`: it can lint and format the JS/TS in `<script>` and the CSS in `<style>`, and since 2.4 it parses Svelte control-flow (`{#if}` … `{/if}`), but markup formatting and some cross-language rules still have gaps and occasional false positives. Treat Biome as the source of truth for all non-`.svelte` files and for `<script>` linting; treat **`svelte-check` as the source of truth for `.svelte` type correctness**.

```jsonc
// biome.json
{
  "$schema": "https://biomejs.dev/schemas/2.5.0/schema.json",
  "vcs": { "enabled": true, "clientKind": "git", "useIgnoreFile": true },
  "files": { "ignoreUnknown": true },
  "formatter": { "enabled": true, "indentStyle": "tab", "lineWidth": 100 },
  "linter": { "enabled": true, "rules": { "recommended": true } },
  "javascript": { "formatter": { "quoteStyle": "single" } },
  "assist": { "actions": { "source": { "organizeImports": "on" } } },
  "html": { "experimentalFullSupportEnabled": true },
  "overrides": [
    {
      "includes": ["**/*.svelte"],
      "linter": {
        "rules": {
          // trim false positives on framework files if they surface
          "style": { "useConst": "off" }
        }
      }
    }
  ]
}
```

Commands: `biome check --write .` (format + lint + organize imports + safe fixes), `biome format --write .`, `biome lint .`. Run via `bunx biome …` or the `package.json` scripts. Biome does not type-check — that is `svelte-check`'s job, kept separate. If Biome's experimental markup formatting mangles a component, disable formatting for `.svelte` in the override and add `prettier-plugin-svelte` solely for `.svelte` formatting; that is the one legitimate complementary tool, for that specific gap.

## Deployment (Bun runtime)

Use **`@sveltejs/adapter-node`** and run the output under Bun. `svelte-adapter-bun` exists but is based on an old fork of adapter-node and its development has stalled, so it lags on origin/CORS handling that recent SvelteKit security changes depend on. `adapter-node`'s output runs unmodified on Bun, giving you the Bun runtime in production without the maintenance risk:

```bash
bun run build          # Vite build -> ./build
bun ./build/index.js   # standalone server on the Bun runtime
```

Set `ORIGIN` (or `PROTOCOL_HEADER`/`HOST_HEADER` behind a proxy) so SvelteKit's form-action CSRF protection resolves the request URL correctly — this is the most common "works locally, 403s in prod" trap. Reach for `svelte-adapter-bun` only if you specifically need Bun-native WebSocket upgrades via `event.platform`.

## Anti-patterns to avoid

| Wrong | Why | Right |
| --- | --- | --- |
| `$effect(() => { double = count * 2 })` | Effect used to derive a value — extra render pass, stale-value bugs; a React `useEffect` habit | `let double = $derived(count * 2)` |
| `on:click={…}`, `export let x`, `$$props`, `createEventDispatcher` | Svelte 4 syntax; invalid or non-reactive in runes mode | `onclick={…}`, `let { x } = $props()`, callback props |
| Module-level `let user` in `+page.server.ts` / `hooks.server.ts` | Shared across all requests — cross-user data leak | Per-request `event.locals`; set in `hooks.server.ts` |
| `bun test` for components | No Svelte compiler / Vite transform; runes don't run | `vitest` with `vitest-browser-svelte` in Browser Mode |
| `@unocss/svelte-scoped` mode | Rewrites class names & scopes styles; breaks shadcn's global CSS variables + reset | `unocss/vite` (global) + `unocss-preset-shadcn` |
| `presetWind4` with `unocss-preset-shadcn` | oklch/`color-mix` bugs + `transformerDirectives` incompatibility | `presetWind3` via `unocss-preset-shadcn/v3` |
| Running `shadcn-svelte init` on a UnoCSS project | Scaffolds a Tailwind pipeline that conflicts with UnoCSS | Manual `cn` util + `components.json` + empty `tailwind.config.js`, then `add` |
| Forgetting `'src/**/*.{js,ts}'` in UnoCSS content | shadcn barrel `index.ts` files aren't scanned; classes vanish in prod | Add JS/TS to `content.pipeline.include` |
| `import { page } from '$app/stores'` in Svelte 5 | Legacy store API; verbose `$page` access | `import { page } from '$app/state'` |
| Dark-mode toggle in `onMount` | Runs after hydration — flash of wrong theme | `mode-watcher` `<ModeWatcher />` in root layout |
| `import Icon from 'lucide-svelte'` | `lucide-svelte` is deprecated; points to the scoped package for Svelte 5 | `import Icon from '@lucide/svelte/icons/…'` |
| `svelte-adapter-bun` as default | Stalled fork; lags origin/CORS handling | `adapter-node` run via `bun ./build/index.js` |
| Relying on remote functions in production | Experimental, outside semver — can break on any release | `load` + form actions; opt in only knowingly |

## Version & compatibility

| Component | Targeted line | Notes / floor |
| --- | --- | --- |
| Bun | 1.4.x | Package manager + prod runtime; text `bun.lock` default since 1.2, `lockfileVersion` 2 on the 1.4 line |
| SvelteKit (`@sveltejs/kit`) | 2.70.x | Config may live in `vite.config.ts` (≥2.62, where `svelte.config.js` is then ignored); Vite 8 supported since 2.53.x. SvelteKit 3 is RC/preview — excluded |
| Svelte | 5.56.x | Runes stable since the Svelte 5 release (Oct 2024) |
| TypeScript | 6.0.x | Last 5.x was 5.9; `verbatimModuleSyntax` required by Svelte plugin. TS 7 native compiler excluded — Svelte language tools not yet ready |
| Vite | 8.x | Rolldown-based; requires `@sveltejs/vite-plugin-svelte` 7 |
| `@sveltejs/vite-plugin-svelte` | 7.2.x | Requires Vite 8 + Svelte 5.46.4+ |
| UnoCSS (`unocss`, `@unocss/vite`, `@unocss/preset-wind3`) | 66.x | Global mode; `extractorSvelte` for `class:` directives |
| `unocss-preset-shadcn` | 1.0.1 | Use `unocss-preset-shadcn/v3` (presetWind3); package default is presetWind4 (oklch/transformer issues) |
| `unocss-preset-animations` | current | Replaces `tailwindcss-animate` |
| shadcn-svelte (CLI) | latest | Runes-native; on bits-ui; no `init` with UnoCSS |
| Biome (`@biomejs/biome`) | 2.5.x | `.svelte` support experimental (opt-in flag); JS/TS/JSON/CSS stable |
| Vitest | 4.x | Browser Mode via Playwright |
| `vitest-browser-svelte` | 3.x | Requires Vitest 4+ |
| svelte-check | 4.5.x | Type-checker for `.svelte` |
| `@sveltejs/adapter-node` | 5.5.x | Run output under Bun; preferred over stalled `svelte-adapter-bun` |
| Node (toolchain floor) | 20.19+ | For Vite/plugin when not executing via `--bun`; Bun 1.4 covers the runtime |

- **Research date:** September 5, 2026
