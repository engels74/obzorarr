# ISSUE-007: Sequential integer user id in Wrapped URL

- Status: Accepted — mitigation (b), documented residual exposure. No code change.
- Date: 2026-06-07
- Finding: The owner/member Wrapped URL is `/wrapped/<year>/u/<userId>` where `<userId>` is a
  sequential integer (e.g. `/wrapped/2026/u/5`), so an authenticated member can infer the
  existence and rough registration order of other members by incrementing the id.

## Decision

Adopt **mitigation (b): accept the membership-gated, server-members-only exposure and document
it.** No schema change, no migration, no new identifier scheme. Existing private-link tokens are
untouched.

The committed behavior of `getOwnerWrappedHref` (`src/lib/server/sharing/service.ts`) already
implements this decision and is intentionally contract-locked by a test:

- **private-oauth (membership-gated)** → integer URL `/wrapped/<year>/u/<userId>`, no token
  minted. Members see the canonical integer page; they never receive a copyable token.
- **private-link** → opaque, rotating share-token URL only.
- See `tests/unit/sharing/wrapped-identifier-loader.test.ts` →
  *"getOwnerWrappedHref emits the integer URL (no token) for private-oauth and a token URL only
  for private-link"*.

## Rationale

1. **An opaque slug would duplicate the existing private-link token mechanism.** Private-link mode
   already provides opaque, rotating identifiers for the "share outside the membership" use case.
   Adding a second opaque scheme for the in-membership case forces slug→userId resolution into
   every `userId`-keyed call site (`sharing/service.ts`, `access-control.ts`), expanding blast
   radius for a low-severity exposure.
2. **The exposure is membership-gated, not public.** The numeric identifier path is protected by
   the uniform-404 anti-enumeration contract for anonymous callers (ISSUE-001 in the loader: an
   anonymous probe of a private id is byte-identical to a probe of a non-existent id, so the id
   space cannot be enumerated without a valid session). The residual inference is only available
   to authenticated server members.
3. **No migration risk.** Existing tokens and URLs keep working; no data backfill.

## Reconciliation note (working-tree deviation reverted)

A pre-existing uncommitted edit had broadened `getOwnerWrappedHref` to **always** emit the opaque
token (for PUBLIC and PRIVATE_OAUTH too). That change was **reverted** during this remediation
because it:

- contradicted the plan's chosen mitigation (b), and
- broke the intentional, tested contract above (the integer URL for private-oauth, token only for
  private-link), and
- destabilized the SEO canonical URL for PUBLIC wrappeds (a rotating token as the canonical URL),
  for no privacy benefit in the PUBLIC case.

The integer-for-members / token-for-link split is the deliberate design; it stands.

## Consequences

- Low-severity, membership-gated id inference is accepted as a known residual.
- Private-link sharing remains the opaque/rotating path for external sharing.
- If a future requirement raises the severity (e.g. opening membership to untrusted users), revisit
  with a single opaque-identifier scheme rather than layering a second token type.
