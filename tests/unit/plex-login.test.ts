import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import {
	PIN_STORAGE_KEY,
	resolveRedirectPinData,
	sanitizeCompletedLoginResponse,
	startPlexLoginPopup,
	startPlexLoginRedirect
} from '$lib/client/plex-login';

const originalFetch = globalThis.fetch;

type ConsoleOriginClassification = 'obzorarr' | 'third-party-plex' | 'unknown';

interface ConsoleEntry {
	pageUrl?: string;
	text: string;
}

function consoleEntryOrigin(entry: ConsoleEntry): string | null {
	if (!entry.pageUrl) return null;
	try {
		return new URL(entry.pageUrl).origin;
	} catch {
		return null;
	}
}

function classifyConsoleEntry(
	entry: ConsoleEntry,
	obzorarrOrigin: string
): ConsoleOriginClassification {
	const origin = consoleEntryOrigin(entry);
	if (!origin) return 'unknown';
	if (origin === obzorarrOrigin) return 'obzorarr';
	if (origin === 'https://app.plex.tv' || origin === 'https://plex.tv') return 'third-party-plex';
	return 'unknown';
}

function tokenLikeText(entry: ConsoleEntry): boolean {
	return /authToken|accessToken|plexToken|token|secret/i.test(entry.text);
}

describe('sanitizeCompletedLoginResponse', () => {
	it('keeps only browser-safe login fields', () => {
		const sanitized = sanitizeCompletedLoginResponse({
			user: {
				id: 1,
				plexId: 123,
				username: 'alice',
				email: 'alice@example.com',
				isAdmin: true,
				authToken: 'plex-user-token',
				services: [{ accessToken: 'service-token', secret: 'service-secret' }]
			},
			redirectTo: '/admin',
			authToken: 'raw-auth-token',
			accessToken: 'raw-access-token',
			resources: [{ clientIdentifier: 'server-id' }]
		});

		expect(sanitized).toEqual({
			user: {
				username: 'alice',
				isAdmin: true
			},
			redirectTo: '/admin'
		});

		const responseText = JSON.stringify(sanitized);
		for (const forbidden of [
			'authToken',
			'token',
			'secret',
			'plexToken',
			'plexId',
			'email',
			'services',
			'accessToken',
			'clientIdentifier',
			'resources',
			'raw-auth-token',
			'service-token',
			'service-secret'
		]) {
			expect(responseText).not.toContain(forbidden);
		}
	});

	it('strips provider auth payload fields from AUTH_COMPLETE-shaped responses', () => {
		const sanitized = sanitizeCompletedLoginResponse({
			type: 'AUTH_COMPLETE',
			authToken: 'plex-auth-token',
			token: 'provider-token',
			secret: 'provider-secret',
			clientIdentifier: 'root-client-id',
			user: {
				id: 7,
				uuid: 'raw-plex-uuid',
				plexId: '123456',
				username: 'owner',
				email: 'owner@example.com',
				isAdmin: false,
				authToken: 'nested-auth-token',
				services: [
					{
						identifier: 'server-resource',
						token: 'service-token',
						secret: 'service-secret'
					}
				]
			},
			resources: [
				{
					name: 'Plex Server',
					clientIdentifier: 'server-client-id',
					machineIdentifier: 'server-machine-id',
					accessToken: 'server-access-token'
				}
			],
			redirectTo: '/dashboard'
		});

		expect(sanitized).toEqual({
			user: {
				username: 'owner',
				isAdmin: false
			},
			redirectTo: '/dashboard'
		});

		const responseText = JSON.stringify(sanitized);
		for (const forbidden of [
			'AUTH_COMPLETE',
			'authToken',
			'token',
			'secret',
			'email',
			'services',
			'plexId',
			'uuid',
			'resources',
			'clientIdentifier',
			'machineIdentifier',
			'accessToken',
			'plex-auth-token',
			'provider-token',
			'provider-secret',
			'nested-auth-token',
			'root-client-id',
			'service-token',
			'service-secret',
			'server-access-token',
			'server-client-id',
			'server-machine-id',
			'owner@example.com',
			'123456',
			'raw-plex-uuid'
		]) {
			expect(responseText).not.toContain(forbidden);
		}
	});
});

