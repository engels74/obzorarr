import { describe, expect, it } from 'bun:test';
import {
	_deriveAiKeyMissingNotice,
	_deriveFunFactsSummary
} from '../../../src/routes/onboarding/complete/+page.server';

describe('_deriveAiKeyMissingNotice (ISSUE-010 stale-notice reconciliation)', () => {
	it('shows the notice when fun facts were requested but no effective key exists', () => {
		// Toggle fun facts on, leave it on, no key -> Template mode + notice.
		expect(_deriveAiKeyMissingNotice(false, true)).toBe('ai-key-missing');
	});

	it('suppresses the notice when an effective key exists, ignoring a stale param', () => {
		// Visiting ?notice=ai-key-missing with a valid key must not show the notice.
		expect(_deriveAiKeyMissingNotice(true, true)).toBeNull();
	});

	it('shows nothing when fun facts were not requested (toggled off) and no key', () => {
		// Toggle on then off, save -> clean redirect, Disabled summary, no notice.
		expect(_deriveAiKeyMissingNotice(false, false)).toBeNull();
	});

	it('shows nothing when a key exists and no notice was requested', () => {
		expect(_deriveAiKeyMissingNotice(true, false)).toBeNull();
	});
});

describe('_deriveFunFactsSummary (ISSUE-001 Done-page copy consistency)', () => {
	const frequency = { mode: 'balanced', count: 5 };

	it('shows the frequency label when an effective OpenAI key is present', () => {
		// Key present -> AI fun facts on; summary reflects the configured frequency.
		expect(_deriveFunFactsSummary(true, false, frequency)).toBe('Balanced (5)');
	});

	it('shows template mode when fun facts were enabled but no key was provided', () => {
		// No key + ai-key-missing notice -> built-in templates, not "Disabled".
		expect(_deriveFunFactsSummary(false, true, frequency)).toBe(
			'Template mode — add an OpenAI key to enable AI'
		);
	});

	it('shows Disabled when there is no key and fun facts were left off', () => {
		expect(_deriveFunFactsSummary(false, false, frequency)).toBe('Disabled');
	});
});
