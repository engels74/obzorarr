# Legacy Removal TODO — scheduled for PR-4 of the v3 UI overhaul

> **Resumption note (iteration 1 stopped 2026-05-18).** The v3 plan at
> `~/.claude/plans/i-set-you-to-vectorized-sutton-v3.md` is partially
> executed on this branch: 15 of 34 user stories closed across 8 commits
> (see `git log feat/ui-overhaul-pr1`), with all 4 verification gates
> green (check + lint + test 1794 pass + build + tweakcn-drift).
>
> **PR-1 foundation is mergeable as-is.** Remaining 19 stories
> (US-009b, US-012, US-013, US-015, US-018-034) are blocked by either
> the PR-2 settings split (~2500 LOC redesign rooted in the 4779-line
> monolith at `src/routes/admin/settings/+page.svelte`), the absence of
> Playwright browser binaries (~700MB, run `bunx playwright install`
> first), or consumers that don't exist until PR-2 lands.
>
> **To resume**: run
> `/oh-my-claudecode:ralph execute the plan at ~/.claude/plans/i-set-you-to-vectorized-sutton-v3.md`
> in a fresh session. Recommended next pick: US-018+US-019 (admin shell
> + settings nested routes). The shadcn Sidebar primitive is
> pre-installed and the OCC strategy JSDoc map at the head of
> `src/routes/admin/settings/+page.server.ts` (commit 340c4c2) tells
> US-020 exactly which schemas get inline vs external OCC plumbing.


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
