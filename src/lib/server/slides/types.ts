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
				return {
					status: 500,
					body: { error: 'Slide could not be saved. Please try again.' }
				};
		}
	}
	const message = err instanceof Error ? err.message : 'Unexpected error';
	return { status: 500, body: { error: message } };
}
