/**
 * Shared client-side helpers for the Plex OAuth login flow.
 *
 * Two entry points share PIN-fetch and polling plumbing:
 *  - `startPlexLoginPopup`   — opens Plex.tv in a popup, polls for the auth token
 *    in the background, and finalises by exchanging the token at /auth/plex/callback.
 *  - `startPlexLoginRedirect` — same-tab navigation to Plex.tv with `forwardUrl`
 *    pointing back at /auth/plex/redirect; the redirect page then polls and
 *    completes the callback. Designed for headless / E2E automation that
 *    cannot reliably orchestrate popups.
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

export interface PlexLoginPopupOptions {
	context: PlexLoginContext;
	onSuccess: (user: PlexLoginUser) => void | Promise<void>;
	onError: (message: string) => void;
	onPopupBlocked: (pinId: number, authUrl: string) => void;
}

export interface PlexLoginRedirectOptions {
	context: PlexLoginContext;
	onError: (message: string) => void;
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
		const errData = (await response.json().catch(() => ({}))) as { message?: string };
		throw new Error(errData.message || 'Failed to initiate login');
	}
	return (await response.json()) as PinResponse;
}

function storePinForRedirect(pinId: number, context: PlexLoginContext): void {
	sessionStorage.setItem(
		PIN_STORAGE_KEY,
		JSON.stringify({ pinId, createdAt: Date.now(), context })
	);
}

export function startPlexLoginPopup(opts: PlexLoginPopupOptions): PlexLoginController {
	let pollIntervalId: ReturnType<typeof setInterval> | null = null;
	let timeoutId: ReturnType<typeof setTimeout> | null = null;
	let cancelled = false;
	let finished = false;
	let succeeded = false;
	let pinExpired = false;
	let timedOut = false;
	let authWindow: Window | null = null;

	const cleanup = () => {
		if (pollIntervalId) clearInterval(pollIntervalId);
		if (timeoutId) clearTimeout(timeoutId);
		pollIntervalId = null;
		timeoutId = null;
		authWindow?.close();
		finished = true;
	};

	const handlePopupBlocked = async () => {
		try {
			const redirectUrl = `${window.location.origin}/auth/plex/redirect`;
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

			authWindow = window.open(authUrl, 'plex-auth', 'width=600,height=700');

			if (!authWindow) {
				await handlePopupBlocked();
				return;
			}

			await new Promise((r) => setTimeout(r, 100));
			if (cancelled) return;
			if (authWindow.closed) {
				await handlePopupBlocked();
				return;
			}

			pollIntervalId = setInterval(async () => {
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

					const result = (await pollResponse.json()) as { pending: true } | { authToken: string };
					if (finished) return;

					if ('authToken' in result && result.authToken) {
						cleanup();

						const callbackResponse = await fetch('/auth/plex/callback', {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({ authToken: result.authToken })
						});

						if (!callbackResponse.ok) {
							const errData = (await callbackResponse.json().catch(() => ({}))) as {
								message?: string;
							};
							throw new Error(errData.message || 'Login failed');
						}

						const userData = (await callbackResponse.json()) as { user: PlexLoginUser };
						await opts.onSuccess(userData.user);
						succeeded = true;
					}
				} catch (err) {
					if (cancelled || succeeded || timedOut || pinExpired) return;
					cleanup();
					opts.onError(err instanceof Error ? err.message : 'Login failed');
				}
			}, POLL_INTERVAL_MS);

			timeoutId = setTimeout(() => {
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
		const redirectUrl = `${window.location.origin}/auth/plex/redirect`;
		const { pinId, authUrl } = await fetchPin(redirectUrl);
		storePinForRedirect(pinId, opts.context);
		window.location.href = authUrl;
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
