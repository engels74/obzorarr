import { error, fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { getFunFactFrequency } from '$lib/server/admin/settings.service';
import { resolveStatsAccountId } from '$lib/server/admin/users.service';
import { db } from '$lib/server/db/client';
import { users } from '$lib/server/db/schema';
import { generateFunFacts } from '$lib/server/funfacts';
import { getLogoVisibility, setUserLogoPreference } from '$lib/server/logo';
import { signStatsThumbnails } from '$lib/server/plex/thumbnail-auth';
import { checkTokenAccess, checkWrappedAccess } from '$lib/server/sharing/access-control';
import {
	ensureShareToken,
	getExistingShareIdentifier,
	getGlobalDefaultShareMode,
	getOrCreateShareSettings,
	getOwnerWrappedHref,
	isPureNumericId,
	isValidTokenFormat,
	regenerateShareToken,
	resolveSlug,
	updateShareSettings
} from '$lib/server/sharing/service';
import {
	getMoreRestrictiveMode,
	InvalidShareTokenError,
	PermissionExceededError,
	ShareAccessDeniedError,
	ShareMode,
	ShareModeSchema,
	WRAPPED_NOT_FOUND_MESSAGE
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

// WRAPPED_NOT_FOUND_MESSAGE is the single source of truth for the
// anti-enumeration 404 body (now shared with the server-wide route via
// $lib/server/sharing/types). Every anonymous "cannot view" outcome (non-existent
// id, existing-but-private-oauth, existing-but-private-link-without-token) returns
// this exact status+body so an anonymous caller can't tell them apart.

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

	if (isPureNumericId(identifier)) {
		const userId = Number(identifier);
		if (!Number.isSafeInteger(userId) || userId <= 0) {
			return null;
		}

		// DF-04: the sequential integer id resolves only for the owner themselves
		// or an admin. Everyone else gets null (no existence signal), so a member
		// cannot drive a mutation against another member's numeric URL.
		const isOwnerOrAdmin = currentUser?.id === userId || currentUser?.isAdmin === true;
		if (!isOwnerOrAdmin) {
			return null;
		}

		const userRow = await db
			.select({ id: users.id })
			.from(users)
			.where(eq(users.id, userId))
			.limit(1);
		return userRow[0]?.id ?? null;
	}

	// DF-04: opaque public/oauth slug. Resolves to its owning (userId, year);
	// the caller still enforces owner/admin authorization for mutations.
	const resolved = await resolveSlug(identifier);
	return resolved && resolved.year === year ? resolved.userId : null;
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
	let accessedViaSlug = false;

	if (isValidTokenFormat(identifier)) {
		accessedViaToken = true;
		// ISSUE-009: for an anonymous caller, EVERY token-path denial must be the
		// byte-identical anti-enumeration 404 (status + body) — non-existent token,
		// revoked token, oauth-floor-blocked token, and valid-token-wrong-year alike
		// — matching the slug path below so existence can't be inferred. Authenticated
		// callers keep the differentiated 403/404 (membership already proves access;
		// the authenticated 403/404 divergence is accepted in-threat-model). This
		// narrows information disclosure only; access decisions in access-control.ts
		// are unchanged.
		const isAnonymous = !locals.user;
		try {
			const tokenResult = await checkTokenAccess({
				token: identifier,
				currentUser: locals.user
			});
			userId = tokenResult.userId;

			if (tokenResult.year !== year) {
				error(
					404,
					isAnonymous
						? WRAPPED_NOT_FOUND_MESSAGE
						: 'This share link is invalid, expired, or has been revoked.'
				);
			}
		} catch (err) {
			if (err instanceof InvalidShareTokenError) {
				error(
					404,
					isAnonymous
						? WRAPPED_NOT_FOUND_MESSAGE
						: 'This share link is invalid, expired, or has been revoked.'
				);
			}
			if (err instanceof ShareAccessDeniedError) {
				if (isAnonymous) {
					error(404, WRAPPED_NOT_FOUND_MESSAGE);
				}
				error(403, err.message);
			}
			throw err;
		}
	} else if (isPureNumericId(identifier)) {
		// DF-04 / ISSUE-004: the sequential integer id is owner/admin-only. Anyone
		// else — anonymous OR an authenticated non-owner member — gets the
		// byte-identical anti-enumeration 404, closing both anonymous and
		// member-to-member walking. Legitimate viewers reach the page through the
		// opaque slug (PUBLIC / PRIVATE_OAUTH) or the UUID token (PRIVATE_LINK).
		const parsedId = Number(identifier);
		if (!Number.isSafeInteger(parsedId) || parsedId <= 0) {
			error(404, WRAPPED_NOT_FOUND_MESSAGE);
		}
		const isOwnerOrAdmin = locals.user?.id === parsedId || locals.user?.isAdmin === true;
		if (!isOwnerOrAdmin) {
			error(404, WRAPPED_NOT_FOUND_MESSAGE);
		}
		userId = parsedId;

		// Read-only existence check (no orphan share_settings row for a bad id).
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
			// Only owner/admin reach here. Preserve private-link-requires-token
			// (the owner/admin must use the token URL) while keeping the 404 body
			// byte-identical to the anti-enumeration 404 for the access-denied case.
			if (err instanceof ShareAccessDeniedError) {
				error(404, WRAPPED_NOT_FOUND_MESSAGE);
			}
			if (err instanceof InvalidShareTokenError) {
				error(404, 'This share link is invalid, expired, or has been revoked.');
			}
			throw err;
		}
	} else {
		// DF-04: opaque public/oauth slug path. The slug only names the resource;
		// checkWrappedAccess still enforces the effective mode (PUBLIC -> anyone,
		// PRIVATE_OAUTH -> signed-in members only, PRIVATE_LINK -> a token is
		// required so the slug resolves to a uniform 404).
		accessedViaSlug = true;
		const resolved = await resolveSlug(identifier);
		if (!resolved || resolved.year !== year) {
			error(404, WRAPPED_NOT_FOUND_MESSAGE);
		}
		userId = resolved.userId;

		try {
			await checkWrappedAccess({
				userId,
				year,
				currentUser: locals.user
			});
		} catch (err) {
			// Uniform-404 for anonymous callers (no existence signal); authenticated
			// callers keep the 403/404 split since membership already proves access.
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

	const statsAccountId = await resolveStatsAccountId(user);
	const stats = await calculateUserStats(statsAccountId, year);
	const userHasWatchHistory = hasWatchHistory(stats);

	const isOwner = locals.user?.id === userId;
	const isAdmin = locals.user?.isAdmin ?? false;
	const ownerOrAdmin = isOwner || isAdmin;

	let yearIdentifiers: Record<number, string | number> | undefined;

	// DF-04: a non-owner viewer (slug or token access) can no longer navigate
	// other years via the numeric id. Map the current year to the identifier they
	// arrived on, and other years to an EXISTING opaque slug only — read-only, so
	// we never mint here and never leak another year's private-link token
	// (preserving the cross-year token-isolation contract). Years without a usable
	// slug are omitted. Owner/admin keep the numeric identifier (see the page's
	// `userIdentifier` prop).
	if (!ownerOrAdmin && (accessedViaToken || accessedViaSlug)) {
		const parentData = await parent();
		yearIdentifiers = {};

		for (const availYear of parentData.availableYears) {
			if (availYear === year) {
				yearIdentifiers[availYear] = identifier;
				continue;
			}
			const existing = await getExistingShareIdentifier(userId, availYear);
			if (existing) {
				yearIdentifiers[availYear] = existing;
			}
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

	const globalFloorForUrl = await getGlobalDefaultShareMode();
	const effectiveModeForUrl = getMoreRestrictiveMode(shareSettings.mode, globalFloorForUrl);
	const needsTokenForUrl = effectiveModeForUrl === ShareMode.PRIVATE_LINK;
	// Owner/admin keep their canonical token even when the floor raises the
	// effective mode above PRIVATE_LINK, so the share modal stays stable
	// across reloads. Lazy-mint only when PRIVATE_LINK is actually reachable.
	const rawTokenForOwner = ownerOrAdmin
		? (shareSettings.shareToken ?? (needsTokenForUrl ? await ensureShareToken(userId, year) : null))
		: null;
	// Owner/admin get the opaque share href (slug for public/oauth, token for
	// private-link). A non-owner always arrived via the opaque identifier itself
	// (numeric ids are owner/admin-only now), so we echo what they came in on.
	const currentUrl = ownerOrAdmin
		? await getOwnerWrappedHref(userId, year)
		: `/wrapped/${year}/u/${identifier}`;

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
		// ISSUE-013: display-only affordance. When the effective mode is
		// server-members (private-oauth), any signed-in member can open this page by
		// direct URL — intended by the sharing model, not a bypass. Surface a quiet
		// badge so the OWNER knows their Wrapped is readable by all server members.
		// No access-control change; anonymous/non-member denial is untouched.
		visibleToServerMembers: isOwner && effectiveModeForUrl === ShareMode.PRIVATE_OAUTH,
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
