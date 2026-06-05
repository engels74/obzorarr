import { describe, expect, it } from 'bun:test';
import { SlideError, SlideTypeSchema, slideErrorToFail } from '$lib/server/slides/types';

describe('SlideError', () => {
	it('preserves message, code, name, stack, and Error inheritance', () => {
		const error = new SlideError('Slide not found', 'NOT_FOUND');

		expect(error).toBeInstanceOf(Error);
		expect(error).toBeInstanceOf(SlideError);
		expect(error).toMatchObject({
			message: 'Slide not found',
			code: 'NOT_FOUND',
			name: 'SlideError'
		});
		expect(error.stack).toContain('SlideError');
		expect(new Error('Regular error')).not.toBeInstanceOf(SlideError);
	});

	it.each([
		'INVALID_SLIDE_TYPE',
		'NOT_FOUND',
		'UPDATE_FAILED'
	] as const)('supports %s code', (code) => {
		expect(new SlideError('message', code).code).toBe(code);
	});
});

describe('slideErrorToFail', () => {
	it.each([
		[
			'UNSAFE_CONTENT',
			new SlideError('Unsafe HTML', 'UNSAFE_CONTENT'),
			400,
			{ error: 'Unsafe HTML', fieldErrors: { content: ['Unsafe HTML'] } }
		],
		[
			'MARKDOWN_INVALID',
			new SlideError('Bad markdown', 'MARKDOWN_INVALID'),
			400,
			{ error: 'Bad markdown', fieldErrors: { content: ['Bad markdown'] } }
		],
		[
			'VALIDATION_ERROR',
			new SlideError('Title required', 'VALIDATION_ERROR'),
			400,
			{ error: 'Title required', fieldErrors: { _form: ['Title required'] } }
		],
		[
			'NOT_FOUND',
			new SlideError('Custom slide not found with id: 7', 'NOT_FOUND'),
			404,
			{ error: 'Custom slide not found with id: 7' }
		],
		[
			'CREATE_FAILED',
			new SlideError('Insert returned no row', 'CREATE_FAILED'),
			500,
			{ error: 'Slide could not be saved. Please try again.' }
		],
		[
			'UPDATE_FAILED',
			new SlideError('Update returned no row', 'UPDATE_FAILED'),
			500,
			{ error: 'Slide could not be saved. Please try again.' }
		],
		[
			'generic Error',
			new Error('UNIQUE constraint failed: custom_slides.sort_order'),
			500,
			{ error: 'An unexpected error occurred' }
		],
		['non-Error throwable', 'something', 500, { error: 'An unexpected error occurred' }],
		[
			'unknown SlideError code',
			new SlideError('Unknown failure', 'TOTALLY_NEW_CODE'),
			500,
			{ error: 'An unexpected error occurred' }
		]
	] as const)('maps %s safely', (_name, error, status, body) => {
		const result = slideErrorToFail(error);

		expect(result.status).toBe(status);
		expect(result.body).toEqual(body);
	});
});

describe('SlideTypeSchema', () => {
	it.each([
		'total-time',
		'top-movies',
		'top-shows',
		'genres',
		'distribution',
		'percentile',
		'binge',
		'first-last',
		'custom'
	] as const)('accepts %s', (type) => {
		expect(SlideTypeSchema.safeParse(type).success).toBe(true);
	});

	it.each(['invalid-type', '', 123, null] as const)('rejects %p', (type) => {
		expect(SlideTypeSchema.safeParse(type).success).toBe(false);
	});
});
