/**
 * Shared client-side helpers for the Plex OAuth login flow.
 *
 * Two entry points share PIN-fetch and polling plumbing:
 *  - `startPlexLoginPopup`   — opens Plex.tv in a popup, polls until the server
 *    creates an Obzorarr session, then returns the logged-in user.
 *  - `startPlexLoginRedirect` — same-tab navigation to Plex.tv with `forwardUrl`
 *    pointing back at /auth/plex/redirect; the redirect page then polls and
 *    receives the completed session. Designed for headless / E2E automation
 *    that cannot reliably orchestrate popups.
 */

export const PIN_STORAGE_KEY = 'obzorarr_plex_pin';

export const POLL_INTERVAL_MS = 2000;
export const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;
export const PIN_MAX_AGE_MS = 15 * 60 * 1000;

export type PlexLoginContext = 'landing' | 'onboarding';

export interface PlexLoginUser {
	username?: string;
	isAdmin: boolean;
}

interface CompletedLoginResponse {
	user: PlexLoginUser;
	redirectTo?: string;
}

interface PopupWindowHandle {
	closed: boolean;
	close(): void;
}

interface PopupWindowHost {
	location: {
		origin: string;
	};
	open(url?: string | URL, target?: string, features?: string): PopupWindowHandle | null;
}

interface LoginTimerHandle {
	id: unknown;
}

interface LoginTimers {
	setInterval(callback: () => void | Promise<void>, delay: number): LoginTimerHandle;
	clearInterval(handle: LoginTimerHandle): void;
	setTimeout(callback: () => void, delay: number): LoginTimerHandle;
	clearTimeout(handle: LoginTimerHandle): void;
}

/**
 * Minimal cross-tab signal channel (a subset of the DOM `BroadcastChannel`).
 * The popup completion page posts `{ type: 'login-complete' }` here so the
 * opener can poll the server immediately rather than waiting for its next tick
 * (DF-05). The message is a latency hint only — the opener re-confirms the
 * session against `/auth/plex` and never trusts this payload for auth.
 */
export interface PlexAuthBroadcastChannel {
	onmessage: ((event: { data: unknown }) => void | Promise<void>) | null;
	close(): void;
}

export const PLEX_AUTH_BROADCAST_NAME = 'plex-auth';

/**
 * Default channel factory: adapts the global `BroadcastChannel` to the minimal
 * {@link PlexAuthBroadcastChannel} shape the opener consumes. Returns `null`
 * where `BroadcastChannel` is unavailable (older browsers / SSR), so the opener
 * falls back to poll-only. Kept as a thin adapter because the DOM channel's
 * `onmessage` carries a full `MessageEvent`, not the `{ data }` subset used here.
 */
function defaultPlexAuthChannelFactory(): PlexAuthBroadcastChannel | null {
	if (typeof BroadcastChannel === 'undefined') return null;
	const channel = new BroadcastChannel(PLEX_AUTH_BROADCAST_NAME);
	return {
		set onmessage(handler: ((event: { data: unknown }) => void | Promise<void>) | null) {
			channel.onmessage = handler
				? (event: MessageEvent) => {
						void handler({ data: event.data });
					}
				: null;
		},
		get onmessage() {
			return channel.onmessage as unknown as
				| ((event: { data: unknown }) => void | Promise<void>)
				| null;
		},
		close() {
			channel.close();
		}
	};
}

export interface PlexLoginPopupOptions {
	context: PlexLoginContext;
	onSuccess: (user: PlexLoginUser) => void | Promise<void>;
	onError: (message: string) => void;
	onPopupBlocked: (pinId: number, authUrl: string) => void;
	window?: PopupWindowHost;
	timers?: LoginTimers;
	/**
	 * Factory for the cross-tab login-complete channel (DF-05). Defaults to the
	 * global `BroadcastChannel` when available; returns `null` when unsupported
	 * (older browsers / SSR) so the poll-only path remains the fallback. Injected
	 * in tests with a fake channel.
	 */
	createBroadcastChannel?: () => PlexAuthBroadcastChannel | null;
}

interface RedirectLocation {
	origin: string;
	href: string;
}

interface RedirectStorage {
	setItem(key: string, value: string): void;
}

export interface PlexLoginRedirectOptions {
	context: PlexLoginContext;
	onError: (message: string) => void;
	/**
	 * Validated same-origin path to land on after a successful login (ISSUE-002).
	 * Rides as a query param on the same-origin `/auth/plex/redirect` callback URL;
	 * re-validated server-side (redirect load) and client-side (landing page) before
	 * use, so a non-path value here is harmless.
	 */
	returnTo?: string;
	location?: RedirectLocation;
	storage?: RedirectStorage;
}

