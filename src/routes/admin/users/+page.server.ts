import { fail } from '@sveltejs/kit';
import { z } from 'zod';
import type { PageServerLoad, Actions } from './$types';
import {
	getAllUsersWithStats,
	updateUserSharePermission,
	getAvailableYears
} from '$lib/server/admin/users.service';

/**
 * Admin Users Page Server
 *
 * Handles user management operations.
 */

// =============================================================================
// Validation Schemas
// =============================================================================

const UpdateUserPermissionSchema = z.object({
	userId: z.coerce.number().int().positive(),
	canUserControl: z.coerce.boolean()
});

// =============================================================================
// Load Function
// =============================================================================

export const load: PageServerLoad = async () => {
	const year = new Date().getFullYear();

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

// =============================================================================
// Actions
// =============================================================================

export const actions: Actions = {
	/**
	 * Update a user's share control permission
	 */
	updateUserPermission: async ({ request }) => {
		const formData = await request.formData();
		const year = new Date().getFullYear();

		const data = {
			userId: formData.get('userId'),
			canUserControl: formData.get('canUserControl') === 'true'
		};

		const parsed = UpdateUserPermissionSchema.safeParse(data);
		if (!parsed.success) {
			return fail(400, { error: 'Invalid input' });
		}

		try {
			await updateUserSharePermission(parsed.data.userId, year, parsed.data.canUserControl);

			return { success: true, message: 'User permission updated' };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to update permission';
			return fail(500, { error: message });
		}
	}
};
