# Legacy Removal TODO — scheduled for PR-4 of the v3 UI overhaul

> **Resumption note (session 3 stopped 2026-05-18 afternoon).** PR-1
> foundation + PR-2 settings monolith deletion are landed; PR-3 auth
> surfaces are partially shadcnized. The v3 plan at
> `~/.claude/plans/i-set-you-to-vectorized-sutton-v3.md` is on track:
>
> | Story  | Status                                                |
> |--------|-------------------------------------------------------|
> | US-001..US-017 | ✅ Closed in session 1 (PR-1 foundation)         |
> | US-018 | ✅ Closed — route split + ?tab= redirect (cf958fa, 57e4161, 9f3769b) |
> | US-019 | ⚠️  SidebarTrigger 44×44 floor fixed in 2c543a7; full migration still blocked on the 5 source-pinned a11y test refactors (follow-up §US-019 below) |
> | US-020 | ✅ Closed — all 6 nested-route UI extractions + full OCC plumbing + bulk-apply migration + settingsVersionISO helper (6a0a09c) |
> | US-022 | ✅ Closed — 4779-line monolith deleted (cf958fa, f3cc0b5, 5081af2) |
> | US-013 | ✅ Closed — direct OCC helper tests (12 cases at occ-helpers.test.ts) + appearance-actions external-OCC coverage (10 cases) + nested-route inline-OCC integration (~57 cases) |
> | US-021 | ❌ Not started — 5 admin route reskins (sync/users/logs/slides/wrapped admin); each is visually-coupled to custom CSS, multi-iteration job |
> | US-024 | ⚠️  Token audit clean; SubmitButton swap attempted + reverted (hero CTA visual coupling) — needs paired CSS hoisting to :global() |
> | US-025 | ✅ Closed — PopupBlockedModal already uses shadcn AlertDialog; continue-btn swapped to shadcn Button (81d8f64); auth/plex/redirect callback fully reskinned with shadcn Card + Button + lucide icons (efa131e) |
> | US-009b, US-012, US-015 | ❌ Deferred (consumer-driven / Playwright install / inline bootstrap) |
> | US-023, US-026..US-034 | ❌ PR-3 + PR-4 backlog                       |
>
> All gates green: `bun run check` 6715/0/0; `bun run lint` clean; `bun run build` ✓;
> `bun run test` 1884 pass, 0 fail. **Branch `feat/ui-overhaul-pr1` is mergeable
> as PR-1 + PR-2 (minus US-021) + the US-025 slice of PR-3.** Everything below
> US-025 belongs to PR-3 / PR-4 backlog.
>
> **To resume**: run
> `/oh-my-claudecode:ralph execute the plan at ~/.claude/plans/i-set-you-to-vectorized-sutton-v3.md`
> in a fresh session. Recommended next pick: US-021 (admin route reskins).
> The smallest is /admin/users at 738 LOC; each route is its own focused
> rewrite to shadcn Card / Table / Tabs / Dialog primitives, preserving
> the existing form actions + requireAdminActions guard.
>
> **Landing-page caveat for US-024**: the hero `view-button` + `username-input`
> have hand-tuned padding/font-size/box-shadow that the shadcn Button + Input
> defaults don't match. A naive SubmitButton swap visually shrinks the
> primary CTA. The clean path is to (a) wrap the existing `.view-button` and
> `.username-input` CSS rules in `:global(...)` so Svelte 5 scoped CSS still
> reaches the child component's rendered element, then (b) pass
> `class="view-button tap-target"` / `class="username-input"` to the swapped
> primitives. Plan ~8 CSS-block edits + 2 template edits for the swap.


This file tracks transient compatibility shims introduced during the PR-1..PR-3
phases of the v3 UI/UX overhaul. Every entry below MUST be removed in PR-4
(D6, D7) before the feature branch lands on `main`. The boulder doesn't stop
until this file is either empty or deleted.

## Legacy HSL token fallback (`?legacy-tokens=1`)

Introduced in PR-1 (A3 step 5) to give the OKLCH cutover a one-release rollback
window. Remove ALL of the following in PR-4:

