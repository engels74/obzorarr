import { error, fail } from '@sveltejs/kit';

const ADMIN_REQUIRED_MESSAGE = 'Admin access required';
const AUTH_REQUIRED_MESSAGE = 'Authentication required';

type AdminActionEvent = { locals: App.Locals } & Record<string, unknown>;
type UserActionEvent = { locals: App.Locals } & Record<string, unknown>;

export function isAdminRouteId(routeId: string | null | undefined): boolean {
	return routeId === '/admin' || routeId?.startsWith('/admin/') === true;
}

export function requireAdmin(locals: App.Locals): NonNullable<App.Locals['user']> {
	if (!locals.user?.isAdmin) {
		error(403, ADMIN_REQUIRED_MESSAGE);
	}

	return locals.user;
}

export function requireAdminAction(locals: App.Locals) {
	if (!locals.user?.isAdmin) {
		return fail(403, { error: ADMIN_REQUIRED_MESSAGE });
	}

	return null;
}

export function requireAdminActions<T extends Record<string, unknown>>(actions: T): T {
	const wrapped: Record<string, unknown> = {};

	for (const key of Object.keys(actions)) {
		const action = actions[key];
		if (typeof action !== 'function') {
			wrapped[key] = action;
			continue;
		}

		wrapped[key] = async (event: AdminActionEvent) => {
			const denied = requireAdminAction(event.locals);
			if (denied) return denied;

			return (action as (event: AdminActionEvent) => unknown | Promise<unknown>)(event);
		};
	}

	return wrapped as T;
}

// Form actions do NOT run the route's redirecting `load`, so a same-origin POST
// to a user-only action lands directly in the handler with `locals.user`
// undefined for an unauthenticated caller. Without this guard those handlers
// dereference `locals.user!.id` and 500 (ISSUE-006). requireUserAction returns
// a 401 fail() instead, mirroring requireAdminAction's contract.
export function requireUserAction(locals: App.Locals) {
	if (!locals.user) {
		return fail(401, { error: AUTH_REQUIRED_MESSAGE });
	}

	return null;
}

export function requireUserActions<T extends Record<string, unknown>>(actions: T): T {
	const wrapped: Record<string, unknown> = {};

	for (const key of Object.keys(actions)) {
		const action = actions[key];
		if (typeof action !== 'function') {
			wrapped[key] = action;
			continue;
		}

		wrapped[key] = async (event: UserActionEvent) => {
			const denied = requireUserAction(event.locals);
			if (denied) return denied;

			return (action as (event: UserActionEvent) => unknown | Promise<unknown>)(event);
		};
	}

	return wrapped as T;
}
