import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { PIN_STORAGE_KEY, startPlexLoginRedirect } from '$lib/client/plex-login';

const originalFetch = globalThis.fetch;
const originalWindow = (globalThis as { window?: unknown }).window;
const originalSessionStorage = (globalThis as { sessionStorage?: unknown }).sessionStorage;

interface MemoryStorage {
	store: Map<string, string>;
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
	removeItem(key: string): void;
	clear(): void;
}

function createSessionStorage(): MemoryStorage {
	const store = new Map<string, string>();
	return {
		store,
		getItem: (k) => store.get(k) ?? null,
		setItem: (k, v) => {
			store.set(k, v);
		},
		removeItem: (k) => {
			store.delete(k);
		},
		clear: () => store.clear()
	};
}

interface MockLocation {
	origin: string;
	href: string;
}

function installBrowserGlobals(origin = 'https://obzorarr.example') {
	const location: MockLocation = { origin, href: `${origin}/` };
	const sessionStorage = createSessionStorage();
	Object.defineProperty(globalThis, 'window', {
		value: { location },
		configurable: true,
		writable: true
	});
	Object.defineProperty(globalThis, 'sessionStorage', {
		value: sessionStorage,
		configurable: true,
		writable: true
	});
	return { location, sessionStorage };
}

function restoreBrowserGlobals() {
	if (originalWindow === undefined) {
		delete (globalThis as { window?: unknown }).window;
	} else {
		Object.defineProperty(globalThis, 'window', {
			value: originalWindow,
			configurable: true,
			writable: true
		});
	}
	if (originalSessionStorage === undefined) {
		delete (globalThis as { sessionStorage?: unknown }).sessionStorage;
	} else {
		Object.defineProperty(globalThis, 'sessionStorage', {
			value: originalSessionStorage,
			configurable: true,
			writable: true
		});
	}
}

describe('startPlexLoginRedirect', () => {
	beforeEach(() => {
		installBrowserGlobals();
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
		restoreBrowserGlobals();
	});

	it('fetches PIN with same-origin redirectUrl, persists pin to sessionStorage, navigates to authUrl', async () => {
		const fetchedUrls: string[] = [];
		globalThis.fetch = mock(async (input: string | URL | Request) => {
			const url = typeof input === 'string' ? input : input.toString();
			fetchedUrls.push(url);
			return new Response(
				JSON.stringify({ pinId: 4242, authUrl: 'https://app.plex.tv/auth#?code=ABCD' }),
				{ status: 200, headers: { 'Content-Type': 'application/json' } }
			);
		}) as unknown as typeof fetch;

		const onError = mock(() => {});
		const win = (globalThis as { window: { location: MockLocation } }).window;

		await startPlexLoginRedirect({ context: 'landing', onError });

		expect(onError).not.toHaveBeenCalled();
		expect(fetchedUrls).toHaveLength(1);
		const fetched = fetchedUrls[0] as string;
		expect(fetched.startsWith('/auth/plex?redirectUrl=')).toBe(true);
		const decoded = decodeURIComponent(fetched.split('redirectUrl=')[1] as string);
		expect(decoded).toBe('https://obzorarr.example/auth/plex/redirect');

		const stored = sessionStorage.getItem(PIN_STORAGE_KEY);
		expect(stored).not.toBeNull();
		const parsed = JSON.parse(stored as string) as {
			pinId: number;
			createdAt: number;
			context: string;
		};
		expect(parsed.pinId).toBe(4242);
		expect(parsed.context).toBe('landing');
		expect(typeof parsed.createdAt).toBe('number');

		expect(win.location.href).toBe('https://app.plex.tv/auth#?code=ABCD');
	});

	it('records the onboarding context when supplied', async () => {
		globalThis.fetch = mock(
			async () =>
				new Response(JSON.stringify({ pinId: 1, authUrl: 'https://app.plex.tv/auth#?code=X' }), {
					status: 200,
					headers: { 'Content-Type': 'application/json' }
				})
		) as unknown as typeof fetch;

		await startPlexLoginRedirect({ context: 'onboarding', onError: () => {} });

		const parsed = JSON.parse(sessionStorage.getItem(PIN_STORAGE_KEY) as string) as {
			context: string;
		};
		expect(parsed.context).toBe('onboarding');
	});

	it('reports an error and does not navigate when PIN fetch fails', async () => {
		globalThis.fetch = mock(
			async () =>
				new Response(JSON.stringify({ message: 'Plex unreachable' }), {
					status: 502,
					headers: { 'Content-Type': 'application/json' }
				})
		) as unknown as typeof fetch;

		const win = (globalThis as { window: { location: MockLocation } }).window;
		const originalHref = win.location.href;
		let receivedError: string | null = null;

		await startPlexLoginRedirect({
			context: 'landing',
			onError: (msg) => {
				receivedError = msg;
			}
		});

		expect(receivedError).toBe('Plex unreachable');
		expect(win.location.href).toBe(originalHref);
		expect(sessionStorage.getItem(PIN_STORAGE_KEY)).toBeNull();
	});
});