describe('Plex OAuth console source attribution', () => {
	it('classifies Plex-hosted console entries as third-party evidence', () => {
		const entries: ConsoleEntry[] = [
			{
				pageUrl: 'https://app.plex.tv/auth#?code=ABCD',
				text: 'AUTH_COMPLETE authToken=plex-hosted-token'
			},
			{
				pageUrl: 'https://plex.tv/auth',
				text: 'accessToken=plex-hosted-token'
			},
			{
				pageUrl: 'https://obzorarr.example/auth/plex/redirect',
				text: 'Completing Authentication'
			}
		];

		expect(entries.map((entry) => consoleEntryOrigin(entry))).toEqual([
			'https://app.plex.tv',
			'https://plex.tv',
			'https://obzorarr.example'
		]);
		expect(entries.map((entry) => classifyConsoleEntry(entry, 'https://obzorarr.example'))).toEqual(
			['third-party-plex', 'third-party-plex', 'obzorarr']
		);

		const obzorarrTokenLeaks = entries.filter(
			(entry) =>
				classifyConsoleEntry(entry, 'https://obzorarr.example') === 'obzorarr' &&
				tokenLikeText(entry)
		);
		expect(obzorarrTokenLeaks).toHaveLength(0);
	});

	it('keeps Obzorarr-owned completed auth responses limited to browser-safe fields', async () => {
		const [endpointSource, redirectSource] = await Promise.all([
			Bun.file('src/routes/auth/plex/+server.ts').text(),
			Bun.file('src/routes/auth/plex/redirect/+page.server.ts').text()
		]);

		const browserAuthSource = `${endpointSource}\n${redirectSource}`;
		for (const forbidden of [
			'authToken',
			'accessToken',
			'services',
			'resources',
			'email',
			'plexId'
		]) {
			const forbiddenBrowserFieldPattern = new RegExp(String.raw`\b${forbidden}\s*(?::|[,}])`);
			expect(browserAuthSource).not.toMatch(forbiddenBrowserFieldPattern);
		}
		expect(redirectSource).toContain('pinId: verifiedPin.pinId');
		expect(redirectSource).toContain('expiresAt: verifiedPin.expiresAt.toISOString()');
		expect(redirectSource).not.toContain('authToken');
		expect(redirectSource).not.toContain('accessToken');
	});
});

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

function createConsoleRecorder(consoleCalls: string[]) {
	return mock((...messages: unknown[]) => {
		consoleCalls.push(messages.map((message) => Bun.inspect(message, { depth: 10 })).join(' '));
	});
}

let consoleRecordingLock: Promise<void> = Promise.resolve();

