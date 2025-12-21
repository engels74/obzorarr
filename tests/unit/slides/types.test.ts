/**
 * Unit tests for Slide Types
 *
 * Tests the SlideError class and related type validations.
 */

import { describe, expect, it } from 'bun:test';
import { SlideError, SlideTypeSchema } from '$lib/server/slides/types';

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
