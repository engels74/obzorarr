import { describe, expect, it } from 'bun:test';
import { join } from 'node:path';

// ISSUE-003 lock-in source-guard.
//
// The dashboard settings page must prevent double-submits. The verified,
// already-correct wiring is:
//   - a SINGLE shared `let isUpdating = $state(false)` gates BOTH the share-mode
//     form and the logo form (each enhance callback early-outs with
//     `if (isUpdating) { cancel(); ... }` and re-enables in a finally);
//   - a SEPARATE `let isRegenerating = $state(false)` gates the regenerate-token
//     form the same way;
//   - the submit buttons carry `disabled` bindings on those flags.
//
// IMPORTANT (intended coupling, locked in here): because share-mode and logo
// share ONE `isUpdating`, submitting one disables BOTH simultaneously. That is
// the current, intended behavior this test freezes — NOT per-form isolation. If
// independent in-flight state per form is ever wanted, that is a separate change
// (see .omc/plans/open-questions.md), and this test should be updated then.

const PROJECT_ROOT = join(import.meta.dir, '..', '..', '..');
const SETTINGS_PAGE = 'src/routes/dashboard/settings/+page.svelte';

async function readSource(relPath: string): Promise<string> {
	return Bun.file(join(PROJECT_ROOT, relPath)).text();
}

describe('ISSUE-003 — dashboard settings double-submit guard (lock-in)', () => {
	it('declares exactly one shared isUpdating state', async () => {
		const src = await readSource(SETTINGS_PAGE);
		const matches = src.match(/let isUpdating = \$state\(false\)/g) ?? [];
		expect(matches.length).toBe(1);
	});

	it('gates both the share-mode and logo enhance callbacks on the shared isUpdating', async () => {
		const src = await readSource(SETTINGS_PAGE);
		// Two early-outs reference the SAME shared flag (one per form).
		const earlyOuts = src.match(/if \(isUpdating\) \{\s*cancel\(\);/g) ?? [];
		expect(earlyOuts.length).toBe(2);
	});

	it('gates the regenerate form on a separate isRegenerating state', async () => {
		const src = await readSource(SETTINGS_PAGE);
		expect(src).toMatch(/let isRegenerating = \$state\(false\)/);
		expect(src).toMatch(/if \(isRegenerating\) \{\s*cancel\(\);/);
	});

	it('disables the submit buttons on the in-flight flags', async () => {
		const src = await readSource(SETTINGS_PAGE);
		// Share-mode save (also gated by the floor check) + logo save reference isUpdating.
		expect(src).toMatch(/disabled=\{isUpdating \|\| isSelectedModeBelowFloor\}/);
		expect(src).toMatch(/disabled=\{isUpdating\}/);
		// Regenerate-token confirm button references isRegenerating.
		expect(src).toMatch(/disabled=\{isRegenerating\}/);
	});
});
