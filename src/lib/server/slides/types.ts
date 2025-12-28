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
