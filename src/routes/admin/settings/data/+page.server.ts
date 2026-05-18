import { fail } from '@sveltejs/kit';
import {
	clearPlayHistory,
	clearStatsCache,
	countPlayHistory,
	countStatsCache
} from '$lib/server/admin/settings.service';
import { getAvailableYears } from '$lib/server/admin/users.service';
import { requireAdminActions } from '$lib/server/auth/guards';
import { logger } from '$lib/server/logging';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const [availableYears, playHistoryTotalCount] = await Promise.all([
		getAvailableYears(),
		countPlayHistory()
	]);

	return {
		availableYears,
		currentYear: new Date().getFullYear(),
		playHistoryTotalCount
	};
};

/**
 * Parses the optional `year` form field. Returns `undefined` for missing/blank
 * (meaning "all years"); a positive integer for a parseable year; a fail()
 * for malformed input that can't safely be treated as either.
 */
function parseYear(formData: FormData): number | undefined | ReturnType<typeof fail> {
	const yearStr = formData.get('year')?.toString().trim();
	if (!yearStr) return undefined;
	const year = parseInt(yearStr, 10);
	if (Number.isNaN(year)) return fail(400, { error: 'Invalid year' });
	return year;
}

export const actions: Actions = requireAdminActions({
	getCacheCount: async ({ request }) => {
		const formData = await request.formData();
		const year = parseYear(formData);
		if (typeof year === 'object') return year;
		try {
			const count = await countStatsCache(year);
			return { success: true, count, year };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to get cache count';
			return fail(500, { error: message });
		}
	},

	clearCache: async ({ request }) => {
		const formData = await request.formData();
		const year = parseYear(formData);
		if (typeof year === 'object') return year;
		try {
			const deleted = await clearStatsCache(year);
			const message = year
				? `Cleared ${deleted} cache entries for ${year}`
				: `Cleared ${deleted} cache entries`;
			return { success: true, message };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to clear cache';
			return fail(500, { error: message });
		}
	},

	getPlayHistoryCount: async ({ request }) => {
		const formData = await request.formData();
		const year = parseYear(formData);
		if (typeof year === 'object') return year;
		try {
			const count = await countPlayHistory(year);
			return { success: true, count, year };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to get history count';
			return fail(500, { error: message });
		}
	},

	clearPlayHistory: async ({ request }) => {
		const formData = await request.formData();
		const year = parseYear(formData);
		if (typeof year === 'object') return year;
		try {
			const deleted = await clearPlayHistory(year);
			const message = year
				? `Deleted ${deleted} play history records for ${year}`
				: `Deleted ${deleted} play history records`;
			logger.info(message, 'Settings', { year, deleted });
			return { success: true, message };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to clear play history';
			logger.error(`Failed to clear play history: ${message}`, 'Settings', { year });
			return fail(500, { error: message });
		}
	}
});
