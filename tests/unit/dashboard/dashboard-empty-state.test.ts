import { describe, expect, it } from 'bun:test';
import { join } from 'node:path';

// Source guards for dashboard empty-state invariants (ISSUE-003, ISSUE-004).
// Pins the subtitle gate and the no-data personal-card affordance so regressions
// cannot silently reintroduce the unconditional "ready to explore" subtitle or
// a link-bearing no-data card that would hit the ISSUE-001 incident class.

const PROJECT_ROOT = join(import.meta.dir, '..', '..', '..');

async function readSource(relPath: string): Promise<string> {
	return Bun.file(join(PROJECT_ROOT, relPath)).text();
}

const DASHBOARD_PAGE = 'src/routes/dashboard/+page.svelte';

describe('ISSUE-003 source-guard — dashboard subtitle is data-aware', () => {
	it('subtitle "ready to explore" only appears inside the {#if data.wrappedHref} branch', async () => {
		const src = await readSource(DASHBOARD_PAGE);
		// The entire truthy branch must contain the "ready to explore" copy.
		const ifIdx = src.indexOf('{#if data.wrappedHref}');
		expect(ifIdx).toBeGreaterThan(-1);
		const elseIdx = src.indexOf('{:else}', ifIdx);
		expect(elseIdx).toBeGreaterThan(ifIdx);
		const truthyBranch = src.slice(ifIdx, elseIdx);
		expect(truthyBranch).toContain('ready to explore');
		// The "ready to explore" copy must NOT appear outside the truthy branch.
		// Everything before the first {#if data.wrappedHref} must not have it.
		const beforeIf = src.slice(0, ifIdx);
		expect(beforeIf).not.toContain('ready to explore');
	});

	it('{:else} branch contains the empty-state subtitle copy', async () => {
		const src = await readSource(DASHBOARD_PAGE);
		// Find the subtitle {#if}/{:else} gate (the first else after the subtitle if).
		const subtitleIfIdx = src.indexOf('{#if data.wrappedHref}');
		expect(subtitleIfIdx).toBeGreaterThan(-1);
		const subtitleElseIdx = src.indexOf('{:else}', subtitleIfIdx);
		expect(subtitleElseIdx).toBeGreaterThan(subtitleIfIdx);
		const subtitleEndIfIdx = src.indexOf('{/if}', subtitleElseIdx);
		expect(subtitleEndIfIdx).toBeGreaterThan(subtitleElseIdx);
		const elseBranch = src.slice(subtitleElseIdx, subtitleEndIfIdx);
		// The else branch must contain the empty-state subtitle text.
		expect(elseBranch).toContain('viewing history synced yet');
		expect(elseBranch).toContain('Wrapped will appear here');
		// The "ready to explore" copy must NOT leak into the else branch.
		expect(elseBranch).not.toContain('ready to explore');
	});
});

describe('ISSUE-004 source-guard — dashboard personal-card empty-state affordance', () => {
	it('the {#if data.wrappedHref} personal-card block has an {:else} branch', async () => {
		const src = await readSource(DASHBOARD_PAGE);
		// Find the card-area conditional (after the subtitle conditional).
		// We look for the <a href={data.wrappedHref} live link to anchor ourselves.
		const liveCardIdx = src.indexOf('<a href={data.wrappedHref}');
		expect(liveCardIdx).toBeGreaterThan(-1);
		// Walk back to find the enclosing {#if data.wrappedHref}.
		const before = src.slice(0, liveCardIdx);
		const cardIfIdx = before.lastIndexOf('{#if data.wrappedHref}');
		expect(cardIfIdx).toBeGreaterThan(-1);
		// After the live card block there must be an {:else} branch.
		const afterCardIf = src.slice(cardIfIdx);
		const elseIdx = afterCardIf.indexOf('{:else}');
		expect(elseIdx).toBeGreaterThan(-1);
		const endIfIdx = afterCardIf.indexOf('{/if}', elseIdx);
		expect(endIfIdx).toBeGreaterThan(elseIdx);
	});

	it('the no-data personal-card {:else} branch renders a <div>, not an <a>', async () => {
		const src = await readSource(DASHBOARD_PAGE);
		const liveCardIdx = src.indexOf('<a href={data.wrappedHref}');
		const before = src.slice(0, liveCardIdx);
		const cardIfIdx = before.lastIndexOf('{#if data.wrappedHref}');
		const afterCardIf = src.slice(cardIfIdx);
		const elseIdx = afterCardIf.indexOf('{:else}');
		const endIfIdx = afterCardIf.indexOf('{/if}', elseIdx);
		const elseBranch = afterCardIf.slice(elseIdx, endIfIdx);
		// The else branch must open with a <div …> element (non-anchor).
		expect(elseBranch).toContain('<div class="wrapped-card personal empty">');
		// The else branch must NOT contain an <a> element.
		expect(elseBranch).not.toMatch(/<a\s/);
	});

	it('the no-data personal-card {:else} branch contains NO /u/ personal-wrapped href', async () => {
		const src = await readSource(DASHBOARD_PAGE);
		const liveCardIdx = src.indexOf('<a href={data.wrappedHref}');
		const before = src.slice(0, liveCardIdx);
		const cardIfIdx = before.lastIndexOf('{#if data.wrappedHref}');
		const afterCardIf = src.slice(cardIfIdx);
		const elseIdx = afterCardIf.indexOf('{:else}');
		const endIfIdx = afterCardIf.indexOf('{/if}', elseIdx);
		const elseBranch = afterCardIf.slice(elseIdx, endIfIdx);
		// No /u/ path (personal wrapped slug) may appear in the else branch.
		expect(elseBranch).not.toContain('/u/');
		// No href={data.wrappedHref} may appear in the else branch.
		expect(elseBranch).not.toContain('href={data.wrappedHref}');
	});

	it('the data-having branch still contains the live personal-wrapped <a href={data.wrappedHref}>', async () => {
		const src = await readSource(DASHBOARD_PAGE);
		// The live link must still exist in the file.
		expect(src).toContain('<a href={data.wrappedHref}');
		// And it must appear before the {:else} of the card conditional.
		const liveCardIdx = src.indexOf('<a href={data.wrappedHref}');
		const before = src.slice(0, liveCardIdx);
		const cardIfIdx = before.lastIndexOf('{#if data.wrappedHref}');
		const afterCardIf = src.slice(cardIfIdx);
		const elseIdx = afterCardIf.indexOf('{:else}');
		// The live card anchor must appear before the else.
		expect(liveCardIdx).toBeLessThan(cardIfIdx + elseIdx);
	});
});
