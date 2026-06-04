import { describe, expect, it } from 'bun:test';
import { isAdminRouteId, requireAdminAction } from '$lib/server/auth/guards';

async function readSource(path: string): Promise<string> {
	return Bun.file(path).text();
}

describe('admin auth guards', () => {
	it('identifies decoded admin route ids instead of relying on raw pathnames', () => {
		expect(isAdminRouteId('/admin')).toBe(true);
		expect(isAdminRouteId('/admin/logs/stream')).toBe(true);
		expect(isAdminRouteId('/%61dmin/logs/stream')).toBe(false);
		expect(isAdminRouteId('/dashboard')).toBe(false);
		expect(isAdminRouteId(null)).toBe(false);
	});

	it('rejects admin actions without an admin local user', () => {
		expect(requireAdminAction({})?.status).toBe(403);
		expect(
			requireAdminAction({ user: { id: 1, plexId: 1, username: 'u', isAdmin: false } })?.status
		).toBe(403);
		expect(
			requireAdminAction({ user: { id: 1, plexId: 1, username: 'u', isAdmin: true } })
		).toBeNull();
	});

	it('keeps logged-in non-admin admin-route probes redirected to dashboard', async () => {
		const source = await readSource('src/hooks.server.ts');

		// Authenticated non-admins are sent to their own dashboard (no returnTo).
		expect(source).toContain('if (event.locals.user) {');
		expect(source).toContain("return redirectResponse(event, '/dashboard');");
		// Anonymous admin-route hits preserve the requested path as a validated
		// returnTo so login can land them back where they were headed (ISSUE-002).
		expect(source).toContain('const requestedPath = event.url.pathname + event.url.search;');
		expect(source).toContain('/?returnTo=');
		expect(source).toContain('encodeURIComponent(requestedPath)');
	});
});