- [ ] Delete `static/app-legacy.css` (byte-for-byte snapshot of the pre-PR-1
  HSL `:root` + per-theme blocks).
- [ ] Remove the conditional `<link rel="stylesheet" href="/app-legacy.css"
  data-legacy-tokens-link disabled />` line from `src/app.html`.
- [ ] Remove the inline `<script>` block in `src/app.html` that removes
  `disabled` from the legacy stylesheet link when
  `data-legacy-tokens="1"`.
- [ ] Remove the `?legacy-tokens=…` URL-param + `legacy_tokens` cookie branch
  inside the pre-paint bootstrap script at `src/app.html:10-28`.
- [ ] Remove the `console.warn('[obzorarr] legacy HSL token override active —
  scheduled removal: PR-4')` line.
- [ ] Verify `rg 'app-legacy\.css|legacy-tokens|data-legacy-tokens' src/`
  returns zero matches.

## `--primary-hue` arithmetic shim

The `--primary-hue` numeric CSS variable is preserved only in
`static/app-legacy.css` (so `?legacy-tokens=1` still works) through PR-1..PR-3.
In PR-4 (after the legacy-tokens fallback is dropped):

- [ ] Verify `rg 'var\(--primary-hue\)' src/` returns zero matches.
- [ ] Verify `rg -- '--primary-hue:' src/` returns zero matches.

## Legacy form-handling helpers (PR-4 / D1)

- [ ] Delete `src/lib/utils/submit-action.ts`.
- [ ] Trim the legacy `FormResponse` branch out of
  `src/lib/utils/form-toast.ts` — Superforms `ActionResult` only.
- [ ] Drop the legacy half of
  `tests/unit/lib/utils/form-toast-parity.test.ts` in the same commit
  that removes the legacy branch.
- [ ] Verify `rg 'submitAction\(' src/` returns zero matches.

## Legacy components (PR-4 / D2)

- [ ] Delete `src/lib/components/onboarding/OnboardingCard.svelte` (replaced
  by shadcn Card + new StepIndicator primitive in PR-3 / C3-C4).
- [ ] Delete the legacy `StepIndicator` (replaced in PR-3).
- [ ] Delete `ShareModal` (replaced by shadcn Dialog in PR-3 / C2 / C5 area).
- [ ] Remove the hand-rolled focus-trap helper (replaced by bits-ui Dialog
  built-in trap).
- [ ] Delete the legacy admin sidebar markup (replaced in PR-2 / B2).
- [ ] Verify `rg 'OnboardingCard|ShareModal' src/` returns zero matches.

## Final grep sweep (PR-4 / D7)

Run all of these — every command must return zero:

```bash
rg 'hsl\(var\(--' src/
rg 'submitAction\(' src/
rg 'app-legacy\.css|legacy-tokens|data-legacy-tokens' src/
rg 'PopupBlockedModal\.svelte' src/
rg 'var\(--primary-hue\)|--primary-hue:' src/
rg 'OnboardingCard|ShareModal' src/
```

## shadcn-svelte Slider (re-add when first consumer materialises)

The `slider` primitive was installed in the US-003 batch but removed
again because bits-ui's `Slider.Root` exposes a discriminated-union
`type: "single" | "multiple"` prop that doesn't survive the
shadcn-svelte `...restProps` spread + `bind:value` pattern under
Svelte 5 strict mode. The component currently produces an
"Expression produces a union type that is too complex to represent"
error from svelte-check.

When the first PR-2/3 surface needs a slider:

- Re-install with `bunx shadcn-svelte@latest add slider -o`.
- Either remove the discriminated `type` prop (forward it explicitly
  via a `single` / `multiple` wrapper) or downgrade the slider entry
  to drop `restProps` spreading.
- If the bits-ui upstream fix lands, the wrapper-free shadcn pattern
  works again.

## Follow-ups (post-PR-4, separate workstreams)

- After PR-4 ships, consider migrating the hardcoded per-theme OKLCH triples
  (`--primary-peak-plus-*`, `--primary-wheel-plus-*`) to CSS Color Module 5
  relative-color syntax (`oklch(from var(--primary) l c calc(h + N))`) once
  Safari 16.4 / Firefox 128 are comfortably below the support floor.
