import { describe, expect, it, spyOn } from 'bun:test';
import { error as svelteError } from '@sveltejs/kit';
import { logger } from '$lib/server/logging';
import { handleError } from '../../src/hooks.server';

/** A real @sveltejs/kit HttpError of the given status (error() throws it). */
function makeHttpError(status: number, message: string): unknown {
	try {
		svelteError(status, message);
	} catch (e) {
		return e;
	}
	throw new Error('error() did not throw');
}

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

// ISSUE-009 (T3a): 4xx client errors are caller mistakes, not server faults, and
// must log at WARN so the ERROR channel stays reserved for genuine 5xx/unexpected
// failures. The 404 stays at info/[NotFound]; 5xx and non-HttpError throws stay at
// error/[ErrorHandler].
describe('handleError — 4xx demotion to WARN (ISSUE-009)', () => {
	for (const status of [400, 403, 422]) {
		it(`logs a ${status} HttpError at warn/[ClientError]`, async () => {
			const infoSpy = spyOn(logger, 'info').mockImplementation(() => {});
			const warnSpy = spyOn(logger, 'warn').mockImplementation(() => {});
			const errorSpy = spyOn(logger, 'error').mockImplementation(() => {});

			try {
				const result = await handleError({
					error: makeHttpError(status, `client error ${status}`),
					event: makeEvent('/admin/settings', '/admin/settings'),
					status,
					message: 'Error'
				} as HandleErrorArgs);

				expect(errorSpy).not.toHaveBeenCalled();
				expect(infoSpy).not.toHaveBeenCalled();
				expect(warnSpy).toHaveBeenCalledTimes(1);
				expect(warnSpy.mock.calls[0]?.[1]).toBe('ClientError');
				expect(result).toEqual({ message: `client error ${status}` });
			} finally {
				infoSpy.mockRestore();
				warnSpy.mockRestore();
				errorSpy.mockRestore();
			}
		});
	}

	it('keeps a 404 HttpError at info/[NotFound], not warn', async () => {
		const infoSpy = spyOn(logger, 'info').mockImplementation(() => {});
		const warnSpy = spyOn(logger, 'warn').mockImplementation(() => {});
		const errorSpy = spyOn(logger, 'error').mockImplementation(() => {});

		try {
			const result = await handleError({
				error: makeHttpError(404, 'nope'),
				event: makeEvent('/wrapped/2026/u/abc', '/wrapped/[year=year]/u/[identifier]'),
				status: 404,
				message: 'Not Found'
			} as HandleErrorArgs);

			expect(warnSpy).not.toHaveBeenCalled();
			expect(errorSpy).not.toHaveBeenCalled();
			expect(infoSpy).toHaveBeenCalledTimes(1);
			expect(infoSpy.mock.calls[0]?.[1]).toBe('NotFound');
			expect(result).toEqual({ message: 'nope' });
		} finally {
			infoSpy.mockRestore();
			warnSpy.mockRestore();
			errorSpy.mockRestore();
		}
	});

	it('keeps a 500 HttpError at error/[ErrorHandler]', async () => {
		const warnSpy = spyOn(logger, 'warn').mockImplementation(() => {});
		const errorSpy = spyOn(logger, 'error').mockImplementation(() => {});

		try {
			const result = await handleError({
				error: makeHttpError(500, 'boom'),
				event: makeEvent('/admin', '/admin'),
				status: 500,
				message: 'Error'
			} as HandleErrorArgs);

			expect(warnSpy).not.toHaveBeenCalled();
			expect(errorSpy).toHaveBeenCalledTimes(1);
			expect(errorSpy.mock.calls[0]?.[1]).toBe('ErrorHandler');
			expect(result).toEqual({ message: 'An unexpected error occurred' });
		} finally {
			warnSpy.mockRestore();
			errorSpy.mockRestore();
		}
	});

	it('keeps a non-HttpError throw at error/[ErrorHandler]', async () => {
		const warnSpy = spyOn(logger, 'warn').mockImplementation(() => {});
		const errorSpy = spyOn(logger, 'error').mockImplementation(() => {});

		try {
			const result = await handleError({
				error: new Error('unexpected'),
				event: makeEvent('/admin', '/admin'),
				status: 500,
				message: 'Error'
			} as HandleErrorArgs);

			expect(warnSpy).not.toHaveBeenCalled();
			expect(errorSpy).toHaveBeenCalledTimes(1);
			expect(errorSpy.mock.calls[0]?.[1]).toBe('ErrorHandler');
			expect(result).toEqual({ message: 'An unexpected error occurred' });
		} finally {
			warnSpy.mockRestore();
			errorSpy.mockRestore();
		}
	});
});
