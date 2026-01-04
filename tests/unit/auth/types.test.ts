/**
 * Unit tests for Auth Types
 *
 * Tests authentication error classes and their behavior.
 */

import { describe, expect, it } from 'bun:test';
import {
	AuthError,
	NotServerMemberError,
	PinExpiredError,
	PLEX_CLIENT_ID,
	PLEX_PRODUCT,
	PLEX_VERSION,
	PlexAuthApiError,
	SESSION_DURATION_MS,
	SessionExpiredError
} from '$lib/server/auth/types';

describe('Auth Constants', () => {
	it('SESSION_DURATION_MS equals 7 days in milliseconds', () => {
		expect(SESSION_DURATION_MS).toBe(7 * 24 * 60 * 60 * 1000);
	});

	it('PLEX_CLIENT_ID is obzorarr', () => {
		expect(PLEX_CLIENT_ID).toBe('obzorarr');
	});

	it('PLEX_PRODUCT is Obzorarr', () => {
		expect(PLEX_PRODUCT).toBe('Obzorarr');
	});

	it('PLEX_VERSION is 1.0.0', () => {
		expect(PLEX_VERSION).toBe('1.0.0');
	});
});

describe('AuthError', () => {
	it('sets message correctly', () => {
		const error = new AuthError('Test message', 'TEST_CODE');
		expect(error.message).toBe('Test message');
	});

	it('sets code correctly', () => {
		const error = new AuthError('Test message', 'TEST_CODE');
		expect(error.code).toBe('TEST_CODE');
	});

	it('sets name to AuthError', () => {
		const error = new AuthError('Test message', 'TEST_CODE');
		expect(error.name).toBe('AuthError');
	});

	it('stores cause when provided', () => {
		const originalError = new Error('Original error');
		const error = new AuthError('Wrapper message', 'WRAPPED', originalError);
		expect(error.cause).toBe(originalError);
	});

	it('is an instance of Error', () => {
		const error = new AuthError('Test', 'CODE');
		expect(error).toBeInstanceOf(Error);
	});

	it('has a stack trace', () => {
		const error = new AuthError('Test', 'CODE');
		expect(error.stack).toBeDefined();
	});
});

describe('NotServerMemberError', () => {
	it('uses default message when not provided', () => {
		const error = new NotServerMemberError();
		expect(error.message).toBe('You are not a member of this Plex server.');
	});

	it('uses custom message when provided', () => {
		const error = new NotServerMemberError('Custom not a member message');
		expect(error.message).toBe('Custom not a member message');
	});

	it('has code NOT_SERVER_MEMBER', () => {
		const error = new NotServerMemberError();
		expect(error.code).toBe('NOT_SERVER_MEMBER');
	});

	it('has name NotServerMemberError', () => {
		const error = new NotServerMemberError();
		expect(error.name).toBe('NotServerMemberError');
	});

	it('is an instance of AuthError', () => {
		const error = new NotServerMemberError();
		expect(error).toBeInstanceOf(AuthError);
	});

	it('is an instance of Error', () => {
		const error = new NotServerMemberError();
		expect(error).toBeInstanceOf(Error);
	});

	it('can be thrown and caught', () => {
		let caughtError: NotServerMemberError | null = null;

		try {
			throw new NotServerMemberError();
		} catch (error) {
			if (error instanceof NotServerMemberError) {
				caughtError = error;
			}
		}

		expect(caughtError).not.toBeNull();
		expect(caughtError?.code).toBe('NOT_SERVER_MEMBER');
	});
});

describe('PinExpiredError', () => {
	it('uses default message when not provided', () => {
		const error = new PinExpiredError();
		expect(error.message).toBe('Login session expired. Please try again.');
	});

	it('uses custom message when provided', () => {
		const error = new PinExpiredError('Custom PIN expired message');
		expect(error.message).toBe('Custom PIN expired message');
	});

	it('has code PIN_EXPIRED', () => {
		const error = new PinExpiredError();
		expect(error.code).toBe('PIN_EXPIRED');
	});

	it('has name PinExpiredError', () => {
		const error = new PinExpiredError();
		expect(error.name).toBe('PinExpiredError');
	});

	it('is an instance of AuthError', () => {
		const error = new PinExpiredError();
		expect(error).toBeInstanceOf(AuthError);
	});
});

