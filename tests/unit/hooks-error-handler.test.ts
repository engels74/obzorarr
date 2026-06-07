import { describe, expect, it, spyOn } from 'bun:test';
import { logger } from '$lib/server/logging';
import { handleError } from '../../src/hooks.server';

// ISSUE-010: an unmatched route (including a param-matcher rejection like
// /wrapped/abc) surfaces in handleError as a native SvelteKitError(404) whose
// message is the path-suffixed `Not found: <pathname>` (see @sveltejs/kit
// runtime/server/respond.js). It is NOT an HttpError, so it bypasses the
// isHttpError(404) branch. Before the guard broadening it fell through to
// logger.error('[ErrorHandler] ...') — polluting the error channel with routine
// 404s. These tests pin that such routes log at info/[NotFound], never error.

type HandleErrorArgs = Parameters<typeof handleError>[0];

function makeEvent(pathname: string, routeId: string | null): HandleErrorArgs['event'] {
	return {
		route: { id: routeId },
		url: new URL(`http://localhost${pathname}`),
		request: new Request(`http://localhost${pathname}`, { method: 'GET' })
	} as unknown as HandleErrorArgs['event'];
}

describe('handleError — not-found demotion (ISSUE-010)', () => {
	it('demotes a path-suffixed "Not found: <path>" on an unmatched route to info/[NotFound]', async () => {
		const infoSpy = spyOn(logger, 'info').mockImplementation(() => {});
		const errorSpy = spyOn(logger, 'error').mockImplementation(() => {});

		try {
			// The exact shape SvelteKit produces for /wrapped/abc (param matcher
			// rejects 'abc') — reproduced from the dev log line in the dogfood run.
			const result = await handleError({
				error: new Error('Not found: /wrapped/abc'),
				event: makeEvent('/wrapped/abc', null),
				status: 404,
				message: 'Not Found'
			} as HandleErrorArgs);

			expect(errorSpy).not.toHaveBeenCalled();
			expect(infoSpy).toHaveBeenCalledTimes(1);
			expect(infoSpy.mock.calls[0]?.[1]).toBe('NotFound');
			expect(result).toEqual({ message: 'Not found' });
		} finally {
			infoSpy.mockRestore();
			errorSpy.mockRestore();
		}
	});

	it('demotes a bare "Not found" on an unmatched route to info/[NotFound]', async () => {
		const infoSpy = spyOn(logger, 'info').mockImplementation(() => {});
		const errorSpy = spyOn(logger, 'error').mockImplementation(() => {});

		try {
			const result = await handleError({
				error: new Error('Not found'),
				event: makeEvent('/does/not/exist', null),
				status: 404,
				message: 'Not Found'
			} as HandleErrorArgs);

			expect(errorSpy).not.toHaveBeenCalled();
			expect(infoSpy).toHaveBeenCalledTimes(1);
			expect(infoSpy.mock.calls[0]?.[1]).toBe('NotFound');
			expect(result).toEqual({ message: 'Not found' });
		} finally {
			infoSpy.mockRestore();
			errorSpy.mockRestore();
		}
	});

	it('does NOT demote an app-thrown "Not found: ..." Error on a MATCHED route (route.id !== null)', async () => {
		const infoSpy = spyOn(logger, 'info').mockImplementation(() => {});
		const errorSpy = spyOn(logger, 'error').mockImplementation(() => {});

		try {
			// A genuine application error that merely happens to start with the same
			// prefix must still be treated as an unexpected error when the route
			// matched — the route.id === null guard is what keeps these distinct.
			const result = await handleError({
				error: new Error('Not found: a record we genuinely failed to load'),
				event: makeEvent('/dashboard', '/dashboard'),
				status: 500,
				message: 'Internal Error'
			} as HandleErrorArgs);

			expect(infoSpy).not.toHaveBeenCalled();
			expect(errorSpy).toHaveBeenCalledTimes(1);
			expect(errorSpy.mock.calls[0]?.[1]).toBe('ErrorHandler');
			expect(result).toEqual({ message: 'An unexpected error occurred' });
		} finally {
			infoSpy.mockRestore();
			errorSpy.mockRestore();
		}
	});
});
