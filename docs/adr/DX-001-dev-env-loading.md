# DX-001: Local dev ignores `.env`

- Status: Accepted — documented + opt-in `dev:env` script.
- Date: 2026-06-07

## Context

`bun run dev` is `bun --bun vite dev`. Bun does **not** auto-load `.env`, and the dev script has no
`--env-file`, so environment variables placed in `.env` are absent from `process.env` during local
dev. Verified:

```
bun --env-file=.env -e 'console.log(process.env.PLEX_SERVER_URL ? "LOADED" : "unset")'  # LOADED
bun              -e 'console.log(process.env.PLEX_SERVER_URL ? "LOADED" : "unset")'      # unset
```

This is surprising for anyone who expects `.env` to apply locally (the README only documented env
vars for Docker). It directly caused the **ISSUE-001 false positive**: the dogfood run saw no
"Locked by environment variable" badge on the Plex fields because `.env` was never loaded, so the
config was genuinely DB-sourced (`source: 'db'`, `isLocked: false`) — editable, no badge = correct
behavior, not a bug.

## Decision

Doc/harness only — **no application-code change** (and therefore no coverage impact):

1. **Document** in `README.md` that local dev configures the server via onboarding/DB, and that
   env-variable precedence + the env-lock UI apply to Docker/production.
2. **Add an opt-in `dev:env` script** (`bun --bun --env-file=.env vite dev`) so env-precedence — and
   the env-locked UI path — can be exercised locally on demand.
3. **Recommend the dogfood/QA harness record the tested git SHA**, not just the semver, in its run
   metadata. The ISSUE-001 confusion was compounded by not being able to tell which exact build the
   QA ran against; a SHA prevents stale-build misattribution.

## Consequences

- Default `dev` behavior is unchanged (onboarding/DB flow); no surprise for existing contributors.
- `dev:env` makes the env-precedence path reproducible locally, which is what the ISSUE-001
  closure relied on to rule out a genuine lock bug.
- The git-SHA recommendation is advisory for the external dogfood harness; it is not enforced here.
