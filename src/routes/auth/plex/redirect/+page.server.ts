import { redirect } from '@sveltejs/kit';
import { verifyPinCallback } from '$lib/server/auth/pin-transactions';
import { requiresOnboarding } from '$lib/server/onboarding';
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

	// Allow missing/empty referer; callback state verification below gates the redirect flow.
	if (referer && !fromPlex && !fromSameOrigin) {
		redirect(303, '/');
	}

	const verifiedPin = await verifyPinCallback(cookies, url.searchParams.get('state'));

	return {
		flow: url.searchParams.get('flow') === 'popup' ? 'popup' : 'redirect',
		stateVerified: verifiedPin !== null,
		serverPinFallback: verifiedPin
			? {
					pinId: verifiedPin.pinId,
					expiresAt: verifiedPin.expiresAt.toISOString(),
					context: (await requiresOnboarding()) ? 'onboarding' : 'landing'
				}
			: null
	};
};
