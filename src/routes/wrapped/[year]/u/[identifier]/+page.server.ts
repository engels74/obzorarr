import { error, fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { PageServerLoad, Actions } from './$types';
import { db } from '$lib/server/db/client';
import { users } from '$lib/server/db/schema';
import { calculateUserStats } from '$lib/server/stats/engine';
import { checkTokenAccess } from '$lib/server/sharing/access-control';
import {
	isValidTokenFormat,
	getOrCreateShareSettings,
	updateShareSettings,
	regenerateShareToken
} from '$lib/server/sharing/service';
import {
	InvalidShareTokenError,
	PermissionExceededError,
	ShareModeSchema
} from '$lib/server/sharing/types';
import {
	initializeDefaultSlideConfig,
	getEnabledSlides,
	getEnabledCustomSlides,
	buildSlideRenderConfigs,
	customSlidesToMap,
	intersperseFunFacts
} from '$lib/server/slides';
import { generateFunFacts } from '$lib/server/funfacts';
import { getLogoVisibility, setUserLogoPreference } from '$lib/server/logo';
import { getFunFactFrequency } from '$lib/server/admin/settings.service';
import { triggerLiveSyncIfNeeded } from '$lib/server/sync/live-sync';

export const load: PageServerLoad = async ({ params, locals }) => {
	const year = parseInt(params.year, 10);
	if (isNaN(year) || year < 2000 || year > 2100) {
		error(404, 'Invalid year');
	}

	// Trigger live sync in background (fire-and-forget)
	triggerLiveSyncIfNeeded('user-wrapped').catch(() => {});

	const { identifier } = params;
	let userId: number;

	// Detect if identifier is a share token (UUID) or user ID (number)
	if (isValidTokenFormat(identifier)) {
		try {
			const tokenResult = await checkTokenAccess(identifier);
			userId = tokenResult.userId;

			// Verify year matches the token's year
			if (tokenResult.year !== year) {
				error(404, 'Wrapped not found');
			}
		} catch (err) {
			if (err instanceof InvalidShareTokenError) {
				error(404, 'Wrapped not found');
			}
			throw err;
		}
	} else {
		// User ID access (e.g., from username lookup) is always allowed
		// Share mode restrictions only apply to share token access
		const parsedId = parseInt(identifier, 10);
		if (isNaN(parsedId) || parsedId <= 0) {
			error(404, 'Invalid identifier');
		}
		userId = parsedId;
	}

	const userResult = await db.select().from(users).where(eq(users.id, userId)).limit(1);

	const user = userResult[0];
	if (!user) {
		error(404, 'User not found');
	}

	// Use accountId for stats queries (falls back to plexId for backward compatibility)
	// accountId is the Plex server's local ID, which may differ from plexId (Plex.tv ID)
	const statsAccountId = user.accountId ?? user.plexId;
	const stats = await calculateUserStats(statsAccountId, year);

	await initializeDefaultSlideConfig();
	const [slideConfigs, customSlides] = await Promise.all([
		getEnabledSlides(),
		getEnabledCustomSlides(year)
	]);

	const baseSlides = buildSlideRenderConfigs(slideConfigs, customSlides);
	const customSlidesMap = customSlidesToMap(customSlides);

	const frequencyConfig = await getFunFactFrequency();
	let funFacts: Awaited<ReturnType<typeof generateFunFacts>> = [];
	try {
		funFacts = await generateFunFacts(stats, { count: frequencyConfig.count });
	} catch (err) {
		console.warn('Failed to generate fun facts:', err);
	}

	const slides = intersperseFunFacts(baseSlides, funFacts);

	const logoVisibility = await getLogoVisibility(userId, year);
	const shareSettings = await getOrCreateShareSettings({ userId, year });

	const isOwner = locals.user?.id === userId;
	const isAdmin = locals.user?.isAdmin ?? false;

	return {
		stats,
		slides,
		customSlidesMap,
		year,
		userId,
		username: user.username,
		isServerWrapped: false,
		serverName: null,
		showLogo: logoVisibility.showLogo,
		canUserControlLogo: logoVisibility.canUserControl,
		shareSettings: {
			mode: shareSettings.mode,
			shareToken: shareSettings.shareToken,
			canUserControl: shareSettings.canUserControl || isAdmin
		},
		isOwner,
		isAdmin,
		currentUrl: `/wrapped/${year}/u/${userId}`
	};
};

export const actions: Actions = {
	toggleLogo: async ({ request, params, locals }) => {
		if (!locals.user) {
			return fail(401, { error: 'Authentication required' });
		}

		const year = parseInt(params.year, 10);
		if (isNaN(year)) {
			return fail(400, { error: 'Invalid year' });
		}

		const formData = await request.formData();
		const showLogoStr = formData.get('showLogo')?.toString();
		const showLogo = showLogoStr === 'true';

		try {
			await setUserLogoPreference(locals.user.id, year, showLogo);
			return { success: true };
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to update preference';
			return fail(500, { error: message });
		}
	},

	updateShareMode: async ({ request, params, locals }) => {
		if (!locals.user) {
			return fail(401, { error: 'Authentication required' });
		}

		const year = parseInt(params.year, 10);
		if (isNaN(year)) {
			return fail(400, { error: 'Invalid year' });
		}

		const userId = parseInt(params.identifier, 10);
		if (isNaN(userId) || userId <= 0) {
			return fail(400, { error: 'Invalid user identifier' });
		}

		// Verify ownership or admin status
		if (locals.user.id !== userId && !locals.user.isAdmin) {
			return fail(403, { error: 'Not authorized to change share settings' });
		}

		const formData = await request.formData();
		const modeValue = formData.get('mode')?.toString();

		const parseResult = ShareModeSchema.safeParse(modeValue);
		if (!parseResult.success) {
			return fail(400, { error: 'Invalid share mode' });
		}

		try {
			const updated = await updateShareSettings(
				userId,
				year,
				{ mode: parseResult.data },
				locals.user.isAdmin
			);
			return {
				success: true,
				shareSettings: {
					mode: updated.mode,
					shareToken: updated.shareToken,
					canUserControl: updated.canUserControl
				}
			};
		} catch (err) {
			if (err instanceof PermissionExceededError) {
				return fail(403, { error: err.message });
			}
			const message = err instanceof Error ? err.message : 'Failed to update share settings';
			return fail(500, { error: message });
		}
	},

	regenerateToken: async ({ params, locals }) => {
		if (!locals.user?.isAdmin) {
			return fail(403, { error: 'Admin access required' });
		}

		const year = parseInt(params.year, 10);
		if (isNaN(year)) {
			return fail(400, { error: 'Invalid year' });
		}

		const userId = parseInt(params.identifier, 10);
		if (isNaN(userId) || userId <= 0) {
			return fail(400, { error: 'Invalid user identifier' });
		}

		try {
			const newToken = await regenerateShareToken(userId, year);
			return { success: true, shareToken: newToken };
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to regenerate token';
			return fail(500, { error: message });
		}
	}
};
