import { beforeEach, describe, expect, it } from 'bun:test';
import type { Cookies } from '@sveltejs/kit';
import { completePlexPinLogin } from '$lib/server/auth/login-completion';
import {
	_resetPinTransactionsForTests,
	clearPinTransaction,
	createPinTransaction,
	getPinTransactionForRequest,
	markPinCallbackVerified
} from '$lib/server/auth/pin-transactions';
import { PinExpiredError } from '$lib/server/auth/types';

interface CookieCall {
	name: string;
	value?: string;
	options?: unknown;
}

interface TestCookies extends Cookies {
	sets: CookieCall[];
	deletes: CookieCall[];
}

function createCookies(): TestCookies {
	const values = new Map<string, string>();
	const sets: CookieCall[] = [];
	const deletes: CookieCall[] = [];

	return {
		sets,
		deletes,
		get: (name: string) => values.get(name),
		set: (name: string, value: string, options?: unknown) => {
			sets.push({ name, value, options });
			values.set(name, value);
		},
		delete: (name: string, options?: unknown) => {
			deletes.push({ name, options });
			values.delete(name);
		}
	} as unknown as TestCookies;
}

describe('Plex PIN transactions', () => {
	beforeEach(async () => {
		await _resetPinTransactionsForTests();
	});

	it('binds a PIN transaction to the browser state cookie', async () => {
		const cookies = createCookies();
		const state = await createPinTransaction(123, cookies);

		const transaction = await getPinTransactionForRequest(123, cookies);

		expect(transaction?.state).toBe(state);
		expect(await getPinTransactionForRequest(456, cookies)).toBeNull();
		expect(await getPinTransactionForRequest(123, createCookies())).toBeNull();
	});

	it('clears the PIN state cookie with the same security attributes used when it was set', async () => {
		const cookies = createCookies();
		const state = await createPinTransaction(123, cookies);

		await clearPinTransaction(cookies, state);

		const setOptions = cookies.sets[0]?.options as Record<string, unknown>;
		expect(cookies.deletes).toHaveLength(1);
		expect(cookies.deletes[0]?.name).toBe('plex_login_state');
		expect(cookies.deletes[0]?.options).toEqual({
			path: setOptions.path,
			httpOnly: setOptions.httpOnly,
			secure: setOptions.secure,
			sameSite: setOptions.sameSite
		});
	});

	it('requires the callback state to match the HttpOnly state cookie', async () => {
		const cookies = createCookies();
		const state = await createPinTransaction(123, cookies);

		expect(await markPinCallbackVerified(cookies, 'wrong-state')).toBe(false);
		expect((await getPinTransactionForRequest(123, cookies))?.callbackVerified).toBe(false);

		expect(await markPinCallbackVerified(cookies, state)).toBe(true);
		expect((await getPinTransactionForRequest(123, cookies))?.callbackVerified).toBe(true);
	});

	it('does not poll Plex or create a session before callback verification', async () => {
		const cookies = createCookies();
		await createPinTransaction(123, cookies);

		await expect(completePlexPinLogin(123, cookies)).resolves.toEqual({ pending: true });
	});

	it('rejects PIN polling without the initiating browser transaction', async () => {
		const cookies = createCookies();

		await expect(completePlexPinLogin(123, cookies)).rejects.toBeInstanceOf(PinExpiredError);
	});
});
