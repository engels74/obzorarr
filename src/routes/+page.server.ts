import { fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { checkRateLimit } from '$lib/server/ratelimit';
import { getEffectiveShareMode } from '$lib/server/sharing/service';
import { ShareMode } from '$lib/server/sharing/types';
import { triggerLiveSyncIfNeeded } from '$lib/server/sync/live-sync';
import { findUserByUsername } from '$lib/server/sync/plex-accounts.service';
import type { Actions, PageServerLoad } from './$types';

const UsernameSchema = z.object({
	username: z
		.string()
		.transform((val) => val.trim())
		.pipe(z.string().min(1, 'Username is required').max(100, 'Username is too long'))
});

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) {
		redirect(303, locals.user.isAdmin ? '/admin' : '/dashboard');
	}

	return {
		currentYear: new Date().getFullYear()
	};
};

export const actions: Actions = {
	lookupUser: async ({ request, getClientAddress, setHeaders }) => {
		const ip = getClientAddress();

		const rateLimitResult = checkRateLimit(ip);
		if (!rateLimitResult.allowed) {
			if (rateLimitResult.retryAfter != null) {
				setHeaders({ 'Retry-After': rateLimitResult.retryAfter.toString() });
			}
			return fail(429, {
				error: 'Too many requests. Please try again later.',
				retryAfter: rateLimitResult.retryAfter,
				username: '',
				requiresAuth: false
			});
		}

		const formData = await request.formData();
		const rawUsername = formData.get('username')?.toString() ?? '';

		const parsed = UsernameSchema.safeParse({ username: rawUsername });
		if (!parsed.success) {
			return fail(400, {
				error: parsed.error.issues[0]?.message ?? 'Invalid username',
				username: rawUsername,
				requiresAuth: false
			});
		}

		const { username } = parsed.data;

		const userResult = await findUserByUsername(username, { createIfMissing: false });
		const currentYear = new Date().getFullYear();
		const publicLookupFailure = {
			error: 'No public Wrapped found for that username.',
			username,
			requiresAuth: true
		};

		if (!userResult) {
			return fail(404, publicLookupFailure);
		}

		const effectiveMode = await getEffectiveShareMode(userResult.userId, currentYear);
		if (effectiveMode !== ShareMode.PUBLIC) {
			return fail(404, publicLookupFailure);
		}

		triggerLiveSyncIfNeeded('landing-page-lookup').catch(() => {});

		redirect(303, `/wrapped/${currentYear}/u/${userResult.userId}`);
	}
};
