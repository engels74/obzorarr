import { describe, expect, it, mock } from 'bun:test';

// NOTE: deliberately does NOT mock `$lib/server/auth/session`. bun's
// `mock.module` is process-global and leaks across test files, so replacing the
// whole session module here would break every other test that imports
// `createSessionFromPlexToken` etc. We assert the observable cookie behavior
// instead; `invalidateSession` runs for real against the empty in-memory
// sessions table (a harmless no-op for an unknown id).
const { load, actions } = await import('../../../src/routes/auth/logout/+page.server');

interface FakeCookies {
	get: (name: string) => string | undefined;
	delete: ReturnType<typeof mock>;
}

function makeCookies(sessionId: string | undefined): FakeCookies {
	return {
		get: () => sessionId,
		delete: mock(() => {})
	};
}

function isRedirect(thrown: unknown): thrown is { status: number; location: string } {
	return (
		typeof thrown === 'object' && thrown !== null && 'status' in thrown && 'location' in thrown
	);
}

describe('logout route — POST-only (ISSUE-024)', () => {
	it('GET load redirects to / WITHOUT clearing the session cookie', async () => {
		const cookies = makeCookies('session-abc');

		let thrown: unknown;
		try {
			await (load as unknown as (e: unknown) => Promise<unknown>)({ cookies });
		} catch (e) {
			thrown = e;
		}

		expect(isRedirect(thrown)).toBe(true);
		if (isRedirect(thrown)) {
			expect(thrown.status).toBe(303);
			expect(thrown.location).toBe('/');
		}

		// The GET path must not mutate — no session cookie cleared.
		expect(cookies.delete).not.toHaveBeenCalled();
	});

	it('POST action clears the session cookie and redirects to /', async () => {
		const cookies = makeCookies('session-abc');

		let thrown: unknown;
		try {
			await (actions.default as unknown as (e: unknown) => Promise<unknown>)({ cookies });
		} catch (e) {
			thrown = e;
		}

		expect(isRedirect(thrown)).toBe(true);
		if (isRedirect(thrown)) {
			expect(thrown.status).toBe(303);
			expect(thrown.location).toBe('/');
		}

		// The POST path is the sole session-clearing path.
		expect(cookies.delete).toHaveBeenCalledWith('session', { path: '/' });
	});
});
