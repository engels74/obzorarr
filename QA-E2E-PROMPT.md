# Obzorarr E2E QA / Dogfooding Prompt

## 1. Mission

You are an autonomous QA agent tasked with performing a comprehensive, end-to-end dogfooding pass of **Obzorarr** — a SvelteKit "Wrapped for Plex" application running locally. Your objective is to exercise every major user journey across **both admin and non-admin roles**, surface any bugs, regressions, UX issues, broken flows, security misbehavior, and data anomalies, and deliver a structured report with full reproduction evidence (screenshots, steps, severity, location).

You must **NOT** treat "no visible crash" as success. A flow only passes if it behaves per spec: correct redirects, correct data, correct role gating, correct toasts/errors, correct share-access enforcement, and no console/network errors.

Use the **`dogfood` skill** to structure this entire run (plan → explore → report). Use **`agent-browser`** as the sole mechanism for browser automation. Delegate every `agent-browser` interaction to a **GPT5.5-medium subagent**.

---

## 2. Required Setup Assumptions

- App repo path: `/Users/dkp/Documents/GitHub/engels74/obzorarr-project/obzorarr`.
- The dev server must be running. If it is not, start it with `bun run dev` in that directory (assume it binds to `http://localhost:5173` unless Vite logs otherwise — read the startup log, do not assume).
- **Before any QA work** confirm:
  - Dev server is reachable (HTTP 200 on `/`).
  - The dev bypass flags (`DEV_BYPASS_AUTH`, `DEV_BYPASS_USER`, `DEV_BYPASS_ONBOARDING`, `DEV_PLEX_TOKEN`) in `.env` are **unset or false**. Real QA requires real OAuth. If they are on, stop and report — you cannot dogfood auth with a bypass active.
  - The SQLite DB is in a **pre-onboarding state** (so you can exercise the full onboarding flow). If onboarding is already complete and the task requires testing onboarding, flag it in the final report and run the remaining flows against the live state; do NOT drop tables or rename the DB file — ask the human operator.
- You have a working Plex server reachable at `PLEX_SERVER_URL` and two real Plex.tv accounts (admin + test) defined in `.env`.

---

## 3. Reading `.env` Safely

Credentials live in `/Users/dkp/Documents/GitHub/engels74/obzorarr-project/obzorarr/.env`. The relevant keys are:

- `PLEX_SERVER_URL`
- `PLEX_TOKEN`
- `PLEX_ADMIN_USER_EMAIL`, `PLEX_ADMIN_USER_PASSWORD`
- `PLEX_TEST_USER_EMAIL`, `PLEX_TEST_USER_PASSWORD`

**Rules — non-negotiable:**

1. Read these **at runtime** in the controlling process only. Load them into in-memory variables and pass them to each subagent via its prompt **only when that subagent needs them for the specific step it is performing**. Do not fan them out eagerly.
2. **Never hardcode** any of these values into prompts, report artifacts, screenshots, filenames, repro steps, or summaries. When a repro step would otherwise show a secret, substitute a placeholder such as `<PLEX_ADMIN_EMAIL>`, `<PLEX_ADMIN_PASSWORD>`, `<PLEX_TOKEN>`, `<PLEX_SERVER_URL>`.
3. **Never log** cleartext credentials in stdout, agent output, chat, or files. Before producing any output, scrub it against the set of secrets loaded from `.env`. If a screenshot shows a password field, make sure it rendered as dots (`type="password"`); reject it otherwise and retake.
4. Before taking a screenshot of any page that might render secrets (settings → Connections tab showing `plexToken`, browser dev-tools, etc.), mask the field via DOM selector or avoid the screenshot and describe the state in text instead.
5. If `.env` is missing or any of the six keys are blank, abort the run and report a clear setup error; do not attempt to guess values.

The server-side priority for Plex config is: **environment variable overrides database**. That means `PLEX_SERVER_URL` and `PLEX_TOKEN` from `.env` will **lock** the onboarding "Connect" step into the env-pre-configured code path. This is expected and you must test that path — see §5.

---

## 4. Browser & Session Management (critical)

