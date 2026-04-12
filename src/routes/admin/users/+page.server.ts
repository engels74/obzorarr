import { fail } from '@sveltejs/kit';
import { z } from 'zod';
import {
	getAllUsersWithStats,
	getAvailableYears,
	updateUserSharePermission
} from '$lib/server/admin/users.service';
import type { Actions, PageServerLoad } from './$types';

const UpdateUserPermissionSchema = z.object({
	userId: z.coerce.number().int().positive(),
	year: z.coerce.number().int().min(2000).max(2100),
	canUserControl: z.coerce.boolean()
});

export const load: PageServerLoad = async ({ url }) => {
	const yearParam = url.searchParams.get('year');
	const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();

	const [users, availableYears] = await Promise.all([
		getAllUsersWithStats(year),
		getAvailableYears()
	]);

	return {
		users: users.map((u) => ({
			id: u.id,
			plexId: u.plexId,
			username: u.username,
			email: u.email,
			thumb: u.thumb,
			isAdmin: u.isAdmin,
			totalWatchTimeMinutes: u.totalWatchTimeMinutes,
			shareMode: u.shareMode,
			canUserControl: u.canUserControl
		})),
		year,
		availableYears: availableYears.length > 0 ? availableYears : [year]
	};
};

export const actions: Actions = {
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
};
