# CI and Renovate

Every pull request and default-branch push runs read-only Biome and Svelte checks,
the full Bun unit/property/integration suite with its existing 80% line/function
coverage thresholds, a production build and real-server smoke using a fresh temporary
SQLite database, and prek hygiene/secrets checks. No Plex credentials are needed.
The aggregate `ci / required` rejects missing, skipped, cancelled or failed jobs.

Local checks use Bun 1.4.2 and `bun install --frozen-lockfile`, then
`bun run check:biome`, `bun run check`, and `bash .github/scripts/check.sh`.
Hygiene uses the lockfile's own prek version via `bunx --no-install prek run
--all-files --hook-stage manual`; CI skips the branch guard and duplicate Biome hook.
Pre-push now calls the same `.env.test`-aware test command as CI. Dependency install
also propagates SvelteKit preparation failures instead of masking them.

Shared workflows and actions use immutable full version tags in `edbfi/automation`.
Renovate's shared preset preserves grouped non-major updates, handles Biome package
and schema versions through the official manager, and updates actions, hooks and Bun.
TypeScript is capped below 7 until Svelte's compiler API support is verified.
Automerge stays disabled during adoption until the corrected shared policy and
required checks are configured and validated.

The previous CI could rewrite and push code, ignore formatting errors, and skip
fresh workflow execution after a token-authenticated push. Biome repair now computes
in isolation with read-only permissions, then publishes only allowlisted changes and
explicitly dispatches full CI for the exact repaired SHA. It cannot edit workflows,
package manifests or lockfiles. Broad repairs beyond the shared size limits are manual.

Require `ci / required` with up-to-date branches, include administrators, and disable
force pushes/deletion. CI has read-only permissions, timeouts, lockfile/runtime caches
and cancellation for superseded runs; only the separate repair publisher can write.
The large offline suite covers server behavior but does not replace real Plex
integration or visual browser checks. Installed Playwright tooling alone is not
claimed as browser coverage; no browser test suite is configured in this repository.