- Consider consolidating external-OCC enum-schema settings to inline-OCC once
  Formsnap field-binding tooling makes `$form.value` ergonomic for `z.enum`.
- Add a CI lint rule that fails on any reintroduction of `hsl(var(--*))` or
  `var(--primary-hue)` in `src/`.
- If the Playwright visual-regression suite is rejected, document the rejection
  here and switch to manual theme-rotation spot-checks as the de facto gate.

## US-019 admin sidebar shadcn migration — deferred

The v3 plan §B2 calls for migrating `src/routes/admin/+layout.svelte` from
its hand-rolled focus-trapped sidebar to the shadcn `Sidebar` primitive.
The migration was attempted in iteration 2 and **reverted** because the
shadcn `SidebarTrigger` uses `Button size="icon-sm"` (`h-8 w-8` = 32×32),
which is below the WCAG 2.5.5 Level AAA 44×44 tap-target floor that the
existing implementation explicitly fixed via the `--min-tap-size` token
(dogfood ISSUE-007).

The other a11y properties guarded by the source-pinned regression tests in
`tests/unit/admin/ui-source-regressions.test.ts` and
`tests/unit/dogfood-fixes.test.ts` (focus trap, inert closed sidebar,
client navigation wrapper) ARE preserved by bits-ui Dialog inside shadcn
Sheet, but the tests can't see them through the primitive boundary.

When resuming the migration:

1. ✅ DONE — `src/lib/components/ui/sidebar/sidebar-trigger.svelte` bakes
   `tap-target` into the cn() merge, so every Sidebar consumer hits the
   44×44 floor via `min-width`/`min-height: var(--min-tap-size)` while
   the icon stays visually at `size-7` (28×28).
2. Migrate the relevant source-pinned a11y assertions in
   `ui-source-regressions.test.ts` + `dogfood-fixes.test.ts` to behavioral
   assertions (render the layout in a test harness, query the computed
   style of the trigger and the inert/aria-hidden of the closed sidebar).
3. Then the shadcn primitive can land without losing the regression
   guards.

## US-022 prep — source-pinned test audit + tap-size follow-up

Once US-020's six nested-route UI extractions landed (commits 6603190
through 97152be), 12 source-pinned tests pointed at the old monolith
`src/routes/admin/settings/+page.svelte`:

- 9 in `tests/unit/admin/ui-source-regressions.test.ts` — disposition
  block at the top of the file documents which 5 get DELETED when US-022
  runs (features deferred from nested routes), which 3 RE-POINT to
  nested-route source paths, and which 1 needs the new state shape.
- 3 in `tests/unit/dogfood-fixes.test.ts` — 2 were already split into a
  separate `it()` that targets only `src/routes/admin/+layout.svelte`
  (still passing post-deletion). The 3rd specifically tests the
  monolith's `.tab-button` + `.input-action` tap-size floors and is
  marked "pending US-022 follow-up" with the rationale below.

### Tap-size follow-up before US-022 can land cleanly

The shadcn `Button` primitive used across the nested-route settings tabs
defaults to `h-9` (36×36) — that's below the WCAG 2.5.5 44×44 floor that
the monolith fixed via the `--min-tap-size` token + `.tap-target` class.
The dogfood ISSUE-007 regression test enforces the floor on the monolith
today; once the monolith goes, the nested route tabs need their own
guard. Two options:

1. **Add a `.size-11` or `class="min-h-[var(--min-tap-size)]"` override**
   on every interactive shadcn Button in the 6 nested route +page.svelte
   files. Mechanical; about 12 sites.
2. **Define a `tap-target` shadcn variant** in the project's `button`
   primitive so the floor is built-in and discoverable. Bigger change;
   ripples through any future Button consumer.

Either choice unblocks the dogfood ISSUE-007 regression test re-point.
Same blocker exists for US-019's SidebarTrigger (32×32 → 44×44 floor),
so a shared fix is the highest-leverage move.
