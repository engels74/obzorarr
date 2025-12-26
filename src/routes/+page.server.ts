import { redirect, fail } from '@sveltejs/kit';
import { z } from 'zod';
import type { PageServerLoad, Actions } from './$types';
import { checkRateLimit } from '$lib/server/ratelimit';
import { findUserByUsername } from '$lib/server/sync/plex-accounts.service';
import { checkWrappedAccess } from '$lib/server/sharing/access-control';
import { ShareAccessDeniedError, InvalidShareTokenError } from '$lib/server/sharing/types';
import { triggerLiveSyncIfNeeded } from '$lib/server/sync/live-sync';

/**
 * Landing Page Server
 *
 * Handles the public landing page with:
 * - Username-based quick access to wrapped pages (primary CTA)
 * - Redirect authenticated users to appropriate dashboard
 *
 * Implements Requirements:
 * - 14.1: Router serves public landing page at `/`
 */

// =============================================================================
// Validation Schemas
// =============================================================================

const UsernameSchema = z.object({
	username: z
		.string()
		.min(1, 'Username is required')
		.max(100, 'Username is too long')
		.transform((val) => val.trim())
});

// =============================================================================
// Load Function
// =============================================================================

export const load: PageServerLoad = async ({ locals }) => {
	// Redirect authenticated users to their appropriate dashboard
	if (locals.user) {
		redirect(303, locals.user.isAdmin ? '/admin' : '/dashboard');
	}

	return {
		currentYear: new Date().getFullYear()
	};
};

// =============================================================================
// Form Actions
// =============================================================================

export const actions: Actions = {
	/**
	 * Look up a user by their Plex username and redirect to their wrapped page.
	 *
	 * Flow:
	 * 1. Rate limit check (10 requests/minute/IP)
	 * 2. Validate username input
	 * 3. Look up user in database
	 * 4. Check wrapped access permissions
	 * 5. Redirect to wrapped page or return appropriate error
	 */
	lookupUser: async ({ request, getClientAddress }) => {
		const ip = getClientAddress();

		// Step 1: Rate limiting check
		const rateLimitResult = checkRateLimit(ip);
		if (!rateLimitResult.allowed) {
			return fail(429, {
				error: 'Too many requests. Please try again later.',
				retryAfter: rateLimitResult.retryAfter,
				requiresAuth: false,
				username: ''
			});
		}

		// Step 2: Parse and validate form data
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

		// Step 3: Look up user by username
		const userResult = await findUserByUsername(username);

		if (!userResult) {
			// Generic message to protect against username enumeration
			return fail(404, {
				error: 'User not found. Make sure you have signed into Obzorarr at least once.',
				username,
				requiresAuth: false
			});
		}

		// Step 4: Get current year for redirect
		const currentYear = new Date().getFullYear();

		// Step 5: Check access permissions
		try {
			await checkWrappedAccess({
				userId: userResult.userId,
				year: currentYear,
				currentUser: undefined // Anonymous access attempt
			});

			// Trigger live sync in background (fire-and-forget)
			triggerLiveSyncIfNeeded('landing-page-lookup').catch(() => {});

			// Access allowed - redirect to wrapped page
			redirect(303, `/wrapped/${currentYear}/u/${userResult.userId}`);
		} catch (err) {
			if (err instanceof ShareAccessDeniedError) {
				// Return friendly message with requiresAuth flag for UI
				return fail(403, {
					error: "This user's wrapped page requires authentication. Please sign in with Plex.",
					requiresAuth: true,
					username
				});
			}
			if (err instanceof InvalidShareTokenError) {
				// User's share mode is private-link but no token was provided
				// This happens when trying to access via username lookup instead of share link
				return fail(403, {
					error: "This user's wrapped page is private and requires a share link.",
					requiresAuth: false,
					username
				});
			}
			throw err;
		}
	}
};
