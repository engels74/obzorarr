import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, request, url }) => {
	if (locals.user) {
		redirect(303, locals.user.isAdmin ? '/admin' : '/dashboard');
	}

	const referer = request.headers.get('referer');
	const fromPlex = referer?.startsWith('https://app.plex.tv') ?? false;
	const fromSameOrigin = referer?.startsWith(url.origin) ?? false;

	if (!fromPlex && !fromSameOrigin) {
		redirect(303, '/');
	}

	return {};
};
