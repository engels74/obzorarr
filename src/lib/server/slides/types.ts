import { logger } from '$lib/server/logging';

export * from '$lib/slides/types';

export class SlideError extends Error {
	constructor(
		message: string,
		public readonly code: string
	) {
		super(message);
		this.name = 'SlideError';
	}
}

export type SlideActionFail =
	| { status: 400; body: { error: string; fieldErrors: Record<string, string[]> } }
	| { status: 404; body: { error: string } }
	| { status: 500; body: { error: string } };

export function slideErrorToFail(err: unknown): SlideActionFail {
	if (err instanceof SlideError) {
		switch (err.code) {
			case 'UNSAFE_CONTENT':
			case 'MARKDOWN_INVALID':
				return {
					status: 400,
					body: { error: err.message, fieldErrors: { content: [err.message] } }
				};
			case 'VALIDATION_ERROR':
				return {
					status: 400,
					body: { error: err.message, fieldErrors: { _form: [err.message] } }
				};
			case 'NOT_FOUND':
				return { status: 404, body: { error: err.message } };
			case 'CREATE_FAILED':
			case 'UPDATE_FAILED':
				logger.error(`Slide save failed [${err.code}]: ${err.message}`, 'SlideError', {
					code: err.code
				});
				return {
					status: 500,
					body: { error: 'Slide could not be saved. Please try again.' }
				};
		}
	}
	// Unexpected error (raw Error from drizzle/bun:sqlite, unknown SlideError code,
	// or a non-Error throwable). Log the original server-side for debugging, but
	// return a generic message to the client to avoid leaking internals (e.g.,
	// SQL constraint text, table/column names). Mirrors the contract in
	// hooks.server.ts handleError, which form actions bypass.
	const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
	logger.error(`Unexpected slide action error: ${detail}`, 'SlideError', {
		code: err instanceof SlideError ? err.code : undefined
	});
	return { status: 500, body: { error: 'An unexpected error occurred' } };
}
