import { error } from '@sveltejs/kit';
import { getFunFactFrequency } from '$lib/server/admin/settings.service';
import { generateFunFacts } from '$lib/server/funfacts';
import { getLogoVisibility } from '$lib/server/logo';
import { getServerName } from '$lib/server/plex/server-name.service';
import { checkServerWrappedAccess } from '$lib/server/sharing/access-control';
import { ShareAccessDeniedError } from '$lib/server/sharing/types';
import {
	buildSlideRenderConfigs,
	customSlidesToMap,
	getEnabledCustomSlides,
	getEnabledSlides,
	initializeDefaultSlideConfig,
	intersperseFunFacts
} from '$lib/server/slides';
import { getServerStatsWithAnonymization } from '$lib/server/stats/engine';
import { triggerLiveSyncIfNeeded } from '$lib/server/sync/live-sync';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const year = parseInt(params.year, 10);
	if (Number.isNaN(year) || year < 2000 || year > 2100) {
		error(404, 'Invalid year');
	}

	try {
		await checkServerWrappedAccess({
			year,
			currentUser: locals.user
		});
	} catch (err) {
		if (err instanceof ShareAccessDeniedError) {
			error(403, err.message);
		}
		throw err;
	}

	triggerLiveSyncIfNeeded('server-wrapped').catch(() => {});

	const viewingUserId = locals.user?.id ?? null;
	const stats = await getServerStatsWithAnonymization(year, viewingUserId);

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
	const logoVisibility = await getLogoVisibility(null, year);
	const serverName = await getServerName();

	return {
		stats,
		slides,
		customSlidesMap,
		year,
		isServerWrapped: true,
		serverName,
		showLogo: logoVisibility.showLogo,
		canUserControlLogo: false,
		currentUrl: `/wrapped/${year}`,
		isAdmin: locals.user?.isAdmin ?? false
	};
};
