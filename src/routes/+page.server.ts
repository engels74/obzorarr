import { fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { logger } from '$lib/server/logging';
import { getEffectiveShareMode } from '$lib/server/sharing/service';
import { ShareMode } from '$lib/server/sharing/types';
import { triggerLiveSyncIfNeeded } from '$lib/server/sync/live-sync';
import { findUserByUsername } from '$lib/server/sync/plex-accounts.service';
import type { Actions, PageServerLoad } from './$types';

const LOOKUP_LIVE_SYNC_COOKIE = 'lookup_live_sync';
const LOOKUP_LIVE_SYNC_COOKIE_MAX_AGE_SECONDS = 60;

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
	lookupUser: async ({ request, cookies }) => {
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

		try {
			const liveSyncResult = await triggerLiveSyncIfNeeded('landing-page-lookup');

			if (liveSyncResult.reason === 'error') {
				logger.warn('Lookup-triggered live sync failed to start', 'LandingLookup');
			}

			if (liveSyncResult.triggered || liveSyncResult.syncInProgress) {
				cookies.set(LOOKUP_LIVE_SYNC_COOKIE, '1', {
					path: '/wrapped',
					httpOnly: true,
					sameSite: 'lax',
					maxAge: LOOKUP_LIVE_SYNC_COOKIE_MAX_AGE_SECONDS
				});
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			logger.error(`Lookup-triggered live sync failed: ${message}`, 'LandingLookup');
		}

		redirect(303, `/wrapped/${currentYear}/u/${userResult.userId}`);
	}
};
