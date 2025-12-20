import { fail } from '@sveltejs/kit';
import { z } from 'zod';
import type { PageServerLoad, Actions } from './$types';
import {
	getAllUsersWithStats,
	updateUserSharePermission,
	getAvailableYears
} from '$lib/server/admin/users.service';
import {
	getGlobalDefaultShareMode,
	getGlobalAllowUserControl,
	setGlobalShareDefaults
} from '$lib/server/sharing/service';
import type { ShareModeType } from '$lib/server/sharing/types';

/**
 * Admin Users Page Server
 *
 * Handles user management operations.
 *
 * Implements Requirements:
 * - 11.2: User management with per-user permission settings
 * - 11.7: Preview user wrapped without affecting settings
 */

// =============================================================================
// Validation Schemas
// =============================================================================

const ShareModeSchema = z.enum(['public', 'private-oauth', 'private-link']);

const UpdateUserPermissionSchema = z.object({
	userId: z.coerce.number().int().positive(),
	canUserControl: z.coerce.boolean()
});

const GlobalDefaultsSchema = z.object({
	defaultShareMode: ShareModeSchema,
	allowUserControl: z.coerce.boolean()
});

// =============================================================================
// Load Function
// =============================================================================

export const load: PageServerLoad = async () => {
	const year = new Date().getFullYear();

	const [users, defaultShareMode, allowUserControl, availableYears] = await Promise.all([
		getAllUsersWithStats(year),
		getGlobalDefaultShareMode(),
		getGlobalAllowUserControl(),
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
		globalDefaults: {
			defaultShareMode,
			allowUserControl
		},
		year,
		availableYears: availableYears.length > 0 ? availableYears : [year]
	};
};

// =============================================================================
// Actions
// =============================================================================

export const actions: Actions = {
	/**
	 * Update global share defaults
	 */
	updateGlobalDefaults: async ({ request }) => {
		const formData = await request.formData();

		const data = {
			defaultShareMode: formData.get('defaultShareMode'),
			allowUserControl: formData.get('allowUserControl') === 'true'
		};

		const parsed = GlobalDefaultsSchema.safeParse(data);
		if (!parsed.success) {
			return fail(400, { error: 'Invalid input', fieldErrors: parsed.error.flatten().fieldErrors });
		}

		try {
			await setGlobalShareDefaults({
				defaultShareMode: parsed.data.defaultShareMode as ShareModeType,
				allowUserControl: parsed.data.allowUserControl
			});

			return { success: true, message: 'Global defaults updated' };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to update defaults';
			return fail(500, { error: message });
		}
	},

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
