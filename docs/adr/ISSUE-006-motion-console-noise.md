# ISSUE-006: `[Parser] Unable to parse JSON: "undefined"` console warning

**Date:** 2026-06-07
**Status:** Closed — benign third-party noise, no app-side fix required

## Context

During Wrapped slideshow QA, the browser console logged:

```
[Parser] Unable to parse JSON: "undefined" is not valid JSON (no response)
@ https://app.plex.tv/auth-form/js/main-792-96c64949ad682a5a2893-plex-4.153.2-bc1efdc.js:0
```

The warning was initially attributed to either the `motion` animation library (v12.38.0)
reacting to an undefined animation input, or an app-side `JSON.parse` without an
undefined guard.

## Investigation

### What was ruled out

1. **App-side parser** — `grep -rn "\[Parser\]" src/` returns zero matches. There is no
   `[Parser]`-prefixed logger anywhere in this codebase.

2. **motion library** — All `animate()` calls in every slide component
   (`src/lib/components/slides/*.svelte`) and the `StoryMode` transition use only static
   string keyframes (e.g. `['translateY(25px)', 'translateY(0)']`). No app-computed
   numeric value is passed directly as a keyframe array element. The string `[Parser]` does
   not appear in `node_modules/motion/dist/motion.dev.js` as a console-log prefix, and is
   absent entirely from the production bundle (`motion.js`).

3. **Dynamic style bindings** — Inline `style=` attributes in slides (e.g.
   `style="height: {item.percentage}%"` in `DistributionSlide`) derive from computed
   values that are always defined numbers (guarded by `?? 0` or `Math.max(..., 1)` before
   the expression). `SeriesCompletionSlide.percentComplete` is typed
   `z.number().min(0).max(100)` and computed as `Math.min(100, Math.round(...))` with a
   `totalEpisodes > 0` guard defaulting to `0`.

### Root cause

Playwright console logs pinpoint the exact source URL:

```
@ https://app.plex.tv/auth-form/js/main-792-96c64949ad682a5a2893-plex-4.153.2-bc1efdc.js:0
```

The warning is emitted by the **Plex auth-form iframe script** during its postMessage
handshake. The Plex client attempts to `JSON.parse` a `window.postMessage` payload that
arrives as the string `"undefined"` (a race condition in Plex's own auth flow between the
iframe and the parent window). The warning fires at any point the Plex auth iframe is
active in the browser — it is not correlated with Wrapped slide rendering.

## Decision

No app-side code change is needed or possible. The warning is:

- **External** — originates entirely inside `app.plex.tv` JavaScript over which this
  project has no control.
- **Benign** — does not affect app state, rendering, or user experience. All Wrapped
  slides render correctly.
- **Unreproducible without Plex auth** — does not appear in unit/integration tests that
  mock Plex responses.

## What to guard if the assumption ever changes

If a future investigation shows the warning does originate from app code, the first places
to check are:

- `src/lib/components/slides/DistributionSlide.svelte` — `item.percentage` inline style
  (already safe: derived from `minutes / maxMonthly * 100` where `maxMonthly = Math.max(..., 1)`).
- `src/lib/components/slides/SeriesCompletionSlide.svelte` — `series.percentComplete`
  inline style (already safe: Zod-validated `number` from stats engine with `0` fallback).
- `src/lib/utils/animation-presets.ts:animateNumber` — `to` parameter; caller in
  `TotalTimeSlide` passes `hours` derived from `formatWatchHours(totalWatchTimeMinutes)`
  which is always a number.
