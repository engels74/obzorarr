import { beforeEach, describe, expect, it } from 'bun:test';
import type { Cookies } from '@sveltejs/kit';
import { AppSettingsKey, setAppSetting } from '$lib/server/admin/settings.service';
import { completePlexPinLogin } from '$lib/server/auth/login-completion';
import {
	_resetPinTransactionsForTests,
	clearPinTransaction,
	createPinTransaction,
	getPinTransactionForRequest,
	markPinCallbackVerified,
	verifyPinCallback
} from '$lib/server/auth/pin-transactions';
import { PinExpiredError } from '$lib/server/auth/types';
import { db } from '$lib/server/db/client';
import { appSettings } from '$lib/server/db/schema';
import { load as redirectLoad } from '../../../src/routes/auth/plex/redirect/+page.server';

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
		await db.delete(appSettings);
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

	it('returns a server PIN fallback for a verified callback state', async () => {
		const cookies = createCookies();
		const state = await createPinTransaction(123, cookies);

		const verified = await verifyPinCallback(cookies, state);

		expect(verified?.pinId).toBe(123);
		expect(verified?.expiresAt).toBeInstanceOf(Date);
		expect(JSON.stringify(verified)).not.toContain('token');
	});

	it('redirect load exposes the verified server PIN fallback without tokens', async () => {
		const cookies = createCookies();
		const state = await createPinTransaction(456, cookies);

		const result = await redirectLoad({
			cookies,
			locals: {},
			request: new Request(`http://localhost/auth/plex/redirect?state=${state}`, {
				headers: { referer: 'https://app.plex.tv' }
			}),
			url: new URL(`http://localhost/auth/plex/redirect?state=${state}`)
		} as unknown as Parameters<typeof redirectLoad>[0]);

		expect(result).toMatchObject({
			flow: 'redirect',
			stateVerified: true,
			serverPinFallback: {
				pinId: 456,
				context: 'onboarding'
			}
		});
		expect(JSON.stringify(result)).not.toContain('token');
	});

	it('redirect load marks the server PIN fallback as landing after onboarding is complete', async () => {
		await setAppSetting(AppSettingsKey.ONBOARDING_COMPLETED, 'true');
		const cookies = createCookies();
		const state = await createPinTransaction(789, cookies);

		const result = await redirectLoad({
			cookies,
			locals: {},
			request: new Request(`http://localhost/auth/plex/redirect?state=${state}`),
			url: new URL(`http://localhost/auth/plex/redirect?state=${state}`)
		} as unknown as Parameters<typeof redirectLoad>[0]);

		expect(result).toMatchObject({
			stateVerified: true,
			serverPinFallback: {
				pinId: 789,
				context: 'landing'
			}
		});
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
