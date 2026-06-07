# ISSUE-001: Missing ENV badge for env-set Plex config — FALSE POSITIVE

- Status: Closed — false positive. Behavior is correct; regression coverage added.
- Date: 2026-06-07

## Finding (as reported)

The dogfood run reported that an environment-set Plex connection did not show the "Locked by
environment variable" badge and the input remained editable, implying the env-lock UI was broken.

## Resolution: false positive

The dogfood ran under `bun run dev`, which does **not** load `.env` (see `DX-001`). So the Plex
config was genuinely DB-sourced (`source: 'db'`, `isLocked: false`) — an editable field with no
badge is the **correct** rendering for a non-env value. There was no env value in effect to lock.

The env-lock implementation is present and correct:

- `resolveConfigValue` (`src/lib/server/admin/settings.service.ts`) returns
  `{ source: 'env', isLocked: true }` only when an **authoritative** env value is present
  (`isAuthoritativeEnvValue`), else `{ source: 'db', isLocked: false }` or `'default'`.
- The connections page (`src/routes/admin/settings/connections/+page.svelte`) derives
  `plexServerUrlLocked = settings.plexServerUrl.isLocked` and renders
  `<SettingsStatusPill tone="warning">ENV</SettingsStatusPill>` + `disabled={plexServerUrlLocked}`
  on that flag.

## Evidence / regression coverage

Because there is no Svelte component-render harness in the Bun suite, the end-to-end chain is pinned
across three complementary checks rather than one browser render:

1. **Env loads into the process** — `DX-001` proves `--env-file=.env` makes an authoritative
   `PLEX_SERVER_URL` present in `process.env` (and plain `bun` does not).
2. **Resolution contract** — `tests/unit/admin/connections-actions.test.ts` →
   *"ISSUE-001 — env authority resolves to a locked, env-sourced config value"*: an authoritative
   `PLEX_SERVER_URL` resolves to `source: 'env'`, `isLocked: true` (and DB-only resolves to
   `source: 'db'`, `isLocked: false`), exercising the real `resolveConfigValue` path the page
   consumes.
3. **Template wiring** — `tests/unit/admin/dogfood-ui-invariants.test.ts` source-guards that the page
   gates the ENV pill and the `disabled` attribute on `settings.plexServerUrl.isLocked`.

Together these rule out a genuine lock bug hidden behind the env-not-loaded symptom: a value that is
authoritative in env resolves to `isLocked: true`, and the template renders the pill + disabled
input for that flag.

## Decision

Close as a false positive. Keep the regression coverage above so a real lock regression (resolution
or template) would now fail CI.
