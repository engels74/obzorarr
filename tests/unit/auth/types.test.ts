import { describe, expect, it } from 'bun:test';
import {
	AuthError,
	NotServerMemberError,
	PinExpiredError,
	PLEX_CLIENT_ID,
	PLEX_PRODUCT,
	PLEX_VERSION,
	PlexAuthApiError,
	PlexFriendSchema,
	SESSION_DURATION_MS,
	SessionExpiredError
} from '$lib/server/auth/types';

describe('auth types', () => {
	it.each([
		['SESSION_DURATION_MS', SESSION_DURATION_MS, 7 * 24 * 60 * 60 * 1000],
		['PLEX_CLIENT_ID', PLEX_CLIENT_ID, 'obzorarr'],
		['PLEX_PRODUCT', PLEX_PRODUCT, 'Obzorarr'],
		['PLEX_VERSION', PLEX_VERSION, '1.0.0']
	] as const)('exports %s', (_name, actual, expected) => {
		expect(actual).toBe(expected);
	});

	it('AuthError stores message, code, cause, and name', () => {
		const cause = new Error('Original error');
		const error = new AuthError('Wrapper message', 'WRAPPED', cause);

		expect(error).toBeInstanceOf(Error);
		expect(error).toMatchObject({
			message: 'Wrapper message',
			code: 'WRAPPED',
			cause,
			name: 'AuthError'
		});
	});

	it.each([
		[
			'NotServerMemberError',
			NotServerMemberError,
			'You are not a member of this Plex server.',
			'Custom not a member message',
			'NOT_SERVER_MEMBER'
		],
		[
			'PinExpiredError',
			PinExpiredError,
			'Login session expired. Please try again.',
			'Custom PIN expired message',
			'PIN_EXPIRED'
		],
		[
			'SessionExpiredError',
			SessionExpiredError,
			'Your session has expired. Please log in again.',
			'Custom session expired message',
			'SESSION_EXPIRED'
		]
	] as const)('%s preserves default/custom messages, code, name, and inheritance', (name, ErrorClass, defaultMessage, customMessage, code) => {
		const defaultError = new ErrorClass();
		const customError = new ErrorClass(customMessage);

		expect(defaultError).toBeInstanceOf(AuthError);
		expect(defaultError).toBeInstanceOf(Error);
		expect(defaultError).toMatchObject({ message: defaultMessage, code, name });
		expect(customError.message).toBe(customMessage);
	});

	it('PlexAuthApiError stores API context and AuthError inheritance', () => {
		const cause = new Error('Network failure');
		const error = new PlexAuthApiError('Request failed', 500, '/api', cause);
		const minimal = new PlexAuthApiError('Minimal error');

		expect(error).toBeInstanceOf(AuthError);
		expect(error).toMatchObject({
			message: 'Request failed',
			code: 'PLEX_API_ERROR',
			name: 'PlexAuthApiError',
			statusCode: 500,
			endpoint: '/api',
			cause
		});
		expect(minimal.statusCode).toBeUndefined();
		expect(minimal.endpoint).toBeUndefined();
		expect(minimal.cause).toBeUndefined();
	});

	it('discriminates concrete error classes and codes', () => {
		const errors = [
			new NotServerMemberError(),
			new PinExpiredError(),
			new SessionExpiredError(),
			new PlexAuthApiError('API error')
		];

		expect(errors.every((error) => error instanceof AuthError)).toBe(true);
		expect(errors.map((error) => error.code)).toEqual([
			'NOT_SERVER_MEMBER',
			'PIN_EXPIRED',
			'SESSION_EXPIRED',
			'PLEX_API_ERROR'
		]);
		expect(errors[0]).toBeInstanceOf(NotServerMemberError);
		expect(errors[0]).not.toBeInstanceOf(SessionExpiredError);
		expect(errors[1]).toBeInstanceOf(PinExpiredError);
		expect(errors[1]).not.toBeInstanceOf(PlexAuthApiError);
	});

	describe('PlexFriendSchema', () => {
		it.each([
			['null username', { id: 42, username: null, email: 'x@example.com' }, true],
			['null email', { id: 42, username: 'someone', email: null }, true],
			['both names nullish', { id: 42, username: null, email: null }, true],
			['string username and email', { id: 42, username: 'someone', email: 'x@example.com' }, true],
			['missing id', { username: 'someone', email: null }, false]
		] as const)('%s', (_name, payload, success) => {
			expect(PlexFriendSchema.safeParse(payload).success).toBe(success);
		});
	});
});