All browser interaction goes through `agent-browser`. All `agent-browser` work is delegated to **GPT5.5-medium subagents** (spawn with `subagent_type: "general-purpose"` and `model: "GPT5.5-medium"`, since GPT5.5-medium is the current GPT5.5-medium model).

**Browser viewport defaults:**

```yaml
DEFAULT_VIEWPORT: 1600x1200
MIN_SCRIPTED_VIEWPORT: 1280x720
RESPONSIVE_VIEWPORTS: [1920x1080, 1366x768, 768x1024, 390x844]
PHASE_1_BLOCKER_RETRY_AT_DEFAULT_VIEWPORT: true
```

Every subagent prompt must include the viewport values above and must explicitly set the `agent-browser` viewport before the first navigation. Use `DEFAULT_VIEWPORT` for scripted flows and primary evidence screenshots unless the step is explicitly testing responsive behavior. Do not collect primary pass/fail evidence at tiny browser defaults such as 800x600, because cropped forms and hidden controls can create false bugs.

**Isolation rules:**

1. **One Chromium/CDP instance per subagent.** Never share a browser session, user-data-dir, CDP endpoint, or cookie store across subagents.
2. **Default to serialized execution.** Run subagents one at a time (foreground). Parallelism is only allowed when each subagent has a provably independent `agent-browser` context with its own user-data-dir and its own Chromium process — and even then, do **not** parallelize flows that mutate shared server state (onboarding, admin settings, sync controls, slide edits, user permissions). Parallelism is acceptable only for **read-only** exploratory reconnaissance on static pages.
3. **Never run admin and non-admin flows concurrently.** They share the same server and DB; race conditions on `app_settings`, `shareSettings`, and the sync queue will produce false bugs.
4. **Session state per subagent must be explicit.** When you want a subagent to pick up where a prior subagent left off (e.g., admin logged in → admin navigates to settings), either:
   - (preferred) Keep the entire admin journey inside a single long-lived subagent, or
   - Pass the session cookie value explicitly and have the new subagent set it before navigating.
   Do not assume an implicit shared profile.
5. **Cleanup is mandatory.** Every subagent must, as its last step, close all pages, close the browser context, kill its Chromium process, and remove its temp user-data-dir. Put this in a `finally`-style block in the subagent's prompt: cleanup runs even when assertions fail or the page hangs. After the full QA run, the controlling agent must verify no `chromium`/`chrome`/`headless_shell` processes linger (`ps aux | grep -iE 'chromium|headless' | grep -v grep`) and no stale agent-browser tmpdirs remain.
6. **Timeouts.** Each subagent gets a hard wall-clock budget (default 10 minutes). If it exceeds, the controlling agent kills the subagent's browser and records a timeout finding; it does not silently retry forever.
7. **Popup/redirect auth.** Plex OAuth may open a popup at `app.plex.tv` or redirect back to `/auth/plex/redirect`. Handle both — the app has a "popup blocked" fallback. Never paste the Plex token from `.env` into the Plex.tv login form; log in with email + password on **plex.tv's** login page.
8. **Screenshot discipline.** Save screenshots to a per-run folder (e.g., `./qa-evidence/YYYYMMDD-HHMMSS/`). Name them `NN-role-flow-step.png`. Do not embed secrets in filenames.
9. **Viewport discipline.** Record the active viewport with every finding. If a control appears missing, clipped, or unreachable during Phase 1 onboarding or any setup/admin form, retry once at `DEFAULT_VIEWPORT` (or larger, e.g. `1920x1080`) and once with a second interaction method before filing a blocker. Responsive layout bugs are valid findings, but label them with the exact viewport from `RESPONSIVE_VIEWPORTS`.

---

## 5. Execution Strategy — Main User Journeys

Execute the phases **in order**. Each phase is delegated to a fresh GPT5.5-medium subagent with its own isolated browser. Treat each phase's checks as a pass/fail checklist.

### Phase 0 — Pre-flight (controlling agent, no browser)

- Load `.env` values into memory.
- Verify dev server responds at `/`.
- Create the evidence folder.
- Inspect the SQLite at `DATABASE_PATH` (or config dir) just enough to note: is `onboarding_completed` true/false? This tells you whether Phase 1 will run the real wizard or you need to skip to Phase 2.

