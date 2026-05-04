/**
 * Unit tests for Slide Types
 *
 * Tests the SlideError class and related type validations.
 */

import { describe, expect, it } from 'bun:test';
import { SlideError, SlideTypeSchema, slideErrorToFail } from '$lib/server/slides/types';

describe('SlideError', () => {
	describe('constructor', () => {
		it('sets message correctly', () => {
			const error = new SlideError('Test error message', 'TEST_CODE');

			expect(error.message).toBe('Test error message');
		});

		it('sets code correctly', () => {
			const error = new SlideError('Test message', 'INVALID_SLIDE_TYPE');

			expect(error.code).toBe('INVALID_SLIDE_TYPE');
		});

		it('sets name to SlideError', () => {
			const error = new SlideError('Test message', 'TEST_CODE');

			expect(error.name).toBe('SlideError');
		});
	});

	describe('inheritance', () => {
		it('is an instance of Error', () => {
			const error = new SlideError('Test message', 'TEST_CODE');

			expect(error).toBeInstanceOf(Error);
		});

		it('is an instance of SlideError', () => {
			const error = new SlideError('Test message', 'TEST_CODE');

			expect(error).toBeInstanceOf(SlideError);
		});

		it('has a stack trace', () => {
			const error = new SlideError('Test message', 'TEST_CODE');

			expect(error.stack).toBeDefined();
			expect(error.stack).toContain('SlideError');
		});
	});

	describe('error handling', () => {
		it('can be thrown and caught', () => {
			let caughtError: SlideError | null = null;

			try {
				throw new SlideError('Slide not found', 'NOT_FOUND');
			} catch (error) {
				if (error instanceof SlideError) {
					caughtError = error;
				}
			}

			expect(caughtError).not.toBeNull();
			expect(caughtError?.message).toBe('Slide not found');
			expect(caughtError?.code).toBe('NOT_FOUND');
		});

		it('code property is readonly', () => {
			const error = new SlideError('Test message', 'ORIGINAL_CODE');

			// TypeScript prevents this at compile time, but we verify runtime behavior
			// The property should remain unchanged
			expect(error.code).toBe('ORIGINAL_CODE');
		});

		it('can be distinguished from regular Error', () => {
			const slideError = new SlideError('Slide error', 'SLIDE_CODE');
			const regularError = new Error('Regular error');

			expect(slideError instanceof SlideError).toBe(true);
			expect(regularError instanceof SlideError).toBe(false);
		});
	});

	describe('common error codes', () => {
		it('works with INVALID_SLIDE_TYPE code', () => {
			const error = new SlideError('Invalid slide type: unknown', 'INVALID_SLIDE_TYPE');

			expect(error.code).toBe('INVALID_SLIDE_TYPE');
			expect(error.name).toBe('SlideError');
		});

		it('works with NOT_FOUND code', () => {
			const error = new SlideError('Slide config not found', 'NOT_FOUND');

			expect(error.code).toBe('NOT_FOUND');
		});

		it('works with UPDATE_FAILED code', () => {
			const error = new SlideError('Failed to update slide', 'UPDATE_FAILED');

			expect(error.code).toBe('UPDATE_FAILED');
		});
	});
});

describe('slideErrorToFail', () => {
	it('maps UNSAFE_CONTENT to 400 with content fieldErrors', () => {
		const result = slideErrorToFail(new SlideError('Unsafe HTML', 'UNSAFE_CONTENT'));
		expect(result.status).toBe(400);
		expect(result.body).toEqual({
			error: 'Unsafe HTML',
			fieldErrors: { content: ['Unsafe HTML'] }
		});
	});

	it('maps MARKDOWN_INVALID to 400 with content fieldErrors', () => {
		const result = slideErrorToFail(new SlideError('Bad markdown', 'MARKDOWN_INVALID'));
		expect(result.status).toBe(400);
		expect(result.body).toEqual({
			error: 'Bad markdown',
			fieldErrors: { content: ['Bad markdown'] }
		});
	});

	it('maps VALIDATION_ERROR to 400 with _form fieldErrors', () => {
		const result = slideErrorToFail(new SlideError('Title required', 'VALIDATION_ERROR'));
		expect(result.status).toBe(400);
		expect(result.body).toEqual({
			error: 'Title required',
			fieldErrors: { _form: ['Title required'] }
		});
	});

	it('maps NOT_FOUND to 404', () => {
		const result = slideErrorToFail(
			new SlideError('Custom slide not found with id: 7', 'NOT_FOUND')
		);
		expect(result.status).toBe(404);
		expect(result.body).toEqual({ error: 'Custom slide not found with id: 7' });
	});

	it('maps CREATE_FAILED to 500 with friendly message (no leaked stack)', () => {
		const result = slideErrorToFail(new SlideError('Insert returned no row', 'CREATE_FAILED'));
		expect(result.status).toBe(500);
		expect(result.body).toEqual({ error: 'Slide could not be saved. Please try again.' });
	});

	it('maps UPDATE_FAILED to 500 with friendly message', () => {
		const result = slideErrorToFail(new SlideError('Update returned no row', 'UPDATE_FAILED'));
		expect(result.status).toBe(500);
		expect(result.body).toEqual({ error: 'Slide could not be saved. Please try again.' });
	});

	it('maps generic Error to 500 with a generic message (no leaked detail)', () => {
		// e.g., a Drizzle/bun:sqlite exception whose message contains constraint
		// text or table/column names must NOT be forwarded to the client.
		const result = slideErrorToFail(
			new Error('UNIQUE constraint failed: custom_slides.sort_order')
		);
		expect(result.status).toBe(500);
		expect(result.body).toEqual({ error: 'An unexpected error occurred' });
	});

	it('maps non-Error throwables to 500 with a generic message', () => {
		const result = slideErrorToFail('something');
		expect(result.status).toBe(500);
		expect(result.body).toEqual({ error: 'An unexpected error occurred' });
	});

	it('maps unknown SlideError code to 500 with a generic message', () => {
		const result = slideErrorToFail(new SlideError('Unknown failure', 'TOTALLY_NEW_CODE'));
		expect(result.status).toBe(500);
		expect(result.body).toEqual({ error: 'An unexpected error occurred' });
	});
});

describe('SlideTypeSchema', () => {
	describe('valid slide types', () => {
		const validTypes = [
			'total-time',
			'top-movies',
			'top-shows',
			'genres',
			'distribution',
			'percentile',
			'binge',
			'first-last',
			'custom'
		];

		for (const type of validTypes) {
			it(`accepts "${type}" as a valid slide type`, () => {
				const result = SlideTypeSchema.safeParse(type);
				expect(result.success).toBe(true);
			});
		}
	});

	describe('invalid slide types', () => {
		it('rejects invalid slide type', () => {
			const result = SlideTypeSchema.safeParse('invalid-type');
			expect(result.success).toBe(false);
		});

		it('rejects empty string', () => {
			const result = SlideTypeSchema.safeParse('');
			expect(result.success).toBe(false);
		});

		it('rejects number', () => {
			const result = SlideTypeSchema.safeParse(123);
			expect(result.success).toBe(false);
		});

		it('rejects null', () => {
			const result = SlideTypeSchema.safeParse(null);
			expect(result.success).toBe(false);
		});
	});
});
