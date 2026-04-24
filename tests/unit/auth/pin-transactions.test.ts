import { beforeEach, describe, expect, it } from 'bun:test';
import type { Cookies } from '@sveltejs/kit';
import { completePlexPinLogin } from '$lib/server/auth/login-completion';
import {
	_resetPinTransactionsForTests,
	createPinTransaction,
	getPinTransactionForRequest,
	markPinCallbackVerified
} from '$lib/server/auth/pin-transactions';
import { PinExpiredError } from '$lib/server/auth/types';

function createCookies(): Cookies {
	const values = new Map<string, string>();
	return {
		get: (name: string) => values.get(name),
		set: (name: string, value: string) => {
			values.set(name, value);
		},
		delete: (name: string) => {
			values.delete(name);
		}
	} as unknown as Cookies;
}

describe('Plex PIN transactions', () => {
	beforeEach(() => {
		_resetPinTransactionsForTests();
	});

	it('binds a PIN transaction to the browser state cookie', () => {
		const cookies = createCookies();
		const state = createPinTransaction(123, cookies);

		const transaction = getPinTransactionForRequest(123, cookies);

		expect(transaction?.state).toBe(state);
		expect(getPinTransactionForRequest(456, cookies)).toBeNull();
		expect(getPinTransactionForRequest(123, createCookies())).toBeNull();
	});

	it('requires the callback state to match the HttpOnly state cookie', () => {
		const cookies = createCookies();
		const state = createPinTransaction(123, cookies);

		expect(markPinCallbackVerified(cookies, 'wrong-state')).toBe(false);
		expect(getPinTransactionForRequest(123, cookies)?.callbackVerified).toBe(false);

		expect(markPinCallbackVerified(cookies, state)).toBe(true);
		expect(getPinTransactionForRequest(123, cookies)?.callbackVerified).toBe(true);
	});

	it('does not poll Plex or create a session before callback verification', async () => {
		const cookies = createCookies();
		createPinTransaction(123, cookies);

		await expect(completePlexPinLogin(123, cookies)).resolves.toEqual({ pending: true });
	});

	it('rejects PIN polling without the initiating browser transaction', async () => {
		const cookies = createCookies();

		await expect(completePlexPinLogin(123, cookies)).rejects.toBeInstanceOf(PinExpiredError);
	});
});