async function recordConsoleCalls(run: () => void | Promise<void>): Promise<string[]> {
	const previousRecording = consoleRecordingLock;
	let releaseRecording: () => void = () => {};
	consoleRecordingLock = new Promise<void>((resolve) => {
		releaseRecording = resolve;
	});
	await previousRecording;

	const consoleCalls: string[] = [];
	const originalConsoleLog = console.log;
	const originalConsoleDebug = console.debug;
	const originalConsoleInfo = console.info;
	const originalConsoleWarn = console.warn;
	const originalConsoleError = console.error;
	const recordConsole = createConsoleRecorder(consoleCalls);
	console.log = recordConsole as typeof console.log;
	console.debug = recordConsole as typeof console.debug;
	console.info = recordConsole as typeof console.info;
	console.warn = recordConsole as typeof console.warn;
	console.error = recordConsole as typeof console.error;

	try {
		await run();
	} finally {
		console.log = originalConsoleLog;
		console.debug = originalConsoleDebug;
		console.info = originalConsoleInfo;
		console.warn = originalConsoleWarn;
		console.error = originalConsoleError;
		releaseRecording();
	}

	return consoleCalls;
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

	it('does not log or persist raw provider-shaped PIN payload fields', async () => {
		globalThis.fetch = mock(
			async () =>
				new Response(
					JSON.stringify({
						pinId: 4242,
						authUrl: 'https://app.plex.tv/auth#?code=ABCD',
						authToken: 'provider-auth-token',
						token: 'provider-token',
						accessToken: 'provider-access-token',
						secret: 'provider-secret'
					}),
					{ status: 200, headers: { 'Content-Type': 'application/json' } }
				)
		) as unknown as typeof fetch;

		const consoleCalls = await recordConsoleCalls(() =>
			startPlexLoginRedirect({
				context: 'landing',
				onError: () => {},
				location,
				storage: sessionStorage
			})
		);

		const browserOwnedText = `${consoleCalls.join('\n')}\n${sessionStorage.getItem(PIN_STORAGE_KEY) ?? ''}`;
		for (const forbidden of [
			'authToken',
			'token',
			'accessToken',
			'secret',
			'provider-auth-token',
			'provider-token',
			'provider-access-token',
			'provider-secret'
		]) {
			expect(browserOwnedText).not.toContain(forbidden);
		}
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
		let receivedError = '';

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

describe('resolveRedirectPinData', () => {
	it('prefers sessionStorage PIN data over the server fallback', () => {
		const storage = createSessionStorage();
		storage.setItem(
			PIN_STORAGE_KEY,
			JSON.stringify({ pinId: 111, createdAt: 1000, context: 'landing' })
		);

		expect(
			resolveRedirectPinData(
				storage,
				{ pinId: 222, expiresAt: new Date(60_000).toISOString(), context: 'onboarding' },
				2000
			)
		).toEqual({ pinId: 111, createdAt: 1000, context: 'landing' });
	});

	it('uses the server fallback when sessionStorage is absent', () => {
		const storage = createSessionStorage();

		expect(
			resolveRedirectPinData(
				storage,
				{ pinId: 222, expiresAt: new Date(60_000).toISOString(), context: 'onboarding' },
				2000
			)
		).toEqual({ pinId: 222, createdAt: 2000, context: 'onboarding' });
	});

	it('uses the server fallback when sessionStorage cannot be read', () => {
		const storage: Pick<Storage, 'getItem' | 'removeItem'> = {
			getItem: () => {
				throw new Error('Storage blocked');
			},
			removeItem: () => {
				throw new Error('Storage blocked');
			}
		};

		expect(
			resolveRedirectPinData(
				storage,
				{ pinId: 222, expiresAt: new Date(60_000).toISOString(), context: 'onboarding' },
				2000
			)
		).toEqual({ pinId: 222, createdAt: 2000, context: 'onboarding' });
	});

	it('does not use the server fallback when stored PIN data is invalid', () => {
		const storage = createSessionStorage();
		storage.setItem(PIN_STORAGE_KEY, '{bad-json');

		expect(() =>
			resolveRedirectPinData(
				storage,
				{ pinId: 222, expiresAt: new Date(60_000).toISOString(), context: 'onboarding' },
				2000
			)
		).toThrow('Invalid authentication data. Please try again.');
		expect(storage.getItem(PIN_STORAGE_KEY)).toBeNull();
	});

	it('reports invalid stored PIN data when sessionStorage cannot be cleared', () => {
		const storage: Pick<Storage, 'getItem' | 'removeItem'> = {
			getItem: () => '{bad-json',
			removeItem: () => {
				throw new Error('Storage blocked');
			}
		};

		expect(() =>
			resolveRedirectPinData(
				storage,
				{ pinId: 222, expiresAt: new Date(60_000).toISOString(), context: 'onboarding' },
				2000
			)
		).toThrow('Invalid authentication data. Please try again.');
	});
});

describe('startPlexLoginPopup', () => {
	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it('ignores stale poll failures once login completion has started', async () => {
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
		let callbackCalls = 0;
		let rejectFirstPoll: (err: Error) => void = () => {};
		const firstPoll = new Promise<Response>((_, reject) => {
			rejectFirstPoll = reject;
		});
		globalThis.fetch = mock(async (input: string | URL | Request, init?: RequestInit) => {
			const url = typeof input === 'string' ? input : input.toString();

			if (url === '/auth/plex' && init?.method === 'POST') {
				pollCalls += 1;
				if (pollCalls === 1) return firstPoll;
				return new Response(JSON.stringify({ user: { id: 1, username: 'plex', isAdmin: true } }), {
					status: 200,
					headers: { 'Content-Type': 'application/json' }
				});
			}

			if (url === '/auth/plex/callback') {
				callbackCalls += 1;
				return new Response(JSON.stringify({ error: 'callback should stay server-only' }), {
					status: 200,
					headers: { 'Content-Type': 'application/json' }
				});
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

		rejectFirstPoll(new Error('Network dropped'));
		await staleTick;
		expect(onError).not.toHaveBeenCalled();

		await successTick;

		expect(onSuccess).toHaveBeenCalledTimes(1);
		expect(onError).not.toHaveBeenCalled();
		expect(onPopupBlocked).not.toHaveBeenCalled();
		expect(callbackCalls).toBe(0);
	});

	it('returns only sanitized user fields and never logs provider-shaped poll payloads', async () => {
		let resolveIntervalRegistered: () => void = () => {};
		const intervalRegistered = new Promise<void>((resolve) => {
			resolveIntervalRegistered = resolve;
		});
		const intervalCallbacks: Array<() => Promise<void>> = [];
		const timers = createTimerMocks((callback) => {
			intervalCallbacks.push(callback);
			resolveIntervalRegistered();
		});

		const popup: MockPopupWindow = { closed: false, close: mock(() => {}) };
		const browserWindow: MockWindow = {
			location: { origin: 'https://obzorarr.example', href: 'https://obzorarr.example/' },
			open: mock(() => popup) as unknown as MockWindow['open']
		};

		globalThis.fetch = mock(async (input: string | URL | Request, init?: RequestInit) => {
			const url = typeof input === 'string' ? input : input.toString();
			if (url === '/auth/plex' && init?.method === 'POST') {
				return new Response(
					JSON.stringify({
						type: 'AUTH_COMPLETE',
						authToken: 'provider-auth-token',
						token: 'provider-token',
						accessToken: 'provider-access-token',
						secret: 'provider-secret',
						user: {
							id: 7,
							plexId: '123456',
							username: 'owner',
							email: 'owner@example.com',
							isAdmin: true,
							authToken: 'nested-auth-token'
						},
						redirectTo: '/admin'
					}),
					{ status: 200, headers: { 'Content-Type': 'application/json' } }
				);
			}
			return new Response(
				JSON.stringify({
					pinId: 42,
					authUrl: 'https://app.plex.tv/auth#?code=ABCD'
				}),
				{ status: 200, headers: { 'Content-Type': 'application/json' } }
			);
		}) as unknown as typeof fetch;

		const receivedUsers: unknown[] = [];
		const onSuccess = mock(async (user: unknown) => {
			receivedUsers.push(user);
		});
		const onError = mock(() => {});
		const onPopupBlocked = mock(() => {});

		const consoleCalls = await recordConsoleCalls(async () => {
			startPlexLoginPopup({
				context: 'landing',
				onSuccess,
				onError,
				onPopupBlocked,
				window: browserWindow,
				timers
			});
			await intervalRegistered;
			await (intervalCallbacks[0] as () => Promise<void>)();
		});

		expect(receivedUsers).toEqual([{ username: 'owner', isAdmin: true }]);
		expect(onError).not.toHaveBeenCalled();
		expect(onPopupBlocked).not.toHaveBeenCalled();

		const browserOwnedText = `${consoleCalls.join('\n')}\n${JSON.stringify(receivedUsers)}`;
		for (const forbidden of [
			'AUTH_COMPLETE',
			'authToken',
			'token',
			'accessToken',
			'secret',
			'plexId',
			'email',
			'provider-auth-token',
			'provider-token',
			'provider-access-token',
			'provider-secret',
			'nested-auth-token',
			'owner@example.com',
			'123456'
		]) {
			expect(browserOwnedText).not.toContain(forbidden);
		}
	});

	it('surfaces server message and stops polling on 403 (NotServerMemberError)', async () => {
		let resolveIntervalRegistered: () => void = () => {};
		const intervalRegistered = new Promise<void>((resolve) => {
			resolveIntervalRegistered = resolve;
		});
		const intervalCallbacks: Array<() => Promise<void>> = [];
		const timers = createTimerMocks((callback) => {
			intervalCallbacks.push(callback);
			resolveIntervalRegistered();
		});

		const popup: MockPopupWindow = { closed: false, close: mock(() => {}) };
		const browserWindow: MockWindow = {
			location: { origin: 'https://obzorarr.example', href: 'https://obzorarr.example/' },
			open: mock(() => popup) as unknown as MockWindow['open']
		};

		globalThis.fetch = mock(async (input: string | URL | Request, init?: RequestInit) => {
			const url = typeof input === 'string' ? input : input.toString();
			if (url === '/auth/plex' && init?.method === 'POST') {
				return new Response(
					JSON.stringify({ message: 'You are not a member of this Plex server.' }),
					{ status: 403, headers: { 'Content-Type': 'application/json' } }
				);
			}
			return new Response(
				JSON.stringify({ pinId: 42, authUrl: 'https://app.plex.tv/auth#?code=ABCD' }),
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
		await poll();

		expect(onError).toHaveBeenCalledTimes(1);
		expect((onError.mock.calls[0] as string[])[0]).toBe(
			'You are not a member of this Plex server.'
		);
		expect(onSuccess).not.toHaveBeenCalled();

		await poll();
		expect(onError).toHaveBeenCalledTimes(1);
	});

	it('surfaces server message and stops polling on 502 (PlexAuthApiError)', async () => {
		let resolveIntervalRegistered: () => void = () => {};
		const intervalRegistered = new Promise<void>((resolve) => {
			resolveIntervalRegistered = resolve;
		});
		const intervalCallbacks: Array<() => Promise<void>> = [];
		const timers = createTimerMocks((callback) => {
			intervalCallbacks.push(callback);
			resolveIntervalRegistered();
		});

		const popup: MockPopupWindow = { closed: false, close: mock(() => {}) };
		const browserWindow: MockWindow = {
			location: { origin: 'https://obzorarr.example', href: 'https://obzorarr.example/' },
			open: mock(() => popup) as unknown as MockWindow['open']
		};

		globalThis.fetch = mock(async (input: string | URL | Request, init?: RequestInit) => {
			const url = typeof input === 'string' ? input : input.toString();
			if (url === '/auth/plex' && init?.method === 'POST') {
				return new Response(
					JSON.stringify({ message: 'Unable to connect to Plex. Please try again.' }),
					{ status: 502, headers: { 'Content-Type': 'application/json' } }
				);
			}
			return new Response(
				JSON.stringify({ pinId: 42, authUrl: 'https://app.plex.tv/auth#?code=ABCD' }),
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
		await poll();

		expect(onError).toHaveBeenCalledTimes(1);
		expect((onError.mock.calls[0] as string[])[0]).toBe(
			'Unable to connect to Plex. Please try again.'
		);
		expect(onSuccess).not.toHaveBeenCalled();

		await poll();
		expect(onError).toHaveBeenCalledTimes(1);
	});
});
