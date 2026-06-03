import { describe, expect, it } from 'bun:test';
import { join } from 'node:path';

/**
 * ISSUE-003 (verified resolved): the onboarding Configure step must walk all
 * four substeps — Appearance -> Privacy -> Slides -> AI — before the
 * `saveSettings` action can fire. The reported "Privacy -> complete" jump was
 * traced to the separate "Skip setup" (`skipSettings`) action / substep-dot
 * navigation, NOT the linear "Next" path, which is monotonic and only exposes
 * the Save submit button on the last substep.
 *
 * These are behavior-pinning source assertions (same read-source pattern as
 * tests/unit/sharing/presets.test.ts and csrf-page-source.test.ts). They lock
 * the structure so a future refactor cannot silently let `saveSettings` become
 * reachable before the AI substep.
 */

const pageSourcePath = join(
	import.meta.dir,
	'..',
	'..',
	'..',
	'src/routes/onboarding/settings/+page.svelte'
);

async function readPageSource(): Promise<string> {
	return Bun.file(pageSourcePath).text();
}

describe('onboarding settings substep walk (ISSUE-003)', () => {
	it('declares the four substeps in order: appearance -> privacy -> slides -> ai', async () => {
		const src = await readPageSource();
		const ids = [...src.matchAll(/id:\s*'(appearance|privacy|slides|ai)'/g)].map((m) => m[1]);
		expect(ids).toEqual(['appearance', 'privacy', 'slides', 'ai']);
	});

	it('only renders the saveSettings submit button when on the last substep', async () => {
		const src = await readPageSource();
		// The footer Next/Save control is gated: the Save & Continue SubmitButton
		// (submits the ?/saveSettings form) appears only behind {#if isLastSubStep};
		// the non-last branch is a plain type="button" Next control.
		const footerGate = src.match(/\{#if isLastSubStep\}([\s\S]*?)\{:else\}([\s\S]*?)\{\/if\}/);
		expect(footerGate).not.toBeNull();
		const ifBranch = footerGate?.[1] ?? '';
		const elseBranch = footerGate?.[2] ?? '';
		// Only the last-step branch carries the Save submit control.
		expect(ifBranch).toContain('Save & Continue');
		// The non-last branch advances via nextSubStep and cannot submit the form.
		expect(elseBranch).toContain('onclick={nextSubStep}');
		expect(elseBranch).not.toContain('Save & Continue');
	});

	it('isLastSubStep resolves to the final substep index, not Privacy', async () => {
		const src = await readPageSource();
		expect(src).toContain('let isLastSubStep = $derived(currentSubStep === totalSubSteps - 1);');
	});

	it('nextSubStep advances at most one step and never skips to completion', async () => {
		const src = await readPageSource();
		// Monotonic single-step increment, bounded by totalSubSteps - 1.
		expect(src).toMatch(
			/function nextSubStep\(\)\s*\{[\s\S]*?currentSubStep < totalSubSteps - 1[\s\S]*?currentSubStep \+= 1;[\s\S]*?\}/
		);
		// Next never triggers a navigation/redirect or the save action directly.
		const nextFn = src.match(/function nextSubStep\(\)\s*\{[\s\S]*?\n\t\}/)?.[0] ?? '';
		expect(nextFn).not.toContain('saveSettings');
		expect(nextFn).not.toContain('goto');
	});

	it('the saveSettings form lives on the configure step, not auto-submitted from Privacy', async () => {
		const src = await readPageSource();
		// The form uses use:enhance and only submits via an explicit submit control
		// (the gated Save button or the visually-hidden submit), never on substep change.
		expect(src).toContain('action="?/saveSettings"');
		// No $effect / reactive block calls the form's requestSubmit on currentSubStep change.
		expect(src).not.toMatch(/requestSubmit\s*\(/);
	});
});
