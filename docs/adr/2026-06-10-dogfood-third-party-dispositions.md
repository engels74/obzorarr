# 2026-06-10 dogfood: third-party dispositions (report ISSUE-002, ISSUE-008)

**Date:** 2026-06-10
**Status:** Closed — third-party, documented, not code-fixable

Two findings in the 2026-06-10 dogfood report (`dogfood-output/report.md`) resolve to
third-party (Plex-hosted) behavior Obzorarr cannot fix in its own code. The other eight
findings (ISSUE-001/003/004/005/006/007/009/010) received surgical code fixes in the same PR.

## report ISSUE-002 — auth "overlay" cannot be dismissed; Escape/backdrop navigate away

### Investigation
Obzorarr has **no in-app iframe overlay** embedding Plex sign-in. Auth uses a popup window
or a full-page redirect to **Plex's own OAuth page** (`buildPlexOAuthUrl`,
`src/routes/auth/plex/+server.ts`). The only Obzorarr-owned overlay around the flow is
`PopupBlockedModal` (`src/lib/components/auth/PopupBlockedModal.svelte`).

### What we own (verified dismissable)
`PopupBlockedModal` always closes without starting OAuth: the visible **Cancel** button
(`handleCancel`) and Escape/backdrop (via `onOpenChange` → `handleOpenChange(false)`) both
dismiss and return the user to the prior page. **Only** "Continue to Plex" (`handleContinue`)
initiates OAuth. There is no in-app focus trap.

### What we cannot own (third-party)
The report's "Escape triggers OAuth redirect / backdrop click navigates to plex.tv/terms"
symptom is the **Plex-hosted OAuth page** (third-party DOM) — Obzorarr cannot restyle it or
add a dismiss handler. Mitigation already present: closing the popup returns to our intact
page (no trap), and an always-visible `/auth/plex` entry offers an alternative.

### Decision
No change to the OAuth security flow (PIN/state/returnTo validation untouched). A clarifying
comment was added to `PopupBlockedModal.svelte` recording the in-app-vs-Plex boundary.

## report ISSUE-008 — recurring `[Parser] Unable to parse JSON: "undefined"` console noise

This is the **same** warning already investigated and closed in
[`docs/adr/ISSUE-006-motion-console-noise.md`](./ISSUE-006-motion-console-noise.md)
(2026-06-07): it originates in Plex's bundled `app.plex.tv` auth-form JS during its
postMessage handshake, not in any Obzorarr code (`grep` for the string finds only comments).
Benign, no functional impact, unreproducible without live Plex auth.

### Decision
No app-side fix. A comment at the OAuth initiation point
(`src/routes/auth/plex/+server.ts`) records the third-party origin. The warning is
deliberately **not** swallowed by monkey-patching `console.warn` — that would mask genuine
warnings and violate "no behavior change beyond the fix".
