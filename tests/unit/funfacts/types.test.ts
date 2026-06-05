import { describe, expect, it } from 'bun:test';
import {
	AIGenerationError,
	FunFactsError,
	InsufficientStatsError
} from '$lib/server/funfacts/types';

describe('fun facts errors', () => {
	it('preserves base error message, code, status, name, and Error inheritance', () => {
		const error = new FunFactsError('Test error', 'TEST_CODE', 400);
		const defaultStatus = new FunFactsError('Test error', 'TEST_CODE');

		expect(error).toBeInstanceOf(Error);
		expect(error).toMatchObject({
			message: 'Test error',
			code: 'TEST_CODE',
			statusCode: 400,
			name: 'FunFactsError'
		});
		expect(defaultStatus.statusCode).toBe(500);
	});

	it.each([
		[
			'AIGenerationError',
			AIGenerationError,
			'AI generation failed',
			'Custom AI error',
			'AI_GENERATION_FAILED',
			500
		],
		[
			'InsufficientStatsError',
			InsufficientStatsError,
			'Insufficient statistics for fun fact generation',
			'Not enough data',
			'INSUFFICIENT_STATS',
			400
		]
	] as const)('%s preserves defaults, overrides, status, and inheritance', (name, ErrorClass, defaultMessage, customMessage, code, statusCode) => {
		const defaultError = new ErrorClass();
		const customError = new ErrorClass(customMessage);

		expect(defaultError).toBeInstanceOf(FunFactsError);
		expect(defaultError).toBeInstanceOf(Error);
		expect(defaultError).toMatchObject({ message: defaultMessage, code, statusCode, name });
		expect(customError.message).toBe(customMessage);
	});

	it('stores AI generation causes and keeps subclasses distinguishable', () => {
		const cause = new Error('Original error');
		const aiError = new AIGenerationError('Wrapped error', cause);
		const insufficientError = new InsufficientStatsError();

		expect(aiError.cause).toBe(cause);
		expect(aiError).toBeInstanceOf(AIGenerationError);
		expect(aiError).not.toBeInstanceOf(InsufficientStatsError);
		expect(insufficientError).toBeInstanceOf(InsufficientStatsError);
		expect(insufficientError).not.toBeInstanceOf(AIGenerationError);
	});
});
