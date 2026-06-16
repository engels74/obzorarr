import { fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { getWrappedLogoMode, WrappedLogoMode } from '$lib/server/admin/settings.service';
import { getUserFullProfile } from '$lib/server/admin/users.service';
import { db } from '$lib/server/db/client';
import { sessions } from '$lib/server/db/schema';
import {
	getGlobalDefaultShareMode,
	getOrCreateShareSettings,
	getOwnerWrappedHref,
	getShareSettings,
	getUserLogoPreference,
	regenerateShareToken,
	updateShareSettings,
	updateUserLogoPreference
} from '$lib/server/sharing/service';
import { PermissionExceededError } from '$lib/server/sharing/types';
import type { Actions, PageServerLoad } from './$types';

const ShareModeSchema = z.enum(['public', 'private-oauth', 'private-link']);
const LogoPreferenceSchema = z.enum(['show', 'hide']);

async function getSessionExpiration(userId: number): Promise<Date | null> {
	const result = await db
		.select({ expiresAt: sessions.expiresAt })
		.from(sessions)
		.where(eq(sessions.userId, userId))
		.limit(1);

	return result[0]?.expiresAt ?? null;
}

export const load: PageServerLoad = async ({ locals, setHeaders }) => {
	// The floor message and disabled-radio state are derived from the live
	// global default share mode (admin-controlled). Browsers MUST refetch on
	// every navigation, otherwise the page renders with a stale floor when the
	// admin flips the global default in another tab.
	setHeaders({ 'cache-control': 'no-store' });

	const userId = locals.user!.id;
	const currentYear = new Date().getFullYear();

	// ISSUE-001: resolve/create the (userId, currentYear) share row FIRST, before
	// getOwnerWrappedHref (which resolves it again via getShareIdentifier). Running
	// both inside one Promise.all raced two getOrCreateShareSettings inserts into
	// duplicate rows, which then tripped the public_slug unique constraint and 500'd
	// this page for brand-new users. The onConflictDoNothing upsert is the structural
	// fix; this sequencing keeps the hot path single-create as belt-and-suspenders.
	const shareSettings = await getOrCreateShareSettings({ userId, year: currentYear });

	const [
		userProfile,
		wrappedLogoMode,
		userLogoPreference,
		sessionExpiration,
		globalFloor,
		wrappedHref
	] = await Promise.all([
		getUserFullProfile(userId),
		getWrappedLogoMode(),
		getUserLogoPreference(userId, currentYear),
		getSessionExpiration(userId),
		getGlobalDefaultShareMode(),
		getOwnerWrappedHref(userId, currentYear)
	]);

	return {
		user: {
			id: userProfile?.id ?? userId,
			plexId: userProfile?.plexId ?? locals.user!.plexId ?? null,
			username: userProfile?.username ?? locals.user!.username,
			email: userProfile?.email ?? null,
			thumb: userProfile?.thumb ?? null,
			createdAt: userProfile?.createdAt ?? null
		},
		shareSettings: {
			mode: shareSettings.mode,
			shareToken: shareSettings.shareToken,
			canUserControl: shareSettings.canUserControl
		},
		userLogoPreference,
		wrappedLogoMode,
		canControlLogo: wrappedLogoMode === WrappedLogoMode.USER_CHOICE,
		currentYear,
		sessionExpiresAt: sessionExpiration,
		globalFloor,
		wrappedHref
	};
};

export const actions: Actions = {
	updateShareMode: async ({ request, locals }) => {
		const userId = locals.user!.id;
		const currentYear = new Date().getFullYear();

		const formData = await request.formData();
		const mode = formData.get('mode');

		const parsed = ShareModeSchema.safeParse(mode);
		if (!parsed.success) {
			const existing = await getShareSettings(userId, currentYear).catch(() => null);
			return fail(400, {
				error: 'Invalid share mode',
				action: 'updateShareMode',
				currentMode: existing?.mode
			});
		}

		let currentMode: string | undefined;

		try {
			const shareSettings = await getOrCreateShareSettings({ userId, year: currentYear });
			currentMode = shareSettings.mode;

			if (!shareSettings.canUserControl) {
				return fail(403, {
					error: 'You do not have permission to change sharing settings',
					action: 'updateShareMode',
					currentMode: shareSettings.mode
				});
			}

			// Floor enforcement is centralized in updateShareSettings (applies to
			// every caller, admins included). It throws PermissionExceededError
			// when the submitted mode is below the server-wide floor.
			await updateShareSettings(userId, currentYear, { mode: parsed.data }, false);

			return { success: true, message: 'Sharing settings updated', action: 'updateShareMode' };
		} catch (error) {
			if (error instanceof PermissionExceededError) {
				return fail(403, {
					error: error.message,
					action: 'updateShareMode',
					currentMode
				});
			}
			const message = error instanceof Error ? error.message : 'Failed to update settings';
			return fail(500, { error: message, action: 'updateShareMode', currentMode });
		}
	},

	regenerateToken: async ({ locals }) => {
		const userId = locals.user!.id;
		const currentYear = new Date().getFullYear();

		try {
			const shareSettings = await getOrCreateShareSettings({ userId, year: currentYear });

			if (!shareSettings.canUserControl) {
				return fail(403, {
					error: 'You do not have permission to change sharing settings',
					action: 'regenerateToken'
				});
			}

			if (shareSettings.mode !== 'private-link') {
				return fail(400, {
					error: 'Can only regenerate token when in private-link mode',
					action: 'regenerateToken'
				});
			}

			const shareToken = await regenerateShareToken(userId, currentYear);
			const wrappedHref = await getOwnerWrappedHref(userId, currentYear);

			return {
				success: true,
				message: 'Share link regenerated',
				action: 'regenerateToken',
				shareToken,
				wrappedHref
			};
		} catch (error) {
			if (error instanceof PermissionExceededError) {
				return fail(403, { error: error.message, action: 'regenerateToken' });
			}
			const message = error instanceof Error ? error.message : 'Failed to regenerate token';
			return fail(500, { error: message, action: 'regenerateToken' });
		}
	},

	updateLogoPreference: async ({ request, locals }) => {
		const userId = locals.user!.id;
		const currentYear = new Date().getFullYear();

		const formData = await request.formData();
		const preference = formData.get('logoPreference');

		const parsed = LogoPreferenceSchema.safeParse(preference);
		if (!parsed.success) {
			return fail(400, { error: 'Invalid logo preference', action: 'updateLogoPreference' });
		}

		try {
			const wrappedLogoMode = await getWrappedLogoMode();
			if (wrappedLogoMode !== WrappedLogoMode.USER_CHOICE) {
				return fail(403, {
					error: 'Logo visibility is controlled by the server administrator',
					action: 'updateLogoPreference'
				});
			}

			const showLogo = parsed.data === 'show';
			await updateUserLogoPreference(userId, currentYear, showLogo);

			return {
				success: true,
				message: 'Logo preference updated',
				action: 'updateLogoPreference'
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to update preference';
			return fail(500, { error: message, action: 'updateLogoPreference' });
		}
	}
};
