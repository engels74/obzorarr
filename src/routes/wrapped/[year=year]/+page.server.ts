import { error } from '@sveltejs/kit';
import { getFunFactFrequency } from '$lib/server/admin/settings.service';
import { generateFunFacts } from '$lib/server/funfacts';
import { getLogoVisibility } from '$lib/server/logo';
import { getServerName } from '$lib/server/plex/server-name.service';
import { signStatsThumbnails } from '$lib/server/plex/thumbnail-auth';
import { checkServerWrappedAccess } from '$lib/server/sharing/access-control';
import { ShareAccessDeniedError, WRAPPED_NOT_FOUND_MESSAGE } from '$lib/server/sharing/types';
import {
	buildSlideRenderConfigs,
	customSlidesToMap,
	getEnabledCustomSlides,
	getEnabledSlides,
	initializeDefaultSlideConfig,
	intersperseFunFacts,
	renderMarkdownSync
} from '$lib/server/slides';
import { getServerStatsWithAnonymization } from '$lib/server/stats/engine';
import { triggerLiveSyncIfNeeded } from '$lib/server/sync/live-sync';
import { hasWatchHistory } from '$lib/stats/types';
import type { PageServerLoad } from './$types';

// ISSUE-003: friendly empty state for an authorized viewer hitting an in-range
// year that has no synced recap yet. Returned in place of the old 404; the page
// discriminates on `hasData` to render "No {year} data yet" instead of the
// slideshow. Only the fields the empty-state branch actually reads are returned
// (year for the copy; isAdmin/isLoggedIn for the Home button) — no stats/slides
// are computed for an empty year.
function buildEmptyState(year: number, isAdmin: boolean, isLoggedIn: boolean) {
	return {
		hasData: false as const,
		year,
		isAdmin,
		isLoggedIn
	};
}

export const load: PageServerLoad = async ({ params, locals, parent, setHeaders }) => {
	setHeaders({ 'cache-control': 'no-store' });

	const year = parseInt(params.year, 10);
	if (Number.isNaN(year) || year < 2000 || year > 2100) {
		error(404, 'Invalid year');
	}

	const currentYear = new Date().getFullYear();
	const { availableYears } = await parent();

	// ISSUE-003: access control runs BEFORE any data-presence decision. The
	// "no data for this year" branch used to fire first, which let an anonymous
	// visitor on a private (private-oauth) server tell an in-range empty year apart
	// from an access-denied one — an anti-enumeration leak. Gate first so an
	// anonymous denial is the byte-identical WRAPPED_NOT_FOUND_MESSAGE 404 (parity
	// with the personal route), an authenticated non-member keeps the deliberate
	// 403, and only an authorized viewer proceeds to learn whether the year holds
	// data.
	try {
		await checkServerWrappedAccess({
			year,
			currentUser: locals.user
		});
	} catch (err) {
		if (err instanceof ShareAccessDeniedError) {
			if (!locals.user) {
				error(404, WRAPPED_NOT_FOUND_MESSAGE);
			}
			error(403, err.message);
		}
		throw err;
	}

	const isAdmin = locals.user?.isAdmin ?? false;
	const isLoggedIn = !!locals.user;

	// A never-synced in-range year (not in availableYears and not the current year)
	// has no recap to show. An authorized viewer now gets a friendly empty state
	// instead of a hard 404 (ISSUE-003).
	if (!availableYears.includes(year) && year !== currentYear) {
		return buildEmptyState(year, isAdmin, isLoggedIn);
	}

	triggerLiveSyncIfNeeded('server-wrapped').catch(() => {});

	const viewingUserId = locals.user?.id ?? null;
	const stats = await getServerStatsWithAnonymization(year, viewingUserId);

	// The current year can be in range yet not yet synced (empty stats). Render the
	// same friendly empty state rather than an empty slideshow.
	if (!hasWatchHistory(stats)) {
		return buildEmptyState(year, isAdmin, isLoggedIn);
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
	try {
		funFacts = await generateFunFacts(stats, { count: frequencyConfig.count });
	} catch (err) {
		console.warn('Failed to generate fun facts:', err);
	}

	const slides = intersperseFunFacts(baseSlides, funFacts);
	const logoVisibility = await getLogoVisibility(null, year);
	const serverName = await getServerName();
	const signedStats = await signStatsThumbnails(stats, { kind: 'server', year });

	return {
		hasData: true as const,
		stats: signedStats,
		slides,
		customSlidesMap,
		year,
		isServerWrapped: true as const,
		serverName,
		showLogo: logoVisibility.showLogo,
		canUserControlLogo: false,
		currentUrl: `/wrapped/${year}`,
		isAdmin,
		isLoggedIn
	};
};
