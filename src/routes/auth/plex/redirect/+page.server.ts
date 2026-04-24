import { redirect } from '@sveltejs/kit';
import { markPinCallbackVerified } from '$lib/server/auth/pin-transactions';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies, locals, request, url }) => {
	if (locals.user) {
		redirect(303, locals.user.isAdmin ? '/admin' : '/dashboard');
	}

	const referer = request.headers.get('referer');
	let refererOrigin: string | null = null;
	if (referer) {
		try {
			refererOrigin = new URL(referer).origin.toLowerCase();
		} catch {
			refererOrigin = null;
		}
	}
	const fromPlex = refererOrigin === 'https://app.plex.tv';
	const fromSameOrigin = refererOrigin === url.origin.toLowerCase();

	// Allow missing/empty referer; sessionStorage PIN check on the client is the real gate.
	if (referer && !fromPlex && !fromSameOrigin) {
		redirect(303, '/');
	}

	return {
		flow: url.searchParams.get('flow') === 'popup' ? 'popup' : 'redirect',
		stateVerified: markPinCallbackVerified(cookies, url.searchParams.get('state'))
	};
};
