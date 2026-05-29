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
 * Parses the optional `year` form field.
 *
 * Returns:
 *   - `undefined` when the field is missing or blank/whitespace (meaning
 *     "all years" — passed to the service-layer count/clear helpers as
 *     "no scope").
 *   - A number when the value is parseable. parseInt is permissive: it
 *     accepts decimals (silently truncated, e.g. '2024.5' → 2024) and
 *     negative integers. tests/unit/admin/data-actions.test.ts pins this
 *     behavior — a future commit that tightens validation (e.g.,
 *     positive-integers-only or a year range) should update those tests
 *     in lockstep.
 *   - `fail(400, ...)` when the value is unparseable (e.g., 'twenty-two').
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
