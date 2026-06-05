import { error, fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { getFunFactFrequency } from '$lib/server/admin/settings.service';
import { db } from '$lib/server/db/client';
import { users } from '$lib/server/db/schema';
import { generateFunFacts } from '$lib/server/funfacts';
import { getLogoVisibility, setUserLogoPreference } from '$lib/server/logo';
import { signStatsThumbnails } from '$lib/server/plex/thumbnail-auth';
import { checkTokenAccess, checkWrappedAccess } from '$lib/server/sharing/access-control';
import {
	ensureShareToken,
	getGlobalDefaultShareMode,
	getOrCreateShareSettings,
	getOwnerWrappedHref,
	isPureNumericId,
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

// Single source of truth for the anti-enumeration 404 body on the numeric
// identifier path. Every anonymous "cannot view" outcome (non-existent id,
// existing-but-private-oauth, existing-but-private-link-without-token) returns
// this exact status+body so an anonymous caller can't tell them apart (F-015 /
// ISSUE-001 uniform-404 contract).
const WRAPPED_NOT_FOUND_MESSAGE = "We couldn't find a Wrapped page for that link.";

async function resolveUserIdFromIdentifier(
	identifier: string,
	year: number,
	currentUser?: App.Locals['user']
): Promise<number | null> {
	if (isValidTokenFormat(identifier)) {
		try {
			// Forward currentUser so floor-elevated token URLs (e.g. global floor
			// raised above PRIVATE_LINK to PRIVATE_OAUTH) still resolve for signed-in
			// viewers. Mirrors what `load` does above; without it, the action helpers
			// would reject any signed-in owner/admin trying to mutate share settings
			// through a token URL once the floor is raised.
			const tokenResult = await checkTokenAccess({ token: identifier, currentUser });
			return tokenResult.year === year ? tokenResult.userId : null;
		} catch (err) {
			if (err instanceof InvalidShareTokenError || err instanceof ShareAccessDeniedError) {
				return null;
			}
			throw err;
		}
	}

	if (!isPureNumericId(identifier)) {
		return null;
	}

	const userId = Number(identifier);
	if (!Number.isSafeInteger(userId) || userId <= 0) {
		return null;
	}

	const userRow = await db
		.select({ id: users.id })
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);
	return userRow[0]?.id ?? null;
}

export const load: PageServerLoad = async ({ params, locals, parent, setHeaders }) => {
	setHeaders({ 'cache-control': 'no-store' });

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
			const tokenResult = await checkTokenAccess({
				token: identifier,
				currentUser: locals.user
			});
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
		if (!isPureNumericId(identifier)) {
			error(404, WRAPPED_NOT_FOUND_MESSAGE);
		}
		const parsedId = Number(identifier);
		if (!Number.isSafeInteger(parsedId) || parsedId <= 0) {
			error(404, WRAPPED_NOT_FOUND_MESSAGE);
		}
		userId = parsedId;

		// Verify the user actually exists before any code path that may create
		// share_settings rows for them (checkWrappedAccess -> getOrCreateShareSettings).
		// Preserves the F-015 anti-enumeration story (unknown id -> 404) and blocks
		// the route by which a stray numeric id (e.g. a Plex id) became a
		// share_settings.user_id orphan. This is a read-only existence check, so no
		// orphan share_settings row is created for a non-existent id.
		const userExists = await db
			.select({ id: users.id })
			.from(users)
			.where(eq(users.id, userId))
			.limit(1);
		if (!userExists[0]) {
			error(404, WRAPPED_NOT_FOUND_MESSAGE);
		}

		try {
			await checkWrappedAccess({
				userId,
				year,
				currentUser: locals.user
			});
		} catch (err) {
			// F-015 / ISSUE-001 uniform-404 anti-enumeration contract: an anonymous
			// caller on a numeric id must not be able to tell "exists but private"
			// from "does not exist". For anonymous callers every "cannot view"
			// outcome collapses to one byte-identical 404 + body (matching the
			// non-existent-id 404 above and the canonical landing `lookupUser`
			// pattern). Authenticated callers keep the existing 403/404 split — a
			// signed-in viewer already proves server membership, so existence is
			// not a secret we are protecting from them.
			const isAnonymous = !locals.user;
			if (err instanceof ShareAccessDeniedError) {
				if (isAnonymous) {
					error(404, WRAPPED_NOT_FOUND_MESSAGE);
				}
				error(403, err.message);
			}
			if (err instanceof InvalidShareTokenError) {
				error(
					404,
					isAnonymous
						? WRAPPED_NOT_FOUND_MESSAGE
						: 'This share link is invalid, expired, or has been revoked.'
				);
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
	const ownerOrAdmin = isOwner || isAdmin;
	const needsTokenForUrl = effectiveModeForUrl === ShareMode.PRIVATE_LINK;
	// Owner/admin keep their canonical token even when the floor raises the
	// effective mode above PRIVATE_LINK, so the share modal stays stable
	// across reloads. Lazy-mint only when PRIVATE_LINK is actually reachable.
	const rawTokenForOwner = ownerOrAdmin
		? (shareSettings.shareToken ?? (needsTokenForUrl ? await ensureShareToken(userId, year) : null))
		: null;
	const resolvedShareToken = needsTokenForUrl
		? (rawTokenForOwner ?? shareSettings.shareToken ?? (await ensureShareToken(userId, year)))
		: null;
	const currentUrl = ownerOrAdmin
		? await getOwnerWrappedHref(userId, year)
		: `/wrapped/${year}/u/${accessedViaToken ? identifier : (resolvedShareToken ?? userId)}`;

	const exposedShareToken = ownerOrAdmin ? rawTokenForOwner : null;
	const signedStats = await signStatsThumbnails(stats, {
		kind: 'user',
		year,
		userId,
		shareToken: accessedViaToken ? identifier : undefined
	});

	return {
		stats: signedStats,
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
			shareToken: exposedShareToken,
			canUserControl: shareSettings.canUserControl || isAdmin
		},
		isOwner,
		isAdmin,
		isLoggedIn: !!locals.user,
		globalFloor: globalFloorForUrl,
		currentUrl,
		canonicalUrl: `/wrapped/${year}/u/${userId}`,
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
			return { success: true, showLogo };
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

		const userId = await resolveUserIdFromIdentifier(params.identifier, year, locals.user);
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
				canonicalUrl: `/wrapped/${year}/u/${userId}`,
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
				const [currentSettings, globalFloor] = await Promise.all([
					getOrCreateShareSettings({ userId, year }),
					getGlobalDefaultShareMode()
				]);
				return fail(403, {
					error: err.message,
					currentMode: currentSettings.mode,
					globalFloor,
					canonicalUrl: `/wrapped/${year}/u/${userId}`,
					shareSettings: {
						mode: currentSettings.mode,
						storedMode: currentSettings.storedMode,
						modeSource: currentSettings.modeSource,
						shareToken: currentSettings.shareToken,
						canUserControl: currentSettings.canUserControl || locals.user.isAdmin
					}
				});
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

		const userId = await resolveUserIdFromIdentifier(params.identifier, year, locals.user);
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
				canonicalUrl: `/wrapped/${year}/u/${userId}`,
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
			if (err instanceof PermissionExceededError) {
				return fail(403, { error: err.message });
			}
			const message = err instanceof Error ? err.message : 'Failed to regenerate token';
			return fail(500, { error: message });
		}
	}
};
