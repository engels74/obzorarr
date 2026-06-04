import { describe, expect, it } from 'bun:test';

/**
 * ISSUE-002 (dogfood 2026-06-04) — anon → admin redirect preserves the target.
 *
 * authorizationHandle is composed into the exported `handle` sequence and is not
 * individually exportable, so this pins the hook's returnTo construction at the
 * source level: an anonymous hit on an admin route must carry the requested path
 * as a validated, encoded `returnTo`, while an authenticated non-admin is sent to
 * their dashboard with no returnTo. The behavioural open-redirect coverage for the
 * shared validator lives in tests/unit/auth/return-path.test.ts.
 */
describe('hooks authorizationHandle — anon admin returnTo carrier', () => {
	it('builds an encoded returnTo from the requested admin path for anon users', async () => {
		const source = await Bun.file('src/hooks.server.ts').text();

		expect(source).toContain("import { isSafeReturnPath } from '$lib/client/plex-login';");
		expect(source).toContain('const requestedPath = event.url.pathname;');
		expect(source).toContain('isSafeReturnPath(requestedPath)');
		expect(source).toContain('/?returnTo=');
		expect(source).toContain('encodeURIComponent(requestedPath)');
	});

	it('sends authenticated non-admins to their dashboard without a returnTo', async () => {
		const source = await Bun.file('src/hooks.server.ts').text();

		const handlerStart = source.indexOf('const authorizationHandle');
		expect(handlerStart).toBeGreaterThan(-1);
		const handlerSlice = source.slice(handlerStart, handlerStart + 900);
		expect(handlerSlice).toContain('if (event.locals.user) {');
		expect(handlerSlice).toContain("return redirectResponse(event, '/dashboard');");
	});
});
