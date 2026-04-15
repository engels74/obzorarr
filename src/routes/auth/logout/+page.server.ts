import { redirect } from '@sveltejs/kit';
import { logout } from '$lib/server/auth/logout';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies }) => {
	await logout(cookies);
	throw redirect(303, '/');
};

export const actions: Actions = {
	default: async ({ cookies }) => {
		await logout(cookies);
		throw redirect(303, '/');
	}
};
