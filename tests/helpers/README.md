# Test helper contract

Obzorarr tests use Bun's runner only. Run the full suite with:

```bash
bun test --env-file=.env.test
```

## Environment and DB contract

`tests/setup.ts` is the preload file from `bunfig.toml`. It must install
environment values and virtual-module mocks before importing the app DB client.
The only permitted database modes are:

1. The shared app singleton from `src/lib/server/db/client.ts` with
   `DATABASE_PATH=:memory:`. Use this for route, service, and DB-backed unit
   tests.
2. A deliberately local `new Database(':memory:')` schema for pure/property
   tests only. Such tests must be isolated from app singletons and should call
   out that the schema is reduced.

`resetSharedTestDb()` deletes every table created by `tests/setup.ts` in a
foreign-key-safe order. Tests may reset a narrower set of tables when that is
clearer, but shared state must not leak between cases.

## Helper tiers

- Pure factories: no runtime production imports or singleton side effects
  (`factories.ts` for stats records).
- DB helpers: may import the shared `db` and schema, but no route/service
  subjects (`db.ts`, `auth.ts`, `sharing.ts`).
- Subject harnesses: install local `mock.module(...)` calls first, then
  dynamically import the subject under test. Keep these in the test file or in a
  harness that documents its mock order.

## Mocking order

For SvelteKit virtual modules and side-effectful app modules:

1. Install `mock.module(...)`.
2. Dynamically `await import(...)` the subject.
3. Restore `spyOn(...)` stubs after each test.

The toast service is globally mocked by `tests/setup.ts`; tests should assert
through `tests/helpers/toast.ts` and must not import the real `svelte-sonner`
runtime.

## Svelte 5 rune tests

Rune-containing tests should be named `*.svelte.test.ts`. Import `flushSync`
from `svelte` and call it after triggering effects or external state changes.
Wrap `$effect` tests in `$effect.root`.
