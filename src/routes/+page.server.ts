import { fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { checkRateLimit } from '$lib/server/ratelimit';
import { getGlobalDefaultShareMode, getOrCreateShareSettings } from '$lib/server/sharing/service';
import { getMoreRestrictiveMode, ShareMode } from '$lib/server/sharing/types';
import { triggerLiveSyncIfNeeded } from '$lib/server/sync/live-sync';
import { findUserByUsername } from '$lib/server/sync/plex-accounts.service';
import type { Actions, PageServerLoad } from './$types';

const UsernameSchema = z.object({
	username: z
		.string()
		.min(1, 'Username is required')
		.max(100, 'Username is too long')
		.transform((val) => val.trim())
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
	lookupUser: async ({ request, getClientAddress }) => {
		const ip = getClientAddress();

		const rateLimitResult = checkRateLimit(ip);
		if (!rateLimitResult.allowed) {
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

		const userResult = await findUserByUsername(username);

		if (!userResult) {
			return fail(404, {
				error: 'User not found. Make sure you have signed into Obzorarr at least once.',
				username,
				requiresAuth: true
			});
		}

		const currentYear = new Date().getFullYear();

		triggerLiveSyncIfNeeded('landing-page-lookup').catch(() => {});

		const shareSettings = await getOrCreateShareSettings({
			userId: userResult.userId,
			year: currentYear
		});
		const globalFloor = await getGlobalDefaultShareMode();
		const effectiveMode = getMoreRestrictiveMode(shareSettings.mode, globalFloor);

		if (effectiveMode === ShareMode.PRIVATE_LINK && shareSettings.shareToken) {
			redirect(303, `/wrapped/${currentYear}/u/${shareSettings.shareToken}`);
		}

		redirect(303, `/wrapped/${currentYear}/u/${userResult.userId}`);
	}
};
