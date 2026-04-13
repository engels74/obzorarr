import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import {
	PIN_STORAGE_KEY,
	startPlexLoginPopup,
	startPlexLoginRedirect
} from '$lib/client/plex-login';

const originalFetch = globalThis.fetch;

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

interface MockPopupWindow {
	closed: boolean;
	close(): void;
}

interface MockWindow {
	location: MockLocation;
	open(url?: string | URL, target?: string, features?: string): MockPopupWindow | null;
}

function createTimerMocks(onInterval: (callback: () => Promise<void>) => void) {
	return {
		setInterval: (handler: () => Promise<void>) => {
			onInterval(handler);
			return { id: 1 };
		},
		clearInterval: () => {},
		setTimeout: (handler: () => void, timeout: number) => {
			if (timeout === 100) {
				queueMicrotask(() => {
					handler();
				});
			}
			return { id: 1 };
		},
		clearTimeout: () => {}
	};
}

describe('startPlexLoginRedirect', () => {
	let location: MockLocation;
	let sessionStorage: MemoryStorage;

	beforeEach(() => {
		const origin = 'https://obzorarr.example';
		location = { origin, href: `${origin}/` };
		sessionStorage = createSessionStorage();
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it('fetches PIN with same-origin redirectUrl, persists pin to sessionStorage, navigates to authUrl', async () => {
		const fetchedUrls: string[] = [];
		globalThis.fetch = mock(async (input: string | URL | Request) => {
			const url = typeof input === 'string' ? input : input.toString();
			fetchedUrls.push(url);
			return new Response(
				JSON.stringify({
					pinId: 4242,
					authUrl: 'https://app.plex.tv/auth#?code=ABCD'
				}),
				{ status: 200, headers: { 'Content-Type': 'application/json' } }
			);
		}) as unknown as typeof fetch;

		const onError = mock(() => {});

		await startPlexLoginRedirect({
			context: 'landing',
			onError,
			location,
			storage: sessionStorage
		});

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

		expect(location.href).toBe('https://app.plex.tv/auth#?code=ABCD');
	});

	it('records the onboarding context when supplied', async () => {
		globalThis.fetch = mock(
			async () =>
				new Response(
					JSON.stringify({
						pinId: 1,
						authUrl: 'https://app.plex.tv/auth#?code=X'
					}),
					{
						status: 200,
						headers: { 'Content-Type': 'application/json' }
					}
				)
		) as unknown as typeof fetch;

		await startPlexLoginRedirect({
			context: 'onboarding',
			onError: () => {},
			location,
			storage: sessionStorage
		});

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

		const originalHref = location.href;
		let receivedError: string | null = null;

		await startPlexLoginRedirect({
			context: 'landing',
			location,
			storage: sessionStorage,
			onError: (msg) => {
				receivedError = msg;
			}
		});

		expect(receivedError).toBe('Plex unreachable');
		expect(location.href).toBe(originalHref);
		expect(sessionStorage.getItem(PIN_STORAGE_KEY)).toBeNull();
	});
});

describe('startPlexLoginPopup', () => {
	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it('ignores stale poll failures once callback exchange has started', async () => {
		const intervalCallbacks: Array<() => Promise<void>> = [];
		let resolveIntervalRegistered: () => void = () => {};
		const intervalRegistered = new Promise<void>((resolve) => {
			resolveIntervalRegistered = resolve;
		});
		const timers = createTimerMocks((callback) => {
			intervalCallbacks.push(callback);
			resolveIntervalRegistered();
		});

		const popup: MockPopupWindow = { closed: false, close: mock(() => {}) };
		const browserWindow: MockWindow = {
			location: {
				origin: 'https://obzorarr.example',
				href: 'https://obzorarr.example/'
			},
			open: mock(() => popup) as unknown as MockWindow['open']
		};

		let pollCalls = 0;
		let rejectFirstPoll: (err: Error) => void = () => {};
		const firstPoll = new Promise<Response>((_, reject) => {
			rejectFirstPoll = reject;
		});
		let resolveCallbackRequested: () => void = () => {};
		const callbackRequested = new Promise<void>((resolve) => {
			resolveCallbackRequested = resolve;
		});
		let resolveCallback: (response: Response) => void = () => {};
		const callbackExchange = new Promise<Response>((resolve) => {
			resolveCallback = resolve;
		});

		globalThis.fetch = mock(async (input: string | URL | Request, init?: RequestInit) => {
			const url = typeof input === 'string' ? input : input.toString();

			if (url === '/auth/plex' && init?.method === 'POST') {
				pollCalls += 1;
				if (pollCalls === 1) return firstPoll;
				return new Response(JSON.stringify({ authToken: 'plex-token' }), {
					status: 200,
					headers: { 'Content-Type': 'application/json' }
				});
			}

			if (url === '/auth/plex/callback') {
				resolveCallbackRequested();
				return callbackExchange;
			}

			return new Response(
				JSON.stringify({
					pinId: 42,
					authUrl: 'https://app.plex.tv/auth#?code=ABCD'
				}),
				{ status: 200, headers: { 'Content-Type': 'application/json' } }
			);
		}) as unknown as typeof fetch;

		const onSuccess = mock(async () => {});
		const onError = mock(() => {});
		const onPopupBlocked = mock(() => {});

		startPlexLoginPopup({
			context: 'landing',
			onSuccess,
			onError,
			onPopupBlocked,
			window: browserWindow,
			timers
		});
		await intervalRegistered;

		const poll = intervalCallbacks[0] as () => Promise<void>;
		const staleTick = poll();
		const successTick = poll();
		await callbackRequested;

		rejectFirstPoll(new Error('Network dropped'));
		await staleTick;
		expect(onError).not.toHaveBeenCalled();

		resolveCallback(
			new Response(JSON.stringify({ user: { id: 1, username: 'plex', isAdmin: true } }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			})
		);
		await successTick;

		expect(onSuccess).toHaveBeenCalledTimes(1);
		expect(onError).not.toHaveBeenCalled();
		expect(onPopupBlocked).not.toHaveBeenCalled();
	});
});
