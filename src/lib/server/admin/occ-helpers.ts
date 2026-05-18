import { getAppSettingsUpdatedAt } from './settings.service';

/**
 * External OCC check used by the top-level `z.enum` actions
 * (`updateUITheme`, `updateWrappedTheme`, `updateWrappedLogoMode`) where
 * wrapping the schema in `z.object({...})` to carry an inline
 * `settingsVersion` would change the payload shape. Per v3 plan §A5
 * Table D2.
 *
 * Returns `{ status: 'ok' }` to proceed, or
 * `{ status: 'conflict', current: <ISO> }` to short-circuit the action
 * with `fail(409, { error: '__OCC_CONFLICT__', settingsVersion: current })`.
 *
 * Treats blank/missing `submittedVersion` and unparseable timestamps as
 * stale — defends against the fresh-install loophole where the row-count
 * gate would otherwise silently skip OCC.
 */
export async function externalOccCheck(
	submittedVersion: string,
	keys: readonly string[]
): Promise<{ status: 'ok' } | { status: 'conflict'; current: string }> {
	if (!submittedVersion) {
		return { status: 'conflict', current: new Date(0).toISOString() };
	}
	const currentUpdatedAt = await getAppSettingsUpdatedAt(keys);
	const currentMs = currentUpdatedAt?.getTime() ?? 0;
	const submittedMs = Date.parse(submittedVersion);
	if (Number.isNaN(submittedMs) || submittedMs < currentMs) {
		return {
			status: 'conflict',
			current: currentUpdatedAt?.toISOString() ?? new Date(0).toISOString()
		};
	}
	return { status: 'ok' };
}