### Phase 1 — Onboarding (admin only, env-pre-configured path)

Single GPT5.5-medium subagent, isolated browser.

1. Visit `/`. Expect a redirect to `/onboarding/<currentStep>` (starts at `/onboarding/csrf`).
2. **Step 1 — Security (`/onboarding/csrf`).** Verify the detected origin is pre-filled. Exercise:
   - "Test Origin" with the correct origin → expect success state.
   - "Test Origin" with a tampered origin (edit the input to `http://example.com`) → expect the mismatch error.
   - "Save Origin" with correct value → advance.
   - Also verify the **"Skip"** path works from a fresh DB (reset CSRF origin beforehand if already set, or just verify the button is present and labeled correctly without clicking it in this session).
3. **Step 2 — Connect (`/onboarding/plex`).** Because `PLEX_SERVER_URL` and `PLEX_TOKEN` are set in `.env`, this page should render the **env-pre-configured** variant with an "ENV" locked badge and **no manual server-selection UI**. Verify:
   - "Sign in with Plex" button is visible; click it.
   - Complete Plex OAuth with `PLEX_ADMIN_USER_EMAIL` / `PLEX_ADMIN_USER_PASSWORD` (popup or redirect — whichever the flow chooses; test both by disallowing popups once).
   - After auth, page shows "Signed in as `<admin username>` / Admin access verified."
   - Click "Continue" → submits `?/verifyAdmin` → advances to `/onboarding/sync`.
   - **Negative coverage:** open a second isolated browser context as a side probe, log into Plex.tv **with the test (non-owner) account** via a fresh `/auth/plex` call on a throwaway tab, and confirm Obzorarr reports "Only the server owner can configure Obzorarr." Then close that context and return to the admin session to continue onboarding.
