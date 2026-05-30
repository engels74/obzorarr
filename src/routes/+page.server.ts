import { fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { getPublicLandingLookupEnabled } from '$lib/server/admin/settings.service';
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

	// The toggle is the SOLE visibility gate (decision D1): the form renders iff
	// the admin opted in, independent of the default share mode. A contradictory
	// config (toggle on + non-public default) is surfaced to the admin as a
	// warning in settings/onboarding rather than hidden from visitors here.
	return {
		currentYear: new Date().getFullYear(),
		publicLookupEnabled: await getPublicLandingLookupEnabled(),
		loginHref: '/auth/plex'
	};
};

export const actions: Actions = {
	lookupUser: async ({ request, cookies }) => {
		// Defense in depth: the template hides the form when the toggle is off, but
		// a crafted POST would still reach this action. Refuse before doing any
		// lookup work. The per-user getEffectiveShareMode 404 below remains the
		// deepest data gate regardless of this toggle.
		if (!(await getPublicLandingLookupEnabled())) {
			logger.debug('Rejected landing lookup: public lookup is disabled', 'LandingLookup');
			return fail(403, {
				error: 'Public lookup is disabled on this server.',
				requiresAuth: true
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