describe('SessionExpiredError', () => {
	it('uses default message when not provided', () => {
		const error = new SessionExpiredError();
		expect(error.message).toBe('Your session has expired. Please log in again.');
	});

	it('uses custom message when provided', () => {
		const error = new SessionExpiredError('Custom session expired message');
		expect(error.message).toBe('Custom session expired message');
	});

	it('has code SESSION_EXPIRED', () => {
		const error = new SessionExpiredError();
		expect(error.code).toBe('SESSION_EXPIRED');
	});

	it('has name SessionExpiredError', () => {
		const error = new SessionExpiredError();
		expect(error.name).toBe('SessionExpiredError');
	});

	it('is an instance of AuthError', () => {
		const error = new SessionExpiredError();
		expect(error).toBeInstanceOf(AuthError);
	});

	it('is an instance of Error', () => {
		const error = new SessionExpiredError();
		expect(error).toBeInstanceOf(Error);
	});

	it('can be thrown and caught', () => {
		let caughtError: SessionExpiredError | null = null;

		try {
			throw new SessionExpiredError();
		} catch (error) {
			if (error instanceof SessionExpiredError) {
				caughtError = error;
			}
		}

		expect(caughtError).not.toBeNull();
		expect(caughtError?.code).toBe('SESSION_EXPIRED');
	});
});

describe('PlexAuthApiError', () => {
	it('sets message correctly', () => {
		const error = new PlexAuthApiError('API call failed');
		expect(error.message).toBe('API call failed');
	});

	it('has code PLEX_API_ERROR', () => {
		const error = new PlexAuthApiError('API call failed');
		expect(error.code).toBe('PLEX_API_ERROR');
	});

	it('has name PlexAuthApiError', () => {
		const error = new PlexAuthApiError('API call failed');
		expect(error.name).toBe('PlexAuthApiError');
	});

	it('stores statusCode when provided', () => {
		const error = new PlexAuthApiError('Rate limited', 429);
		expect(error.statusCode).toBe(429);
	});

	it('stores endpoint when provided', () => {
		const error = new PlexAuthApiError('Not found', 404, '/api/v2/pins');
		expect(error.endpoint).toBe('/api/v2/pins');
	});

	it('stores cause when provided', () => {
		const originalError = new Error('Network failure');
		const error = new PlexAuthApiError('Request failed', 500, '/api', originalError);
		expect(error.cause).toBe(originalError);
	});

	it('is an instance of AuthError', () => {
		const error = new PlexAuthApiError('API error');
		expect(error).toBeInstanceOf(AuthError);
	});

	it('allows all parameters to be undefined except message', () => {
		const error = new PlexAuthApiError('Minimal error');
		expect(error.statusCode).toBeUndefined();
		expect(error.endpoint).toBeUndefined();
		expect(error.cause).toBeUndefined();
	});
});

describe('Error Discrimination', () => {
	it('can distinguish NotServerMemberError from SessionExpiredError', () => {
		const notMemberError = new NotServerMemberError();
		const sessionError = new SessionExpiredError();

		expect(notMemberError instanceof NotServerMemberError).toBe(true);
		expect(notMemberError instanceof SessionExpiredError).toBe(false);

		expect(sessionError instanceof SessionExpiredError).toBe(true);
		expect(sessionError instanceof NotServerMemberError).toBe(false);
	});

	it('can distinguish PinExpiredError from PlexAuthApiError', () => {
		const pinError = new PinExpiredError();
		const apiError = new PlexAuthApiError('API error');

		expect(pinError instanceof PinExpiredError).toBe(true);
		expect(pinError instanceof PlexAuthApiError).toBe(false);

		expect(apiError instanceof PlexAuthApiError).toBe(true);
		expect(apiError instanceof PinExpiredError).toBe(false);
	});

	it('all error types are instances of AuthError', () => {
		const errors = [
			new NotServerMemberError(),
			new PinExpiredError(),
			new SessionExpiredError(),
			new PlexAuthApiError('API error')
		];

		for (const error of errors) {
			expect(error).toBeInstanceOf(AuthError);
		}
	});

	it('can use code property for error handling', () => {
		const errors: AuthError[] = [
			new NotServerMemberError(),
			new SessionExpiredError(),
			new PlexAuthApiError('API error')
		];

		const codes = errors.map((e) => e.code);

		expect(codes).toContain('NOT_SERVER_MEMBER');
		expect(codes).toContain('SESSION_EXPIRED');
		expect(codes).toContain('PLEX_API_ERROR');
	});
});
