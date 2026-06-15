import type { ActionResult } from '@sveltejs/kit';
import { toast } from '$lib/services/toast';

/**
 * Sentinel matching the server's `OCC_CONFLICT_CODE`
 * (`$lib/server/admin/occ-helpers`). That constant is a SERVER-ONLY export, so
 * client code cannot import it — the literal is inlined here instead. Keep the
 * two in lockstep if the sentinel ever changes.
 */
const OCC_CONFLICT_CODE = '__OCC_CONFLICT__';

/**
 * Dual-shape optimistic-concurrency conflict predicate for superForm pages.
 *
 * Two conflict payload shapes exist in the codebase:
 *   - INLINE OCC (`system`, `privacy`): `fail(409, { conflict: true, error })`.
 *   - EXTERNAL OCC (`appearance`'s `z.enum` actions): `fail(409, { error,
 *     code: '__OCC_CONFLICT__' })` — no `conflict` field.
 *
 * The required fix (ISSUE-006) only needs the `conflict` branch, but accepting
 * the `code` branch too is cheap forward-insurance: if a raw-enhance page is
 * ever migrated to superForm and reuses an external-OCC action, this predicate
 * already covers it.
 */
export function isOccConflict(data: unknown): boolean {
	const d = data as { conflict?: boolean; code?: string } | undefined;
	return d?.conflict === true || d?.code === OCC_CONFLICT_CODE;
}

/**
 * superForm `onUpdate` guard for OCC stale-writes.
 *
 * An OCC stale-write returns `fail(409, { form, conflict, error })` AFTER
 * validation, so the returned `form` is still `valid` — `onUpdated` would
 * otherwise fire a false "Saved" success toast while the write was actually
 * discarded (ISSUE-006). Detect the conflict here, surface the server's reload
 * message, and `cancel()` so the success path never runs and the stale
 * settingsVersion stays put for the next reload.
 */
export function surfaceOccConflict(event: { result: ActionResult; cancel: () => void }): void {
	const { result } = event;
	if (result.type === 'failure' && isOccConflict(result.data)) {
		const message =
			(result.data as { error?: string } | undefined)?.error ??
			'Settings changed in another tab. Please reload.';
		toast.error(message, { action: { label: 'Reload', onClick: () => window.location.reload() } });
		event.cancel();
	}
}
