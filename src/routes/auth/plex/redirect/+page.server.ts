import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, request, url }) => {
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

	return {};
};
