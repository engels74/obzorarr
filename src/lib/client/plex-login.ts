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

export type PlexLoginContext = 'landing' | 'onboarding';

export interface PlexLoginUser {
	id?: number;
	plexId?: number;
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

export interface PlexLoginPopupOptions {
	context: PlexLoginContext;
	onSuccess: (user: PlexLoginUser) => void | Promise<void>;
	onError: (message: string) => void;
	onPopupBlocked: (pinId: number, authUrl: string) => void;
	window?: PopupWindowHost;
	timers?: LoginTimers;
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

function storePinForRedirect(
	pinId: number,
	context: PlexLoginContext,
	storage: RedirectStorage = sessionStorage
): void {
	storage.setItem(PIN_STORAGE_KEY, JSON.stringify({ pinId, createdAt: Date.now(), context }));
}

export function startPlexLoginPopup(opts: PlexLoginPopupOptions): PlexLoginController {
	const getBrowserWindow = (): PopupWindowHost => opts.window ?? window;
	const timers: LoginTimers = opts.timers ?? {
		setInterval: (callback, delay) => ({ id: setInterval(callback, delay) }),
		clearInterval: (handle) => clearInterval(handle.id as Parameters<typeof clearInterval>[0]),
		setTimeout: (callback, delay) => ({ id: setTimeout(callback, delay) }),
		clearTimeout: (handle) => clearTimeout(handle.id as Parameters<typeof clearTimeout>[0])
	};
	let pollIntervalId: LoginTimerHandle | null = null;
	let timeoutId: LoginTimerHandle | null = null;
	let cancelled = false;
	let finished = false;
	let succeeded = false;
	let callbackInProgress = false;
	let pinExpired = false;
	let timedOut = false;
	let authWindow: PopupWindowHandle | null = null;

	const cleanup = () => {
		if (pollIntervalId) timers.clearInterval(pollIntervalId);
		if (timeoutId) timers.clearTimeout(timeoutId);
		pollIntervalId = null;
		timeoutId = null;
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
			const { pinId, authUrl } = await fetchPin();
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

			pollIntervalId = timers.setInterval(async () => {
				try {
					if (finished) return;
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
						}
						return;
					}

					const result = (await pollResponse.json()) as { pending: true } | CompletedLoginResponse;
					if (finished) return;

					if ('user' in result && result.user) {
						callbackInProgress = true;
						cleanup();

						try {
							await opts.onSuccess(result.user);
							succeeded = true;
						} catch (err) {
							if (cancelled || succeeded || timedOut || pinExpired) return;
							opts.onError(err instanceof Error ? err.message : 'Login failed');
						}
					}
				} catch (err) {
					if (cancelled || succeeded || timedOut || pinExpired || callbackInProgress) return;
					cleanup();
					opts.onError(err instanceof Error ? err.message : 'Login failed');
				}
			}, POLL_INTERVAL_MS);

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
		const redirectUrl = `${location.origin}/auth/plex/redirect`;
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
