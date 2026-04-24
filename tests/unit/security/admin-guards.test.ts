import { describe, expect, it } from 'bun:test';
import { isAdminRouteId, requireAdminAction } from '$lib/server/auth/guards';

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
});