export interface PlexLoginController {
	cancel(): void;
}

interface PinResponse {
	pinId: number;
	authUrl: string;
}

export interface StoredRedirectPinData {
	pinId: number;
	createdAt: number;
	context: PlexLoginContext;
}

export interface ServerPinFallback {
	pinId: number;
	expiresAt: string;
	context: PlexLoginContext;
}

/**
 * Open-redirect guard for the post-login target path (ISSUE-002). A safe return
 * path is a same-origin, absolute path: it starts with a single "/" (NOT "//" or
 * "/\\", which browsers treat as protocol-relative // → external host), contains
 * no backslash escape tricks, and no control characters. Anything else
 * (`https://evil.com`, `javascript:…`, `\evil`) is rejected. This is the single
 * source of truth shared by the server hook (returnTo carrier), the redirect
 * load (server-side re-validation), and the client landing page (the actual
 * `window.location.href` open-redirect surface).
 *
 * A length cap (`MAX_RETURN_PATH_LENGTH`) rejects oversized, attacker-controlled
 * paths before they reach a redirect `Location` header — legitimate internal
 * paths are well under it.
 */
const MAX_RETURN_PATH_LENGTH = 2048;

export function isSafeReturnPath(path: unknown): path is string {
	if (typeof path !== 'string' || path.length === 0) return false;
	if (path.length > MAX_RETURN_PATH_LENGTH) return false;
	if (!path.startsWith('/')) return false;
	if (path.startsWith('//') || path.startsWith('/\\')) return false;
	if (path.includes('\\')) return false;
	// biome-ignore lint/suspicious/noControlCharactersInRegex: intentionally rejecting control chars in redirect targets
	if (/[\u0000-\u001f\u007f]/.test(path)) return false;
	return true;
}

/**
 * Returns `candidate` when it passes {@link isSafeReturnPath}, otherwise the
 * role-default `fallback`. Used to compute the post-login `targetUrl` so a forged
 * external value can never reach `window.location.href`. The `fallback` is itself
 * re-validated so a future caller cannot pass an unsafe value (e.g. an external
 * URL) straight through; when it fails, we degrade to the same-origin root `/`.
 */
export function resolveSafeReturnPath(candidate: unknown, fallback: string): string {
	if (isSafeReturnPath(candidate)) return candidate;
	return isSafeReturnPath(fallback) ? fallback : '/';
}

async function fetchPin(redirectUrl?: string): Promise<PinResponse> {
	const url = redirectUrl
		? `/auth/plex?redirectUrl=${encodeURIComponent(redirectUrl)}`
		: '/auth/plex';
	const response = await fetch(url);
	if (!response.ok) {
		const errData = (await response.json().catch(() => ({}))) as {
			message?: string;
		};
		throw new Error(errData.message || 'Failed to initiate login');
	}
	return (await response.json()) as PinResponse;
}

export function sanitizeCompletedLoginResponse(result: unknown): CompletedLoginResponse | null {
	if (!result || typeof result !== 'object' || !('user' in result)) return null;

	// Obzorarr cannot redact Plex-hosted auth page console output, so this keeps
	// every app-owned browser response limited to session-safe fields.
	const raw = result as {
		user?: { username?: unknown; isAdmin?: unknown };
		redirectTo?: unknown;
	};
	if (!raw.user || typeof raw.user.isAdmin !== 'boolean') return null;

	const sanitized: CompletedLoginResponse = {
		user: {
			isAdmin: raw.user.isAdmin
		}
	};
	if (typeof raw.user.username === 'string') {
		sanitized.user.username = raw.user.username;
	}
	if (raw.redirectTo === '/admin' || raw.redirectTo === '/dashboard') {
		sanitized.redirectTo = raw.redirectTo;
	}

	return sanitized;
}

function storePinForRedirect(
	pinId: number,
	context: PlexLoginContext,
	storage: RedirectStorage = sessionStorage
): void {
	storage.setItem(PIN_STORAGE_KEY, JSON.stringify({ pinId, createdAt: Date.now(), context }));
}

function getStoredRedirectPinData(storage: Pick<Storage, 'getItem'>): string | null {
	try {
		return storage.getItem(PIN_STORAGE_KEY);
	} catch {
		return null;
	}
}

function removeStoredRedirectPinData(storage: Pick<Storage, 'removeItem'>): void {
	try {
		storage.removeItem(PIN_STORAGE_KEY);
	} catch {}
}

