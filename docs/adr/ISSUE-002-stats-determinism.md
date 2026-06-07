# ISSUE-002: Hours-watched stat drift across views

- Status: Accepted (fix implemented)
- Date: 2026-06-07
- Finding: Dogfood observed "hours watched" varying across views (1749 ↔ 1706 ↔ 1752),
  correlated with play-count growth 2128 → 2130.

## Context

The Wrapped UI reads server/user stats from the `cached_stats` table, populated by
`calculateServerStats` / `calculateUserStats` (`src/lib/server/stats/engine.ts`). The
aggregate hours-watched is a sum of `play_history.duration` over a fixed UTC year window.
The dogfood drift suggested either a nondeterministic computation or a stale-cache problem.

## Mechanism investigated

1. **Is the cold recompute deterministic?** `calculateWatchTime`
   (`src/lib/server/stats/calculators/watch-time.ts`) is a pure ordered linear sum:
   `totalSeconds += record.duration ?? 0`, then `totalSeconds / 60`. The record set is a
   `viewed_at` range query (`createYearFilter`, fixed UTC boundaries) ordered by `viewed_at ASC`.
   For identical input it is fully deterministic.

   **Offline determinism spike** (throwaway script against a *frozen read-only copy* of
   `data/obzorarr.db`, scheduler and live-sync untouched): cleared `cached_stats` and
   recomputed the 2026 hours-watched 5×. Result was identical every run:
   `mins=105156.46666666666, hours=1752.6078, plays=2130`. The headline drift does **not**
   reproduce offline — confirming the summation is deterministic. The frozen snapshot held the
   2130-play state, and 1752.6078 matches the highest dogfood reading, i.e. the drift was the
   stats being read at different points in a live ingest+enrich cycle.

2. **Superset analysis (root cause).** `enrichMetadata`
   (`src/lib/server/sync/service.ts:510`) selects records by `isNull(duration) OR isNull(genres)
   OR isNull(releaseYear)` with **no year filter**, and writes filled values back
   (`db.update(playHistory).set(...)` ~:663). New live records are inserted with `duration` that
   can be `null` and only get a duration during enrichment. After enrichment the caller
   invalidated only `enrichMinYear..enrichMaxYear`, derived from the running sync's
   `minViewedAt`/`maxViewedAt` window. For an incremental sync this window is the recent slice
   (e.g. 2026), but enrichment can fill the duration of a record from an **older** year. The set
   of years actually changed by enrichment is therefore a **superset** of the invalidation
   window — confirmed. Older years' `cached_stats` then went stale, producing different
   hours-watched depending on whether a viewer hit the cached vs freshly-recomputed value.

3. **Live-sync analysis.** `src/lib/server/sync/live-sync.ts` calls neither `enrichMetadata`
   nor `invalidateCache` directly; it delegates to `startBackgroundSync` → `startSync`, which is
   the same path containing the (previously too-narrow) enrich invalidation. So live-sync does
   invalidate, but inherited the same narrow window. Live-sync also runs concurrently with page
   loads behind a cooldown, which is why the drift surfaced as a "measurement artifact" — but the
   underlying cause is the narrow invalidation, not a missing one.

## Decision

**Fix.** The drift is explained by stale-cache-after-enrichment. Broadened invalidation to cover
the *actual* years of enriched records (not the summation logic, which is untouched):

- `enrichMetadata` now returns `affectedYears: number[]` — the UTC years of every record whose
  stored fields actually changed (it already tracks these record IDs; it now also reads each
  record's `viewed_at`).
- The caller (`startSync`) invalidates exactly `enrichResult.affectedYears` instead of the
  `enrichMinYear..enrichMaxYear` window.

This automatically fixes the live-sync path, since live-sync delegates to `startSync`. No
separate change to `live-sync.ts` was required. The summation calculators were not modified.

## Evidence

- Offline spike: 5/5 identical cold recomputes (1752.6078 h) on the frozen DB.
- Regression tests in `tests/unit/stats/determinism.test.ts`:
  - identical input ⇒ identical aggregate hours-watched across 5 cold recomputes;
  - `enrichMetadata` reports `affectedYears` `[2023, 2026]` when a 2023 record is enriched during
    a 2026-windowed run (proves the superset);
  - `startSync` invalidates the 2023 `cached_stats` after enriching a 2023 NULL-duration record,
    and the recompute reflects the newly-filled duration.

## Files

- `src/lib/server/sync/service.ts` — `EnrichMetadataResult.affectedYears`, collection, and
  caller invalidation.
- `tests/unit/stats/determinism.test.ts` — regression tests.
