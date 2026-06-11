import { describe, expect, it } from 'bun:test';
import { join } from 'node:path';

// ISSUE-007 source-guard.
//
// The reverse-proxy diagnostic auto-runs on mount via a $effect; a success/error
// toast must fire ONLY when the user clicks "Re-run diagnostic", never on the
// silent on-mount run. The Bun suite has no DOM runner to observe toasts firing,
// so this guard pins the wiring in source: runDiagnostic is gated on a
// `userInitiated` flag, the re-run button passes `userInitiated: true`, and the
// on-mount $effect calls runDiagnostic with no args (so it defaults to false).

const PROJECT_ROOT = join(import.meta.dir, '..', '..', '..');
const SECURITY_PAGE = 'src/routes/admin/settings/security/+page.svelte';

async function readSource(relPath: string): Promise<string> {
	return Bun.file(join(PROJECT_ROOT, relPath)).text();
}

describe('ISSUE-007 — reverse-proxy diagnostic toast is user-initiated only', () => {
	it('imports the toast service', async () => {
		const src = await readSource(SECURITY_PAGE);
		expect(src).toContain("import { toast } from '$lib/services/toast'");
	});

	it('runDiagnostic accepts a userInitiated option defaulting to false', async () => {
		const src = await readSource(SECURITY_PAGE);
		expect(src).toMatch(/function runDiagnostic\(\s*\{\s*userInitiated\s*=\s*false/);
	});

	it('the re-run button passes userInitiated: true', async () => {
		const src = await readSource(SECURITY_PAGE);
		expect(src).toMatch(
			/onclick=\{\(\)\s*=>\s*runDiagnostic\(\s*\{\s*userInitiated:\s*true\s*\}\s*\)\}/
		);
	});

	it('the on-mount $effect calls runDiagnostic with NO args (stays silent)', async () => {
		const src = await readSource(SECURITY_PAGE);
		// The auto-run is `void runDiagnostic();` — no userInitiated argument, so it
		// defaults to false and never toasts.
		expect(src).toMatch(/void runDiagnostic\(\s*\);/);
		// And it must NOT pass userInitiated: true on the auto-run.
		expect(src).not.toMatch(/void runDiagnostic\(\s*\{\s*userInitiated:\s*true/);
	});

	it('every toast call is gated behind userInitiated', async () => {
		const src = await readSource(SECURITY_PAGE);
		// Each toast.success / toast.error in this file must be guarded by
		// `if (userInitiated)`; an ungated toast would fire on the on-mount run.
		const toastCalls = src.match(/toast\.(success|error)\(/g) ?? [];
		expect(toastCalls.length).toBeGreaterThan(0);
		const gatedToasts = src.match(/if \(userInitiated\) toast\.(success|error)\(/g) ?? [];
		expect(gatedToasts.length).toBe(toastCalls.length);
	});
});
