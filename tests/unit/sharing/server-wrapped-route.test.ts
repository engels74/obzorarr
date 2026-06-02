import { beforeEach, describe, expect, it } from 'bun:test';
import { isHttpError } from '@sveltejs/kit';
import { db } from '$lib/server/db/client';
import { appSettings } from '$lib/server/db/schema';
import { setServerWrappedShareMode } from '$lib/server/sharing/service';
import { ShareMode } from '$lib/server/sharing/types';
// Post-US-022: re-pointed to the nested Privacy route. The
// updateServerWrappedSettings handler is byte-identical between the deleted
// monolith and the privacy/+page.server.ts copy (commit 853561f).
import { actions as adminSettingsActions } from '../../../src/routes/admin/settings/privacy/+page.server';
import { load } from '../../../src/routes/wrapped/[year]/+page.server';

type ServerWrappedLoad = typeof load;
type UpdateServerWrappedSettingsAction = NonNullable<
	typeof adminSettingsActions.updateServerWrappedSettings
>;

/** Helper: build a minimal parent() that satisfies the year guard. */
function makeParent(availableYears: number[]) {
	return async () => ({
		availableYears,
		wrappedTheme: 'default',
		syncStatus: null,
		lookupSyncTriggered: false
	});
}

describe('server wrapped route access', () => {
	beforeEach(async () => {
		await db.delete(appSettings);
	});

	it('denies anonymous route loads when server wrapped mode is private-oauth', async () => {
		await setServerWrappedShareMode(ShareMode.PRIVATE_OAUTH);

		try {
			await load({
				params: { year: '2024' },
				locals: {},
				parent: makeParent([2024]),
				url: new URL('http://localhost/wrapped/2024'),
				setHeaders: () => {}
			} as unknown as Parameters<ServerWrappedLoad>[0]);
			expect.unreachable('Expected server wrapped load to throw');
		} catch (error) {
			expect(isHttpError(error)).toBe(true);
			if (!isHttpError(error)) throw error;
			expect(error.status).toBe(403);
			expect(error.body.message).toContain('Sign in');
		}
	});

	it('sets no-store cache control on server wrapped loads', async () => {
		await setServerWrappedShareMode(ShareMode.PRIVATE_OAUTH);
		const headers: Record<string, string> = {};

		try {
			await load({
				params: { year: '2024' },
				locals: {},
				parent: makeParent([2024]),
				url: new URL('http://localhost/wrapped/2024'),
				setHeaders: (values: Record<string, string>) => Object.assign(headers, values)
			} as unknown as Parameters<ServerWrappedLoad>[0]);
			expect.unreachable('Expected server wrapped load to throw');
		} catch (error) {
			expect(isHttpError(error)).toBe(true);
		}

		expect(headers['cache-control']).toBe('no-store');
	});

	it('denies anonymous loads after admin saves server wrapped as private-oauth', async () => {
		const formData = new FormData();
		formData.set('anonymizationMode', 'real');
		formData.set('serverWrappedShareMode', ShareMode.PRIVATE_OAUTH);
		formData.set('settingsVersion', new Date(0).toISOString());
		const request = new Request('https://obzorarr.example/admin/settings', {
			method: 'POST',
			body: formData
		});
		const updateServerWrappedSettings =
			adminSettingsActions.updateServerWrappedSettings as UpdateServerWrappedSettingsAction;

		const result = await updateServerWrappedSettings({
			request,
			locals: {
				user: { id: 1, plexId: 100001, username: 'admin', isAdmin: true }
			}
		} as Parameters<UpdateServerWrappedSettingsAction>[0]);
		expect(result).toMatchObject({ success: true });

		try {
			await load({
				params: { year: '2024' },
				locals: {},
				parent: makeParent([2024]),
				url: new URL('http://localhost/wrapped/2024'),
				setHeaders: () => {}
			} as unknown as Parameters<ServerWrappedLoad>[0]);
			expect.unreachable('Expected server wrapped load to throw after settings update');
		} catch (error) {
			expect(isHttpError(error)).toBe(true);
			if (!isHttpError(error)) throw error;
			expect(error.status).toBe(403);
		}
	});
});

