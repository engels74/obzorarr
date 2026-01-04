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
	getUserLogoPreference,
	regenerateShareToken,
	updateShareSettings,
	updateUserLogoPreference
} from '$lib/server/sharing/service';
import { meetsPrivacyFloor } from '$lib/server/sharing/types';
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

export const load: PageServerLoad = async ({ locals }) => {
	const userId = locals.user!.id;
	const currentYear = new Date().getFullYear();

	const [userProfile, shareSettings, wrappedLogoMode, userLogoPreference, sessionExpiration] =
		await Promise.all([
			getUserFullProfile(userId),
			getOrCreateShareSettings({ userId, year: currentYear }),
			getWrappedLogoMode(),
			getUserLogoPreference(userId, currentYear),
			getSessionExpiration(userId)
		]);

	return {
		user: {
			id: userProfile?.id ?? userId,
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
		sessionExpiresAt: sessionExpiration
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
			return fail(400, { error: 'Invalid share mode', action: 'updateShareMode' });
		}

		try {
			const shareSettings = await getOrCreateShareSettings({ userId, year: currentYear });

			if (!shareSettings.canUserControl) {
				return fail(403, {
					error: 'You do not have permission to change sharing settings',
					action: 'updateShareMode'
				});
			}

			// Check privacy floor
			const globalFloor = await getGlobalDefaultShareMode();
			if (!meetsPrivacyFloor(parsed.data, globalFloor)) {
				return fail(403, {
					error: `Cannot set share mode to "${parsed.data}". Server requires at least "${globalFloor}" privacy level.`,
					action: 'updateShareMode'
				});
			}

			await updateShareSettings(userId, currentYear, { mode: parsed.data }, false);

			return { success: true, message: 'Sharing settings updated', action: 'updateShareMode' };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to update settings';
			return fail(500, { error: message, action: 'updateShareMode' });
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

			await regenerateShareToken(userId, currentYear);

			return { success: true, message: 'Share link regenerated', action: 'regenerateToken' };
		} catch (error) {
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
