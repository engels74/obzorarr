import { error, isRedirect, json, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { completePlexPinLogin } from '$lib/server/auth/login-completion';
import {
	appendPinStateToForwardUrl,
	createPinTransaction,
	parsePinForwardUrl
} from '$lib/server/auth/pin-transactions';
import { buildPlexOAuthUrl, requestPin } from '$lib/server/auth/plex-oauth';
import { NotServerMemberError, PinExpiredError, PlexAuthApiError } from '$lib/server/auth/types';
import { logger } from '$lib/server/logging';
import { OnboardingClaimRequiredError } from '$lib/server/onboarding';
import type { RequestHandler } from './$types';

const PollRequestSchema = z.object({
	pinId: z.number().int().positive()
});

// The PIN JSON / OAuth URL carry short-lived credentials; keep them out of any
// browser or proxy cache. Mirrors the NO_STORE_HEADERS pattern used by other
// sensitive endpoints (see api/security/reverse-proxy-diagnostic/+server.ts).
const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' };

export const GET: RequestHandler = async ({ cookies, url, request, setHeaders }) => {
	// Fetch-metadata content negotiation (ISSUE-002). The homepage keeps a no-JS
	// `<a href="/auth/plex">` sign-in fallback. A real top-level navigation must
	// NOT dump the raw PIN JSON to the page — it should start the OAuth flow and
	// redirect to Plex. A `fetch()`/XHR caller (the JS sign-in button) still gets
	// the JSON PIN payload unchanged. Detection is via Sec-Fetch-Dest, a
	// browser-set fetch-metadata hint. This is a UX convenience, not a security
	// boundary: a non-browser client can set the header freely, but both branches
	// mint the same PIN/cookie and the redirect only targets the (non-sensitive)
	// Plex OAuth URL, so spoofing it grants no elevated access.
	const fetchDest = request.headers.get('sec-fetch-dest');
	const isDocumentNavigation = fetchDest === 'document';
	const isPrefetch = (request.headers.get('sec-purpose') ?? '').toLowerCase().includes('prefetch');

	// Link prefetch of the no-JS sign-in anchor must not burn a PIN: short-circuit
	// before any stateful work. The real navigation (non-prefetch) mints normally.
	if (isPrefetch) {
		return new Response(null, { status: 204, headers: NO_STORE_HEADERS });
	}

	// Applies to the eventual response regardless of whether this handler returns
	// JSON or throws the redirect() below, keeping minted PIN credentials uncached.
	setHeaders(NO_STORE_HEADERS);

	try {
		const redirectUrl = url.searchParams.get('redirectUrl') ?? `${url.origin}/auth/plex/redirect`;
		parsePinForwardUrl(redirectUrl, url);

		const pin = await requestPin();
		const state = await createPinTransaction(pin.id, cookies);
		const forwardUrl = appendPinStateToForwardUrl(redirectUrl, url, state);
		const pinInfo = {
			pinId: pin.id,
			code: pin.code,
			authUrl: buildPlexOAuthUrl(pin.code, forwardUrl),
			expiresAt: pin.expiresAt ?? new Date(Date.now() + 15 * 60 * 1000).toISOString()
		};

		// Document navigation (no-JS / hard link click): the PIN + cookie are now
		// minted, so send the browser straight to the Plex OAuth URL instead of
		// rendering JSON. SvelteKit's redirect() throws; it is rethrown past the
		// catch below via isRedirect() so it is not mistaken for a 500.
		if (isDocumentNavigation) {
			redirect(303, pinInfo.authUrl);
		}

		return json(pinInfo);
	} catch (err) {
		if (isRedirect(err)) {
			throw err;
		}

		if (
			err instanceof TypeError ||
			(err instanceof Error && err.message.includes('redirect URL'))
		) {
			error(400, {
				message: 'Invalid redirect URL'
			});
		}

		if (err instanceof PlexAuthApiError) {
			logger.error('Plex OAuth PIN request failed', 'Auth', {
				statusCode: err.statusCode,
				endpoint: err.endpoint
			});
			error(502, {
				message: 'Unable to connect to Plex. Please try again.'
			});
		}

		logger.error('Unexpected error in PIN request', 'Auth', {
			errorType: err instanceof Error ? err.name : typeof err
		});
		error(500, {
			message: 'An unexpected error occurred.'
		});
	}
};

export const POST: RequestHandler = async ({ request, cookies, url }) => {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		error(400, { message: 'Invalid JSON body' });
	}

	const parseResult = PollRequestSchema.safeParse(body);
	if (!parseResult.success) {
		error(400, {
			message: 'Invalid request: pinId is required and must be a positive integer'
		});
	}

	const { pinId } = parseResult.data;

	try {
		return json(await completePlexPinLogin(pinId, cookies, { requestUrl: url }));
	} catch (err) {
		if (err instanceof PinExpiredError) {
			error(401, {
				message: err.message
			});
		}

		if (err instanceof PlexAuthApiError) {
			logger.error('Plex OAuth PIN poll failed', 'Auth', {
				statusCode: err.statusCode,
				endpoint: err.endpoint
			});
			error(502, {
				message: 'Unable to connect to Plex. Please try again.'
			});
		}

		if (err instanceof NotServerMemberError) {
			error(403, {
				message: err.message
			});
		}

		if (err instanceof OnboardingClaimRequiredError) {
			error(403, {
				message: err.message
			});
		}

		logger.error('Unexpected error in PIN poll', 'Auth', {
			errorType: err instanceof Error ? err.name : typeof err
		});
		error(500, {
			message: 'An unexpected error occurred.'
		});
	}
};