export function resolveRedirectPinData(
	storage: Pick<Storage, 'getItem' | 'removeItem'>,
	serverPinFallback: ServerPinFallback | null | undefined,
	now = Date.now()
): StoredRedirectPinData {
	const storedData = getStoredRedirectPinData(storage);
	if (storedData) {
		let pinData: StoredRedirectPinData;
		try {
			pinData = JSON.parse(storedData) as StoredRedirectPinData;
		} catch {
			removeStoredRedirectPinData(storage);
			throw new Error('Invalid authentication data. Please try again.');
		}

		if (
			typeof pinData.pinId !== 'number' ||
			typeof pinData.createdAt !== 'number' ||
			(pinData.context !== 'landing' && pinData.context !== 'onboarding')
		) {
			removeStoredRedirectPinData(storage);
			throw new Error('Invalid authentication data. Please try again.');
		}

		const pinAge = now - pinData.createdAt;
		if (pinAge > PIN_MAX_AGE_MS) {
			removeStoredRedirectPinData(storage);
			throw new Error('Authentication session expired. Please try again.');
		}

		return pinData;
	}

	if (serverPinFallback) {
		const expiresAt = Date.parse(serverPinFallback.expiresAt);
		if (!Number.isFinite(expiresAt) || expiresAt <= now) {
			throw new Error('Authentication session expired. Please try again.');
		}

		return {
			pinId: serverPinFallback.pinId,
			createdAt: now,
			context: serverPinFallback.context
		};
	}

	throw new Error('No pending authentication found. Please try again.');
}

