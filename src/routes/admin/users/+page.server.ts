import { fail } from '@sveltejs/kit';
import { z } from 'zod';
import {
	getAllUsersWithStats,
	getAvailableYears,
	getSyncedViewerCount,
	updateUserSharePermission
} from '$lib/server/admin/users.service';
import { requireAdminActions } from '$lib/server/auth/guards';
import { getOwnerWrappedHref } from '$lib/server/sharing/service';
import type { Actions, PageServerLoad } from './$types';

const UpdateUserPermissionSchema = z.object({
	userId: z.coerce.number().int().positive(),
	year: z.coerce.number().int().min(2000).max(2100),
	canUserControl: z.coerce.boolean()
});

export const load: PageServerLoad = async ({ url }) => {
	const yearParam = url.searchParams.get('year');
	const parsedYear = yearParam ? parseInt(yearParam, 10) : Number.NaN;
	const year =
		Number.isInteger(parsedYear) && parsedYear >= 2000 && parsedYear <= 2100
			? parsedYear
			: new Date().getFullYear();

	const [users, availableYears, syncedViewerCount] = await Promise.all([
		getAllUsersWithStats(year),
		getAvailableYears(),
		// DF-005: synced viewers = distinct Plex accounts in play history, which is
		// typically far larger than the number of login/app users. These viewers are
		// never registered here individually; their names on server-wide stats are
		// governed by the GLOBAL anonymization setting (Privacy page), not per-row.
		getSyncedViewerCount()
	]);

	const usersWithHref = await Promise.all(
		users.map(async (u) => ({
			id: u.id,
			plexId: u.plexId,
			username: u.username,
			email: u.email,
			thumb: u.thumb,
			isAdmin: u.isAdmin,
			totalWatchTimeMinutes: u.totalWatchTimeMinutes,
			totalPlays: u.totalPlays,
			hasWatchHistory: u.hasWatchHistory,
			shareMode: u.shareMode,
			shareModeSource: u.shareModeSource,
			canUserControl: u.canUserControl,
			effectiveLabel: u.effectiveLabel,
			effectiveClass: u.effectiveClass,
			wrappedHref: await getOwnerWrappedHref(u.id, year)
		}))
	);

	return {
		users: usersWithHref,
		year,
		availableYears,
		syncedViewerCount
	};
};

export const actions: Actions = requireAdminActions({
	updateUserPermission: async ({ request }) => {
		const formData = await request.formData();

		const data = {
			userId: formData.get('userId'),
			year: formData.get('year'),
			canUserControl: formData.get('canUserControl') === 'true'
		};

		const parsed = UpdateUserPermissionSchema.safeParse(data);
		if (!parsed.success) {
			return fail(400, { error: 'Invalid input' });
		}

		try {
			await updateUserSharePermission(
				parsed.data.userId,
				parsed.data.year,
				parsed.data.canUserControl
			);

			return { success: true, message: 'User permission updated' };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to update permission';
			return fail(500, { error: message });
		}
	}
});
