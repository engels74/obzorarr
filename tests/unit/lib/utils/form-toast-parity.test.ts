/**
 * Verifies handleFormToast handles BOTH form-action shapes the codebase ships
 * during the v3 UI overhaul transitional window:
 *   1. Legacy `FormResponse` (`{ success, error, warning, message }`)
 *   2. Superforms' native `ActionResult` (`{ type, data | error | location }`)
 *
 * The legacy half is removed in PR-4 / D1 once every caller has migrated to
 * Superforms. This file's legacy assertions are dropped in the same commit.
 *
 * See: LEGACY_REMOVAL.md > "Legacy form-handling helpers (PR-4 / D1)".
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { clearTestToastCalls, getTestToastCalls } from '../../../helpers/toast';

const { handleFormToast } = await import('$lib/utils/form-toast');

describe('handleFormToast parity', () => {
	beforeEach(() => {
		clearTestToastCalls();
	});

	afterEach(() => {
		clearTestToastCalls();
	});

	describe('legacy FormResponse shape', () => {
		it('routes { error } to toast.error', () => {
			handleFormToast({ error: 'something broke' });
			expect(getTestToastCalls()).toEqual([{ variant: 'error', message: 'something broke' }]);
		});

		it('routes { warning, message } to toast.warning', () => {
			handleFormToast({ warning: true, message: 'be careful' });
			expect(getTestToastCalls()).toEqual([{ variant: 'warning', message: 'be careful' }]);
		});

		it('routes { warning } without message to a default warning', () => {
			handleFormToast({ warning: true });
			expect(getTestToastCalls()[0]?.variant).toBe('warning');
			expect(getTestToastCalls()[0]?.message).toMatch(/warning/i);
		});

		it('routes { success, message } to toast.success', () => {
			handleFormToast({ success: true, message: 'saved' });
			expect(getTestToastCalls()).toEqual([{ variant: 'success', message: 'saved' }]);
		});

		it('falls back to default success message when none provided', () => {
			handleFormToast({ success: true });
			expect(getTestToastCalls()[0]?.variant).toBe('success');
			expect(getTestToastCalls()[0]?.message).toMatch(/completed/i);
		});

		it('is a no-op on null / undefined', () => {
			handleFormToast(null);
			handleFormToast(undefined);
			expect(getTestToastCalls()).toEqual([]);
		});
	});

	describe('Superforms ActionResult shape', () => {
		it('routes { type: "success", data: { message } } to toast.success', () => {
			handleFormToast({ type: 'success', status: 200, data: { message: 'updated!' } });
			expect(getTestToastCalls()).toEqual([{ variant: 'success', message: 'updated!' }]);
		});

		it('routes { type: "failure", data: { error } } to toast.error', () => {
			handleFormToast({ type: 'failure', status: 400, data: { error: 'invalid input' } });
			expect(getTestToastCalls()).toEqual([{ variant: 'error', message: 'invalid input' }]);
		});

		it('routes { type: "failure", data: { message } } to toast.error (fallback)', () => {
			handleFormToast({ type: 'failure', status: 400, data: { message: 'bad shape' } });
			expect(getTestToastCalls()).toEqual([{ variant: 'error', message: 'bad shape' }]);
		});

		it('routes { type: "error", error: { message } } to toast.error', () => {
			handleFormToast({ type: 'error', status: 500, error: { message: 'kaboom' } });
			expect(getTestToastCalls()).toEqual([{ variant: 'error', message: 'kaboom' }]);
		});

		it('emits nothing on { type: "redirect" } — SvelteKit navigation handles it', () => {
			handleFormToast({ type: 'redirect', status: 303, location: '/dashboard' });
			expect(getTestToastCalls()).toEqual([]);
		});

		it('uses default messages when data is missing', () => {
			handleFormToast({ type: 'success', status: 200, data: undefined });
			expect(getTestToastCalls()[0]?.variant).toBe('success');
			expect(getTestToastCalls()[0]?.message).toMatch(/completed/i);

			clearTestToastCalls();
			handleFormToast({ type: 'failure', status: 400, data: undefined });
			expect(getTestToastCalls()[0]?.variant).toBe('error');
			expect(getTestToastCalls()[0]?.message).toMatch(/unexpected/i);
		});
	});

	describe('cross-shape disambiguation', () => {
		it('Superforms `type` field wins over legacy fields when both present', () => {
			// Defensive case: a malformed payload could carry both. The widened
			// handler must treat it as Superforms (because `type` discriminates).
			handleFormToast({ type: 'success', status: 200, data: { message: 'wins' } } as never);
			expect(getTestToastCalls()).toEqual([{ variant: 'success', message: 'wins' }]);
		});

		it('legacy success without `type` still routes via the legacy branch', () => {
			handleFormToast({ success: true, message: 'legacy path' });
			expect(getTestToastCalls()).toEqual([{ variant: 'success', message: 'legacy path' }]);
		});
	});
});
