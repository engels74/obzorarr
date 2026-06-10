import { describe, expect, it } from 'bun:test';
import { deriveAiKeyMissingNotice } from '../../../src/routes/onboarding/complete/+page.server';

describe('deriveAiKeyMissingNotice (ISSUE-010 stale-notice reconciliation)', () => {
	it('shows the notice when fun facts were requested but no effective key exists', () => {
		// Toggle fun facts on, leave it on, no key -> Template mode + notice.
		expect(deriveAiKeyMissingNotice(false, true)).toBe('ai-key-missing');
	});

	it('suppresses the notice when an effective key exists, ignoring a stale param', () => {
		// Visiting ?notice=ai-key-missing with a valid key must not show the notice.
		expect(deriveAiKeyMissingNotice(true, true)).toBeNull();
	});

	it('shows nothing when fun facts were not requested (toggled off) and no key', () => {
		// Toggle on then off, save -> clean redirect, Disabled summary, no notice.
		expect(deriveAiKeyMissingNotice(false, false)).toBeNull();
	});

	it('shows nothing when a key exists and no notice was requested', () => {
		expect(deriveAiKeyMissingNotice(true, false)).toBeNull();
	});
});