describe('server wrapped route year guard (ISSUE-009, ISSUE-018)', () => {
	beforeEach(async () => {
		await db.delete(appSettings);
	});

	it('returns 404 for a future year not in availableYears (ISSUE-018)', async () => {
		try {
			await load({
				params: { year: '2099' },
				locals: {},
				parent: makeParent([2026]),
				url: new URL('http://localhost/wrapped/2099'),
				setHeaders: () => {}
			} as unknown as Parameters<ServerWrappedLoad>[0]);
			expect.unreachable('Expected 404 for future year');
		} catch (err) {
			expect(isHttpError(err)).toBe(true);
			if (!isHttpError(err)) throw err;
			expect(err.status).toBe(404);
		}
	});

	it('returns 404 for an empty past year not in availableYears (ISSUE-009)', async () => {
		// availableYears = [2026], year 2025 has no data → must 404
		const currentYear = new Date().getFullYear();
		const emptyPastYear = currentYear - 1;
		try {
			await load({
				params: { year: String(emptyPastYear) },
				locals: {},
				parent: makeParent([currentYear]),
				url: new URL(`http://localhost/wrapped/${emptyPastYear}`),
				setHeaders: () => {}
			} as unknown as Parameters<ServerWrappedLoad>[0]);
			expect.unreachable('Expected 404 for empty past year');
		} catch (err) {
			expect(isHttpError(err)).toBe(true);
			if (!isHttpError(err)) throw err;
			expect(err.status).toBe(404);
		}
	});

	it('throws the exact "No data found for this year" 404 message (FIX-2 +error.svelte contract)', async () => {
		// The route-scoped wrapped/[year]/+error.svelte detects this exact message
		// to render its friendly empty-state. Lock the string so the boundary copy
		// and the thrown error can never silently drift apart.
		const currentYear = new Date().getFullYear();
		const emptyPastYear = currentYear - 1;
		try {
			await load({
				params: { year: String(emptyPastYear) },
				locals: {},
				parent: makeParent([currentYear]),
				url: new URL(`http://localhost/wrapped/${emptyPastYear}`),
				setHeaders: () => {}
			} as unknown as Parameters<ServerWrappedLoad>[0]);
			expect.unreachable('Expected 404 for empty past year');
		} catch (err) {
			expect(isHttpError(err)).toBe(true);
			if (!isHttpError(err)) throw err;
			expect(err.status).toBe(404);
			expect(err.body.message).toBe('No data found for this year');
		}
	});

	it('does not 404 for the current year even when not yet in availableYears (pre-first-sync)', async () => {
		// Current year with no data yet should reach the access-control check,
		// not be blocked by the year guard. Since no access restriction is set,
		// the load will proceed past the guard (and may throw for other reasons
		// such as missing stats, but NOT a 404 from the year guard).
		const currentYear = new Date().getFullYear();
		try {
			await load({
				params: { year: String(currentYear) },
				locals: {},
				parent: makeParent([]), // empty — no data synced yet
				url: new URL(`http://localhost/wrapped/${currentYear}`),
				setHeaders: () => {}
			} as unknown as Parameters<ServerWrappedLoad>[0]);
			// If load somehow succeeds, that's also fine for this guard test
		} catch (err) {
			expect(isHttpError(err)).toBe(true);
			if (!isHttpError(err)) throw err;
			// Must NOT be blocked by the year guard (404 "No data found for this year")
			expect(err.body.message).not.toBe('No data found for this year');
		}
	});

	it('does not 404 for a year present in availableYears', async () => {
		// A year with actual data should pass the guard and reach access-control.
		// Expect either success or a non-year-guard error (e.g. 403 from access control).
		try {
			await load({
				params: { year: '2026' },
				locals: {},
				parent: makeParent([2026]),
				url: new URL('http://localhost/wrapped/2026'),
				setHeaders: () => {}
			} as unknown as Parameters<ServerWrappedLoad>[0]);
		} catch (err) {
			expect(isHttpError(err)).toBe(true);
			if (!isHttpError(err)) throw err;
			// Must NOT be a year-guard 404
			expect(err.body.message).not.toBe('No data found for this year');
		}
	});
});
