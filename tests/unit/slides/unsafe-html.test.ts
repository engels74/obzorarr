import { describe, expect, it } from 'bun:test';
import { containsUnsafeHtml, detectUnsafeHtml } from '$lib/server/slides/renderer';

/**
 * ISSUE-006 (dogfood 2026-06-04) — branch-specific XSS rejection messages.
 *
 * detectUnsafeHtml keeps the exact same four detection branches (same regexes,
 * same order) as the old boolean guard — detection strength is unchanged — but
 * each branch now returns an actionable, non-leaky reason that renders inline
 * under the slide content field. These tests pin one reason per branch and that
 * safe markdown still passes.
 */
describe('detectUnsafeHtml — branch-specific reasons', () => {
	it('flags <script> tags with a script-specific message', () => {
		const result = detectUnsafeHtml('<script>alert(1)</script>');
		expect(result.unsafe).toBe(true);
		if (result.unsafe) {
			expect(result.reason).toContain('<script>');
		}
	});

	it('flags inline event handlers with an event-handler message', () => {
		const result = detectUnsafeHtml('<img src="x" onerror="alert(1)" />');
		expect(result.unsafe).toBe(true);
		if (result.unsafe) {
			expect(result.reason.toLowerCase()).toContain('event handler');
		}
	});

	it('flags javascript: URLs with a javascript-url message', () => {
		const result = detectUnsafeHtml('[click](javascript:alert(1))');
		expect(result.unsafe).toBe(true);
		if (result.unsafe) {
			expect(result.reason).toContain('javascript:');
		}
	});

	it('flags base64-embedded scripts with a base64 message', () => {
		// No closing ">" after <script, so the first <script[^>]*> branch does NOT
		// match — this isolates the data:...;base64...<script branch.
		const result = detectUnsafeHtml('data:text/html;base64,QUJD<script');
		expect(result.unsafe).toBe(true);
		if (result.unsafe) {
			expect(result.reason.toLowerCase()).toContain('base64');
		}
	});

	it('returns the script reason when multiple patterns are present (first branch wins)', () => {
		const result = detectUnsafeHtml('<script>x</script><img onerror="y">');
		expect(result.unsafe).toBe(true);
		if (result.unsafe) {
			expect(result.reason).toContain('<script>');
		}
	});

	it('passes safe markdown / plain HTML through', () => {
		for (const safe of [
			'# Heading',
			'**bold** and _italic_ text',
			'[a link](https://example.com)',
			'<p>A paragraph with <strong>emphasis</strong>.</p>',
			'A sentence mentioning the word javascript without a colon.'
		]) {
			expect(detectUnsafeHtml(safe)).toEqual({ unsafe: false });
		}
	});
});

describe('containsUnsafeHtml — thin boolean wrapper preserved', () => {
	it('mirrors detectUnsafeHtml().unsafe', () => {
		expect(containsUnsafeHtml('<script>alert(1)</script>')).toBe(true);
		expect(containsUnsafeHtml('<img onerror="x">')).toBe(true);
		expect(containsUnsafeHtml('plain safe text')).toBe(false);
	});
});
