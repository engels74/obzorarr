import { Buffer } from 'node:buffer';
import type { Cookies } from '@sveltejs/kit';

const PIN_STATE_COOKIE = 'plex_login_state';
const PIN_TRANSACTION_TTL_MS = 15 * 60 * 1000;

interface PinTransaction {
	pinId: number;
	state: string;
	expiresAt: number;
	callbackVerified: boolean;
}

const transactions = new Map<string, PinTransaction>();

const COOKIE_OPTIONS = {
	path: '/',
	httpOnly: true,
	secure: process.env.NODE_ENV === 'production',
	sameSite: 'lax' as const,
	maxAge: Math.floor(PIN_TRANSACTION_TTL_MS / 1000)
};

const COOKIE_DELETE_OPTIONS = {
	path: '/'
};

function generateState(): string {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);
	return Buffer.from(bytes).toString('base64url');
}

function pruneExpired(now = Date.now()): void {
	for (const [state, transaction] of transactions) {
		if (transaction.expiresAt <= now) {
			transactions.delete(state);
		}
	}
}

export function createPinTransaction(pinId: number, cookies: Cookies): string {
	pruneExpired();

	const state = generateState();
	transactions.set(state, {
		pinId,
		state,
		expiresAt: Date.now() + PIN_TRANSACTION_TTL_MS,
		callbackVerified: false
	});
	cookies.set(PIN_STATE_COOKIE, state, COOKIE_OPTIONS);

	return state;
}

export function appendPinStateToForwardUrl(
	forwardUrl: string,
	requestUrl: URL,
	state: string
): string {
	const parsed = new URL(forwardUrl, requestUrl.origin);

	if (parsed.origin !== requestUrl.origin) {
		throw new Error('Plex redirect URL must use the Obzorarr origin');
	}

	parsed.searchParams.set('state', state);
	return parsed.toString();
}

export function markPinCallbackVerified(cookies: Cookies, state: string | null): boolean {
	pruneExpired();

	const cookieState = cookies.get(PIN_STATE_COOKIE);
	if (!state || !cookieState || state !== cookieState) {
		return false;
	}

	const transaction = transactions.get(state);
	if (!transaction) {
		return false;
	}

	transaction.callbackVerified = true;
	return true;
}

export function getPinTransactionForRequest(
	pinId: number,
	cookies: Cookies
): PinTransaction | null {
	pruneExpired();

	const state = cookies.get(PIN_STATE_COOKIE);
	if (!state) {
		return null;
	}

	const transaction = transactions.get(state);
	if (!transaction || transaction.pinId !== pinId) {
		return null;
	}

	return transaction;
}

export function clearPinTransaction(cookies: Cookies, state: string): void {
	transactions.delete(state);
	cookies.delete(PIN_STATE_COOKIE, COOKIE_DELETE_OPTIONS);
}

export function _resetPinTransactionsForTests(): void {
	transactions.clear();
}
