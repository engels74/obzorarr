import { describe, expect, it } from 'bun:test';
import { isHttpError } from '@sveltejs/kit';
import { GET } from '../../../src/routes/api/onboarding/servers/+server';

type HandlerArgs = Parameters<typeof GET>[0];

function makeCookies(): HandlerArgs['cookies'] {
	return {
		get: () => undefined,
		getAll: () => [],
		set: () => undefined,
		delete: () => undefined,
		serialize: () => ''
	} as unknown as HandlerArgs['cookies'];
}

function runGet(locals: HandlerArgs['locals']): ReturnType<typeof GET> {
	return GET({
		cookies: makeCookies(),
		locals
	} as unknown as HandlerArgs);
}

describe('GET /api/onboarding/servers', () => {
	it('returns 401 when the request is unauthenticated', async () => {
		try {
			await runGet({} as HandlerArgs['locals']);
			expect.unreachable('Expected error to be thrown');
		} catch (err) {
			expect(isHttpError(err)).toBe(true);
			if (!isHttpError(err)) throw err;
			expect(err.status).toBe(401);
		}
	});

	it('returns 403 when the user is authenticated but not an admin', async () => {
		const locals = {
			user: { id: 1, plexId: 100, username: 'nonadmin', isAdmin: false }
		} as HandlerArgs['locals'];

		try {
			await runGet(locals);
			expect.unreachable('Expected error to be thrown');
		} catch (err) {
			expect(isHttpError(err)).toBe(true);
			if (!isHttpError(err)) throw err;
			expect(err.status).toBe(403);
			expect(err.body.message).toBe('Only server owners can configure Obzorarr');
		}
	});
});
