import { error, fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { getFunFactFrequency } from '$lib/server/admin/settings.service';
import { db } from '$lib/server/db/client';
import { users } from '$lib/server/db/schema';
import { generateFunFacts } from '$lib/server/funfacts';
import { getLogoVisibility, setUserLogoPreference } from '$lib/server/logo';
import { checkTokenAccess, checkWrappedAccess } from '$lib/server/sharing/access-control';
import {
	ensureShareToken,
	getGlobalDefaultShareMode,
	getOrCreateShareSettings,
	isValidTokenFormat,
	regenerateShareToken,
	updateShareSettings
} from '$lib/server/sharing/service';
import {
	getMoreRestrictiveMode,
	InvalidShareTokenError,
	PermissionExceededError,
	ShareAccessDeniedError,
	ShareMode,
	ShareModeSchema
} from '$lib/server/sharing/types';
import {
	buildSlideRenderConfigs,
	customSlidesToMap,
	getEnabledCustomSlides,
	getEnabledSlides,
	initializeDefaultSlideConfig,
	intersperseFunFacts,
	renderMarkdownSync
} from '$lib/server/slides';
import { calculateUserStats } from '$lib/server/stats/engine';
import { triggerLiveSyncIfNeeded } from '$lib/server/sync/live-sync';
import { hasWatchHistory } from '$lib/stats/types';
import type { Actions, PageServerLoad } from './$types';

async function resolveUserIdFromIdentifier(
	identifier: string,
	year: number
): Promise<number | null> {
	if (isValidTokenFormat(identifier)) {
		try {
			const tokenResult = await checkTokenAccess(identifier);
			return tokenResult.year === year ? tokenResult.userId : null;
		} catch (err) {
			if (err instanceof InvalidShareTokenError || err instanceof ShareAccessDeniedError) {
				return null;
			}
			throw err;
		}
	}

	const userId = parseInt(identifier, 10);
	return Number.isNaN(userId) || userId <= 0 ? null : userId;
}

export const load: PageServerLoad = async ({ params, locals, parent }) => {
	const year = parseInt(params.year, 10);
	if (Number.isNaN(year) || year < 2000 || year > 2100) {
		error(404, 'Invalid year');
	}

	triggerLiveSyncIfNeeded('user-wrapped').catch(() => {});

	const { identifier } = params;
	let userId: number;
	let accessedViaToken = false;

	if (isValidTokenFormat(identifier)) {
		accessedViaToken = true;
		try {
			const tokenResult = await checkTokenAccess(identifier);
			userId = tokenResult.userId;

			// Verify year matches the token's year
			if (tokenResult.year !== year) {
				error(404, 'This share link is invalid, expired, or has been revoked.');
			}
		} catch (err) {
			if (err instanceof InvalidShareTokenError) {
				error(404, 'This share link is invalid, expired, or has been revoked.');
			}
			if (err instanceof ShareAccessDeniedError) {
				error(403, err.message);
			}
			throw err;
		}
	} else {
		const parsedId = parseInt(identifier, 10);
		if (Number.isNaN(parsedId) || parsedId <= 0) {
			error(404, "We couldn't find a Wrapped page for that link.");
		}
		userId = parsedId;

		try {
			await checkWrappedAccess({
				userId,
				year,
				currentUser: locals.user
			});
		} catch (err) {
			if (err instanceof ShareAccessDeniedError) {
				error(403, err.message);
			}
			if (err instanceof InvalidShareTokenError) {
				error(404, 'This share link is invalid, expired, or has been revoked.');
			}
			throw err;
		}
	}

	const userResult = await db.select().from(users).where(eq(users.id, userId)).limit(1);

	const user = userResult[0];
	if (!user) {
		error(404, 'User not found');
	}

	const statsAccountId = user.accountId ?? user.plexId;
	const stats = await calculateUserStats(statsAccountId, year);
	const userHasWatchHistory = hasWatchHistory(stats);

	let yearIdentifiers: Record<number, string | number> | undefined;

	if (accessedViaToken) {
		const parentData = await parent();
		const availableYears = parentData.availableYears;
		yearIdentifiers = {};

		for (const availYear of availableYears) {
			yearIdentifiers[availYear] = availYear === year ? identifier : userId;
		}
	}

	await initializeDefaultSlideConfig();
	const [slideConfigs, customSlides] = await Promise.all([
		getEnabledSlides(),
		getEnabledCustomSlides(year)
	]);

	const customSlidesWithHtml = customSlides.map((slide) => ({
		...slide,
		renderedHtml: renderMarkdownSync(slide.content)
	}));
	const baseSlides = buildSlideRenderConfigs(slideConfigs, customSlidesWithHtml);
	const customSlidesMap = customSlidesToMap(customSlidesWithHtml);

	const frequencyConfig = await getFunFactFrequency();
	let funFacts: Awaited<ReturnType<typeof generateFunFacts>> = [];
	if (userHasWatchHistory) {
		try {
			funFacts = await generateFunFacts(stats, { count: frequencyConfig.count });
		} catch (err) {
			console.warn('Failed to generate fun facts:', err);
		}
	}

	const slides = intersperseFunFacts(baseSlides, funFacts);

	const logoVisibility = await getLogoVisibility(userId, year);
	const shareSettings = await getOrCreateShareSettings({ userId, year });

	const isOwner = locals.user?.id === userId;
	const isAdmin = locals.user?.isAdmin ?? false;

	const globalFloorForUrl = await getGlobalDefaultShareMode();
	const effectiveModeForUrl = getMoreRestrictiveMode(shareSettings.mode, globalFloorForUrl);
	const urlIdentifier =
		effectiveModeForUrl === ShareMode.PRIVATE_LINK
			? (shareSettings.shareToken ?? (await ensureShareToken(userId, year)))
			: userId;

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
		hasWatchHistory: userHasWatchHistory,
		shareSettings: {
			mode: shareSettings.mode,
			storedMode: shareSettings.storedMode,
			modeSource: shareSettings.modeSource,
			shareToken: shareSettings.shareToken,
			canUserControl: shareSettings.canUserControl || isAdmin
		},
		isOwner,
		isAdmin,
		isLoggedIn: !!locals.user,
		globalFloor: globalFloorForUrl,
		currentUrl: `/wrapped/${year}/u/${urlIdentifier}`,
		yearIdentifiers
	};
};