4. **Step 3 — Sync.** Click "Start Sync" and watch the SSE progress/enrichment rings tick. Verify "Cancel" appears mid-run. Click "Continue" (without waiting for completion is allowed by spec — verify that).
5. **Step 4 — Configure.** Submit non-default choices for `uiTheme`, `wrappedTheme`, `anonymizationMode`, `logoMode`, `defaultShareMode`, `allowUserControl`, `enableFunFacts`, `funFactFrequency`. Then test **"Skip"** semantics in a throwaway assertion (read the handler output, don't click it if you already submitted).
6. **Step 5 — Complete.** Confirm the summary reflects the choices from Step 4. Click "Go to Dashboard" → lands on `/admin`.

Cleanup browser. Report pass/fail for each sub-step.

### Phase 2 — Admin login & Admin Panel (admin only)

New GPT5.5-medium subagent, isolated browser.

1. Visit `/`. Log in via Plex OAuth with admin credentials. Expect redirect to `/admin`.
2. Verify root dashboard renders four stat cards (Total Users, Hours Watched, Total Plays, History Records), a Sync Status panel, a Wrapped panel with "My Wrapped" / "Server Wrapped" / "Configure" tiles, and Quick Actions.
3. **`/admin/sync`:**
   - Backfill dropdown enumerates years 2000–current + "New Activity Only".
   - Start a sync (backfill current year only to keep it short). Watch SSE ring.
   - While running: Cancel button. Click it; verify cancellation toast + idle state.
   - Scheduler: Initialize → Pause → Resume → Stop, asserting status badge transitions.
   - Update cron with a valid 5-field expression (e.g., `*/30 * * * *`); verify save + "Next sync" updates.
   - Update cron with garbage (`not a cron`); verify validation error inline.
   - Click each preset chip; verify the input populates.
   - Sync History table renders; paginate if ≥9 rows.
4. **`/admin/settings`:**
   - **Connections tab:** env-sourced `plexServerUrl`/`plexToken` show source badge "env" / locked. Verify the token field is masked. "Test Connection" → success. Add an OpenAI key field test (can leave blank — just verify the form submits without breaking). Save server name.
   - **Appearance tab:** change UI theme → page restyles. Change Wrapped theme. Change anonymization mode. Change logo mode.
   - **Privacy tab:** toggle server-wrapped share mode between `public` and `private-oauth`. Toggle global default share mode through all three values. Toggle "Allow User Control". Test "Apply to All Existing Users" (both `true` and `false`) and verify the toast count matches the user count.
   - **Security tab:** "Dismiss Warning" → success. "Reset CSRF Warning".
   - **Data tab:** edit log retention + max count + debug toggle; save. "Clear Stats Cache" → confirm toast. "Clear Play History" → confirm dialog, cancel first; then if safe for QA, confirm and verify count goes to 0. If destructive is undesired, skip confirm and note in report.
   - **System tab:** read-only inspection.
5. **`/admin/users`:**
   - Year selector works.
   - Table columns render (User, Watch Time, Share Mode badge, Can Control toggle, Preview Wrapped link).
   - Toggle `canUserControl` for the test user; verify it flips and survives page reload.
   - "Preview Wrapped" opens a new tab to `/wrapped/{year}/u/{testUserId}` — verify admin can view it.
6. **`/admin/logs`:**
   - Filters: levels (each checkbox), search (debounced), source dropdown, from/to datetime pickers, "Clear All".
   - "Pause/Resume Live View" — trigger a log by starting/cancelling sync in another tab and confirm streaming/halt behaves correctly.
   - "Export JSON" downloads a file; open it and verify it's valid JSON matching the active filter.
   - "Run Cleanup" and "Clear All Logs" — exercise cautiously; Clear All requires a confirm dialog.
   - Per-row "Copy" → clipboard contents match `[ISO] [LEVEL] [source] message`.
   - "Load More" pagination.
7. **`/admin/slides`:**
   - Drag-reorder at least two slides; reload → order persists.
   - Toggle a built-in slide off; load the wrapped page in another tab and confirm it's missing.
   - "Add Custom Slide": title, Markdown body with `**bold**` and a link, year="All years", enabled=true. "Update Preview" renders sanitized HTML. Create. Verify it appears in the unified list and in the wrapped flow.
   - Edit the custom slide; save.
   - Toggle custom slide off; confirm it disappears from wrapped.
   - Delete custom slide via trash + inline confirm.
   - Fun Fact Frequency: try Few / Normal / Many / Custom (edge values: 0 should reject, 1 accepted, 15 accepted, 16 rejected).
8. **`/admin/wrapped`:** verify the hub's links all resolve 200.

Cleanup browser.

### Phase 3 — Wrapped rendering (admin viewing)

New GPT5.5-medium subagent, isolated browser. Reuse admin session by logging in fresh.

1. `/wrapped/{currentYear}` — server wrapped. Verify:
   - StoryMode renders; arrow keys / click advance slides.
   - Mode toggle switches to Scroll Mode; both work.
   - Final slide → SummaryPage; "Restart" resets; "Return Home" goes to `/`.
   - Year navigation enumerates enabled years only.
   - ShareModal opens and closes; share URL copyable.
   - Browser devtools: no console errors, no 404/500 network calls.
2. `/wrapped/{currentYear}/u/{adminUserId}` — admin's own wrapped:
   - `?/toggleLogo` — click the logo visibility control (if logoMode is `user_choice`); confirm the toggle persists on reload.
   - `?/updateShareMode` — cycle through `public`, `private-oauth`, `private-link`. For the floor rule, set global default to `private-oauth` from admin settings, then confirm the per-user `public` choice is rejected (or silently floored) with a visible message.
   - `?/regenerateToken` (only valid when mode = `private-link`): click; verify the URL's token segment changes and the old token now 404s.
3. Edge URLs:
   - `/wrapped/1999` → 404.
   - `/wrapped/2101` → 404.
   - `/wrapped/{currentYear}/u/not-a-token-and-not-an-id` → 404.
   - `/wrapped/{currentYear}/u/{adminId}` with mode=`private-link` → 403 (must use token).

Cleanup browser.

### Phase 4 — Non-admin (test user) flows

New GPT5.5-medium subagent, isolated browser.

Operational note: Plex may temporarily rate-limit or lock the test account after repeated OAuth attempts. If Plex blocks login before Obzorarr receives a session, classify Phase 4 as setup-blocked, wait for the lockout to expire or rotate to a fresh server-member test account, then rerun this phase. Do not file that condition as a product bug unless Obzorarr mishandles the returned error.

1. Visit `/`. Log in via Plex OAuth with `PLEX_TEST_USER_EMAIL` / `PLEX_TEST_USER_PASSWORD`.
2. Expect redirect to `/dashboard` (not `/admin`).
3. Attempt `/admin`, `/admin/settings`, `/admin/sync`, `/admin/users`, `/admin/logs`, `/admin/slides`, `/admin/wrapped` — each should redirect silently to `/`. Verify via URL-bar inspection after redirect.
4. `/dashboard`: verify two cards, year badge, correct usernames.
5. `/dashboard/settings`:
   - **Privacy tab** (when `canUserControl=true` from Phase 2):
     - Cycle through all three share modes.
     - Copy share URL for each mode; in another isolated context, open that URL while logged **out** and verify the access rules: `public` → 200; `private-oauth` logged-out → 403; `private-link` with correct token → 200; `private-link` with mangled token → 404.
     - Regenerate link while in `private-link`; confirm old URL becomes invalid.
   - When admin flips `canUserControl=false` in a separate admin browser: reload the test user's `/dashboard/settings`; verify the privacy card shows the locked info banner and radios are disabled or hidden.
   - **Display tab**: if `logoMode=user_choice`, toggle Show/Hide; verify the setting reflects in the user's wrapped.
   - **Account tab**: read-only values are correct (username, email, plexId, internal id, member-since, session expiry).
6. Landing-page username lookup (`/`): log out, then from landing enter the test user's username in the lookup form → redirected to `/wrapped/{year}/u/{testUserId}` if public, else behavior per share mode.
7. `/auth/logout` — ensure session is destroyed and revisiting `/dashboard` redirects to `/`.

Cleanup browser.

### Phase 5 — Cross-role & API behavior

New subagent, isolated browser for anonymous checks.

1. Anonymous access to `/wrapped/{year}` under each server-wrapped share mode (admin flips this in a second controlled session between checks).
2. `/api/sync/status/stream` — open via `curl` (not the browser) and confirm SSE frames.
3. `/api/onboarding/servers` — `curl` unauthenticated → 401/403; `curl` with an admin session cookie → 200 JSON.
4. `/api/onboarding/test-connection` — POST with correct body → success; POST with bogus URL → error.
5. CSRF — POST to any form action with `Origin: http://evil.example` (via `curl`) → 403 JSON.
6. Rate limit — hammer `/` username-lookup 20x fast → expect rate-limit error.

---

## 6. Exploratory Testing Beyond Scripted Flows

After the scripted phases, allocate one GPT5.5-medium subagent (isolated browser) for **20–30 minutes of free-form exploration** guided by the `dogfood` skill:

- Click every link, button, and icon you haven't exercised above.
- Resize through `RESPONSIVE_VIEWPORTS` (`1920x1080`, `1366x768`, `768x1024`, `390x844`); look for layout breakage at each size.
- Tab through every form with the keyboard — check focus rings, label associations, aria attributes.
- Try invalid inputs everywhere (empty, whitespace-only, extremely long strings, SQL-injection-looking strings, emoji, RTL text).
- Double-submit forms by hammering the submit button.
- Navigate back/forward/reload in the middle of flows.
- Watch the devtools Console and Network tabs the entire time — any red error or failed request is a finding.
- Open two tabs of the admin UI side-by-side and perform conflicting writes (change the same setting in both, save in opposite order) — look for lost-update bugs.

---

## 7. Validation Expectations & What Counts as a Failure

**Failure =** any of:

- Unhandled exception surfaced to user, 5xx responses on any happy path, or white-screen rendering.
- Red console errors or failed network requests on any main-flow page.
- Redirect target mismatch (e.g., non-admin reaching `/admin` without redirect, admin landing on `/dashboard`).
- Share-mode enforcement gaps (anonymous access to `private-oauth`, any access to `private-link` without the correct token, permissive user setting stored despite a stricter global floor).
- CSRF bypass — any state-changing POST succeeds with a mismatched Origin.
- Secrets leaked in UI: Plex token rendered in plaintext, password field as `type="text"`.
- Onboarding re-entry — being able to reach `/onboarding/*` after completion without a clean reason.
- Data correctness — stats that disagree with expected values for the configured year (sanity-check: totals non-negative, counts match record counts).
- Sync failures: uncaught cron parse, SSE never emits `completed`/`cancelled`/`failed`.
- Toast/error message says one thing, page state does another.
- Any file dialog, external link, or form submission that triggers navigation to a broken URL.
- Focus/accessibility regressions (focus lost after modal close; inputs without labels).

**Pass =** flow completes with correct URL transitions, correct toasts, correct DB/UI state, no errors, screenshots of key steps clean.

---

## 8. Evidence Collection for Every Finding

Every bug must include:

1. **Title** — short, precise (e.g., "Non-admin user can load `/admin/users` JSON via direct fetch").
2. **Severity** — `critical` / `high` / `medium` / `low`.
   - Critical: auth bypass, data corruption, secret leak, app unusable.
   - High: major feature broken, wrong data shown to users, share-mode enforcement gap.
   - Medium: UX defect, incorrect toast, one workflow broken but workaround exists.
   - Low: cosmetic, copy error, minor console warning.
3. **Role used** — admin / test user / anonymous.
4. **Environment** — URL, browser size, share-mode state at time of bug.
5. **Reproduction steps** — numbered, starting from "logged in as <role>" and ending at the observed defect. Reference files by `path:line` where relevant (from your codebase reading).
6. **Expected vs. Actual.**
7. **Evidence** — screenshot path(s) under `./qa-evidence/...`, with secrets masked. Short (≤10s) screen recording if the bug is time-dependent. HAR or relevant network log trimmed to the failing request if it's a network issue.
8. **Suspected cause / code pointer** — if you found the likely handler or component, cite it. Do not fix; report only.

---

## 9. Cleanup Requirements

Before reporting complete:

1. Every GPT5.5-medium subagent's browser context must be closed, Chromium process killed, user-data-dir removed. Verify with `ps` and `ls /tmp` (or the macOS equivalent tmp path) — log the verification in the final report.
2. Any test-created artifacts (custom slides, toggled settings, regenerated tokens, cleared history) should be either restored to their pre-run state or explicitly listed in the report under "State Drift After QA" so the operator can decide.
3. Leave the dev server running (do not kill it — the operator owns its lifecycle).
4. Remove or rotate any share-token URLs copied into evidence files so stale tokens in screenshots/notes are not usable (mask them in screenshots).

---

## 10. Final Report Format

Produce a single Markdown report at `./qa-evidence/<run-timestamp>/REPORT.md` with this exact structure:

```
# Obzorarr E2E QA Report — <ISO timestamp>

## Summary
- Phases run: X / 6
- Flows passed: N
- Flows failed: M
- Bugs found: by severity (critical: X, high: Y, medium: Z, low: W)
- Dev server URL tested: <url>
- Plex server URL used: <masked>
- Admin user: <masked>
- Test user: <masked>

## Phase Results
### Phase 0 — Pre-flight: PASS/FAIL + notes
### Phase 1 — Onboarding (admin, env-configured): per-step pass/fail table
### Phase 2 — Admin Panel: per-page, per-control pass/fail table
### Phase 3 — Wrapped (admin view): per-URL pass/fail
### Phase 4 — Non-admin Flows: per-page pass/fail
### Phase 5 — Cross-role & API: per-endpoint pass/fail

## Exploratory Notes
Free-form observations, UX smells, things that "felt off" but didn't reproduce cleanly.

## Findings (sorted: critical → low)
### F-001 — <title> [severity]
- Role: ...
- URL: ...
- Repro:
  1. ...
  2. ...
- Expected: ...
- Actual: ...
- Evidence: ./qa-evidence/<run>/F-001-*.png
- Suspected: src/...:LN

(repeat per finding)

## State Drift After QA
Any settings, tokens, slides, or data left in a non-baseline state.

## Cleanup Verification
- Chromium processes remaining: <count> (must be 0 or pre-existing unrelated)
- Temp profiles remaining: <paths or 'none'>

## Follow-up Recommendations
Prioritized list of fixes, tests, or hardening suggested by the findings.
```

Secrets, tokens, and passwords must be masked in this report.