export function startPlexLoginPopup(opts: PlexLoginPopupOptions): PlexLoginController {
	const getBrowserWindow = (): PopupWindowHost => opts.window ?? window;
	const timers: LoginTimers = opts.timers ?? {
		setInterval: (callback, delay) => ({ id: setInterval(callback, delay) }),
		clearInterval: (handle) => clearInterval(handle.id as Parameters<typeof clearInterval>[0]),
		setTimeout: (callback, delay) => ({ id: setTimeout(callback, delay) }),
		clearTimeout: (handle) => clearTimeout(handle.id as Parameters<typeof clearTimeout>[0])
	};
	const createBroadcastChannel: () => PlexAuthBroadcastChannel | null =
		opts.createBroadcastChannel ?? defaultPlexAuthChannelFactory;
	let pollIntervalId: LoginTimerHandle | null = null;
	let timeoutId: LoginTimerHandle | null = null;
	let authChannel: PlexAuthBroadcastChannel | null = null;
	let cancelled = false;
	let finished = false;
	let succeeded = false;
	let callbackInProgress = false;
	let pinExpired = false;
	let timedOut = false;
	let authWindow: PopupWindowHandle | null = null;

	const closeChannel = () => {
		if (authChannel) {
			authChannel.onmessage = null;
			try {
				authChannel.close();
			} catch {}
			authChannel = null;
		}
	};

	const cleanup = () => {
		if (pollIntervalId) timers.clearInterval(pollIntervalId);
		if (timeoutId) timers.clearTimeout(timeoutId);
		pollIntervalId = null;
		timeoutId = null;
		closeChannel();
		authWindow?.close();
		finished = true;
	};

	const handlePopupBlocked = async () => {
		try {
			const redirectUrl = `${getBrowserWindow().location.origin}/auth/plex/redirect`;
			const { pinId, authUrl } = await fetchPin(redirectUrl);
			if (cancelled) return;
			opts.onPopupBlocked(pinId, authUrl);
		} catch {
			if (cancelled) return;
			opts.onError('Unable to prepare redirect. Please try again.');
		}
	};

	void (async () => {
		try {
			const redirectUrl = `${getBrowserWindow().location.origin}/auth/plex/redirect?flow=popup`;
			const { pinId, authUrl } = await fetchPin(redirectUrl);
			if (cancelled) return;

			authWindow = getBrowserWindow().open(authUrl, 'plex-auth', 'width=600,height=700');

			if (!authWindow) {
				await handlePopupBlocked();
				return;
			}

			await new Promise<void>((resolve) => {
				timers.setTimeout(resolve, 100);
			});
			if (cancelled) return;
			if (authWindow.closed) {
				await handlePopupBlocked();
				return;
			}

			const runPoll = async () => {
				if (finished) return;
				try {
					// Capture the popup state at tick start. A completed login is always
					// preferred over a cancel, so we only act on "closed" AFTER confirming
					// the poll did not return a completed login — otherwise a user who
					// authorizes and then closes the popup before the next poll lands would
					// see a false "cancelled" over a successful sign-in (ISSUE-015).
					const popupClosed = authWindow?.closed ?? false;
					const pollResponse = await fetch('/auth/plex', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ pinId })
					});
					if (finished) return;

					if (!pollResponse.ok) {
						if (pollResponse.status === 401) {
							pinExpired = true;
							cleanup();
							opts.onError('Authentication expired. Please try again.');
							return;
						}
						const errData = (await pollResponse.json().catch(() => ({}))) as {
							message?: string;
						};
						cleanup();
						opts.onError(errData.message || 'Login failed. Please try again.');
						return;
					}

					const result = (await pollResponse.json()) as unknown;
					if (finished) return;

					const completedLogin = sanitizeCompletedLoginResponse(result);
					if (completedLogin) {
						// Single-flight completion guard. runPoll is driven by both the poll
						// interval AND the BroadcastChannel handler, so two invocations can
						// overlap across the awaited fetch above and both observe a completed
						// login. `finished` only flips inside cleanup() below, so without this
						// check both would fall through and call opts.onSuccess twice.
						// `callbackInProgress` is set synchronously here (before any await),
						// so a second invocation that reaches this point returns instead of
						// re-completing. Concurrent still-pending polls remain allowed, so a
						// transient failure on one tick can still be retried by the next.
						if (callbackInProgress) return;
						callbackInProgress = true;
						cleanup();

						try {
							await opts.onSuccess(completedLogin.user);
							succeeded = true;
						} catch (err) {
							if (cancelled || succeeded || timedOut || pinExpired) return;
							opts.onError(err instanceof Error ? err.message : 'Login failed');
						}
						return;
					}

					// Still pending: if the user closed the popup, treat it as an explicit
					// cancel so the landing page can surface feedback (ISSUE-015).
					if (popupClosed) {
						cleanup();
						opts.onError('Sign-in cancelled. You can try again.');
						return;
					}
				} catch (err) {
					if (cancelled || succeeded || timedOut || pinExpired || callbackInProgress) return;
					cleanup();
					opts.onError(err instanceof Error ? err.message : 'Login failed');
				}
			};

			pollIntervalId = timers.setInterval(runPoll, POLL_INTERVAL_MS);

			// Latency optimization (DF-05): the popup completion page broadcasts
			// `login-complete` once the session is active. On that signal, poll the
			// server NOW instead of waiting for the next 2s tick. The same runPoll /
			// finished guards apply, so the server response stays authoritative and a
			// forged message can at most trigger one extra (harmless) poll.
			//
			// Channel creation is an optional latency hint: if it throws (e.g.
			// BroadcastChannel rejects in a partitioned/blocked-storage context),
			// isolate the failure so the poll-only path established above keeps
			// running cleanly instead of bubbling into the outer catch — which would
			// fire a spurious onError and leave the poll interval uncleared.
			try {
				authChannel = createBroadcastChannel();
				if (authChannel) {
					authChannel.onmessage = async (event) => {
						if (finished) return;
						const data = event?.data as { type?: unknown } | null;
						if (data && data.type === 'login-complete') {
							await runPoll();
						}
					};
				}
			} catch {
				authChannel = null;
			}

			timeoutId = timers.setTimeout(() => {
				if (finished) return;
				timedOut = true;
				cleanup();
				opts.onError('Authentication timed out. Please try again.');
			}, LOGIN_TIMEOUT_MS);
		} catch (err) {
			if (cancelled) return;
			opts.onError(err instanceof Error ? err.message : 'Login failed');
		}
	})();

	return {
		cancel() {
			cancelled = true;
			authWindow?.close();
			cleanup();
		}
	};
}

export async function startPlexLoginRedirect(opts: PlexLoginRedirectOptions): Promise<void> {
	try {
		const location = opts.location ?? window.location;
		const storage = opts.storage ?? sessionStorage;
		// Carry the post-login target as a query param on the same-origin callback
		// URL. parsePinForwardUrl (server) enforces same-origin on the whole URL, and
		// both the redirect load and the landing page re-validate returnTo before use.
		const callbackBase = `${location.origin}/auth/plex/redirect`;
		const redirectUrl =
			opts.returnTo && isSafeReturnPath(opts.returnTo)
				? `${callbackBase}?returnTo=${encodeURIComponent(opts.returnTo)}`
				: callbackBase;
		const { pinId, authUrl } = await fetchPin(redirectUrl);
		storePinForRedirect(pinId, opts.context, storage);
		location.href = authUrl;
	} catch (err) {
		opts.onError(err instanceof Error ? err.message : 'Failed to initiate login');
	}
}

export function commitRedirectFromPopupBlocked(
	pinId: number,
	authUrl: string,
	context: PlexLoginContext
): void {
	try {
		storePinForRedirect(pinId, context);
	} catch {
		throw new Error(
			'Unable to save login state. Storage may be blocked. Please enable cookies/storage for this site.'
		);
	}
	window.location.href = authUrl;
}