export const actions: Actions = {
	toggleLogo: async ({ request, params, locals }) => {
		if (!locals.user) {
			return fail(401, { error: 'Authentication required' });
		}

		const year = parseInt(params.year, 10);
		if (Number.isNaN(year)) {
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
		if (Number.isNaN(year)) {
			return fail(400, { error: 'Invalid year' });
		}

		const userId = await resolveUserIdFromIdentifier(params.identifier, year);
		if (!userId) {
			return fail(400, { error: 'Invalid user identifier' });
		}

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
					storedMode: updated.storedMode,
					modeSource: updated.modeSource,
					shareToken: updated.shareToken,
					canUserControl: updated.canUserControl || locals.user.isAdmin
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
		if (!locals.user) {
			return fail(401, { error: 'Authentication required' });
		}

		const year = parseInt(params.year, 10);
		if (Number.isNaN(year)) {
			return fail(400, { error: 'Invalid year' });
		}

		const userId = await resolveUserIdFromIdentifier(params.identifier, year);
		if (!userId) {
			return fail(400, { error: 'Invalid user identifier' });
		}

		try {
			if (locals.user.id !== userId && !locals.user.isAdmin) {
				return fail(403, { error: 'Not authorized to change share settings' });
			}

			const settings = await getOrCreateShareSettings({ userId, year });
			const canControl = settings.canUserControl || locals.user.isAdmin;
			if (!canControl) {
				return fail(403, { error: 'You do not have permission to change share settings.' });
			}

			if (settings.mode !== ShareMode.PRIVATE_LINK) {
				return fail(400, { error: 'Can only regenerate token for private-link mode' });
			}

			const newToken = await regenerateShareToken(userId, year);
			return {
				success: true,
				shareToken: newToken,
				shareSettings: {
					mode: settings.mode,
					storedMode: settings.storedMode,
					modeSource: settings.modeSource,
					shareToken: newToken,
					canUserControl: canControl
				}
			};
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to regenerate token';
			return fail(500, { error: message });
		}
	}
};
