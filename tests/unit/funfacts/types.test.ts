import { describe, expect, it } from 'bun:test';
import {
	AIGenerationError,
	FunFactsError,
	InsufficientStatsError
} from '$lib/server/funfacts/types';

describe('FunFacts Error Classes', () => {
	describe('FunFactsError', () => {
		it('sets message, code and statusCode correctly', () => {
			const error = new FunFactsError('Test error', 'TEST_CODE', 400);

			expect(error.message).toBe('Test error');
			expect(error.code).toBe('TEST_CODE');
			expect(error.statusCode).toBe(400);
			expect(error.name).toBe('FunFactsError');
		});

		it('defaults statusCode to 500', () => {
			const error = new FunFactsError('Test error', 'TEST_CODE');
			expect(error.statusCode).toBe(500);
		});

		it('is an instance of Error', () => {
			const error = new FunFactsError('Test', 'CODE');
			expect(error).toBeInstanceOf(Error);
		});
	});

	describe('AIGenerationError', () => {
		it('uses default message when not provided', () => {
			const error = new AIGenerationError();
			expect(error.message).toBe('AI generation failed');
		});

		it('uses custom message when provided', () => {
			const error = new AIGenerationError('Custom AI error');
			expect(error.message).toBe('Custom AI error');
		});

		it('has code AI_GENERATION_FAILED', () => {
			const error = new AIGenerationError();
			expect(error.code).toBe('AI_GENERATION_FAILED');
		});

		it('has statusCode 500', () => {
			const error = new AIGenerationError();
			expect(error.statusCode).toBe(500);
		});

		it('stores cause when provided', () => {
			const originalError = new Error('Original error');
			const error = new AIGenerationError('Wrapped error', originalError);
			expect(error.cause).toBe(originalError);
		});

		it('is an instance of FunFactsError', () => {
			const error = new AIGenerationError();
			expect(error).toBeInstanceOf(FunFactsError);
		});
	});

	describe('InsufficientStatsError', () => {
		it('uses default message when not provided', () => {
			const error = new InsufficientStatsError();
			expect(error.message).toBe('Insufficient statistics for fun fact generation');
		});

		it('uses custom message when provided', () => {
			const error = new InsufficientStatsError('Not enough data');
			expect(error.message).toBe('Not enough data');
		});

		it('has code INSUFFICIENT_STATS', () => {
			const error = new InsufficientStatsError();
			expect(error.code).toBe('INSUFFICIENT_STATS');
		});

		it('has statusCode 400', () => {
			const error = new InsufficientStatsError();
			expect(error.statusCode).toBe(400);
		});

		it('has name InsufficientStatsError', () => {
			const error = new InsufficientStatsError();
			expect(error.name).toBe('InsufficientStatsError');
		});

		it('is an instance of FunFactsError', () => {
			const error = new InsufficientStatsError();
			expect(error).toBeInstanceOf(FunFactsError);
		});

		it('is an instance of Error', () => {
			const error = new InsufficientStatsError();
			expect(error).toBeInstanceOf(Error);
		});

		it('can be thrown and caught', () => {
			let caughtError: InsufficientStatsError | null = null;

			try {
				throw new InsufficientStatsError();
			} catch (error) {
				if (error instanceof InsufficientStatsError) {
					caughtError = error;
				}
			}

			expect(caughtError).not.toBeNull();
			expect(caughtError?.code).toBe('INSUFFICIENT_STATS');
		});

		it('can be distinguished from AIGenerationError', () => {
			const insufficientError = new InsufficientStatsError();
			const aiError = new AIGenerationError();

			expect(insufficientError instanceof InsufficientStatsError).toBe(true);
			expect(insufficientError instanceof AIGenerationError).toBe(false);

			expect(aiError instanceof AIGenerationError).toBe(true);
			expect(aiError instanceof InsufficientStatsError).toBe(false);
		});
	});
});
