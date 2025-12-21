import { db } from '$lib/server/db/client';
import { shareSettings } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import {
	getWrappedLogoMode,
	WrappedLogoMode,
	type WrappedLogoModeType
} from '$lib/server/admin/settings.service';

/**
 * Logo Service
 *
 * Handles logo visibility logic for wrapped pages.
 * Supports three modes:
 * - ALWAYS_SHOW: Logo always visible
 * - ALWAYS_HIDE: Logo always hidden
 * - USER_CHOICE: Users can toggle their preference
 *
 * @module logo/service
 */

// =============================================================================
// Types
// =============================================================================

export interface LogoVisibilityResult {
	/** Whether to show the logo */
	showLogo: boolean;
	/** Whether the user can control logo visibility */
	canUserControl: boolean;
	/** The current global mode */
	mode: WrappedLogoModeType;
}

// =============================================================================
// Main Functions
// =============================================================================

/**
 * Get logo visibility for a wrapped page
 *
 * Logic:
 * - ALWAYS_SHOW: return true
 * - ALWAYS_HIDE: return false
 * - USER_CHOICE: check user's preference in shareSettings
 *
 * @param userId - The user ID (null for server-wide wrapped)
 * @param year - The year
 * @returns Logo visibility and control information
 */
export async function getLogoVisibility(
	userId: number | null,
	year: number
): Promise<LogoVisibilityResult> {
	const mode = await getWrappedLogoMode();

	// ALWAYS_SHOW mode
	if (mode === WrappedLogoMode.ALWAYS_SHOW) {
		return {
			showLogo: true,
			canUserControl: false,
			mode
		};
	}

	// ALWAYS_HIDE mode
	if (mode === WrappedLogoMode.ALWAYS_HIDE) {
		return {
			showLogo: false,
			canUserControl: false,
			mode
		};
	}

	// USER_CHOICE mode - check user preference
	if (userId === null) {
		// Server-wide wrapped - default to showing
		return {
			showLogo: true,
			canUserControl: false,
			mode
		};
	}

	// Get user's preference from shareSettings
	const result = await db
		.select({ showLogo: shareSettings.showLogo })
		.from(shareSettings)
		.where(and(eq(shareSettings.userId, userId), eq(shareSettings.year, year)))
		.limit(1);

	const settings = result[0];

	// If no setting or null, default to true (show logo)
	const showLogo = settings?.showLogo ?? true;

	return {
		showLogo,
		canUserControl: true,
		mode
	};
}

/**
 * Set user's logo preference
 *
 * Only works when mode is USER_CHOICE
 *
 * @param userId - The user ID
 * @param year - The year
 * @param showLogo - Whether to show the logo
 * @throws Error if mode is not USER_CHOICE
 */
export async function setUserLogoPreference(
	userId: number,
	year: number,
	showLogo: boolean
): Promise<void> {
	const mode = await getWrappedLogoMode();

	if (mode !== WrappedLogoMode.USER_CHOICE) {
		throw new Error('User cannot control logo visibility in current mode');
	}

	// Check if shareSettings exists for this user/year
	const existing = await db
		.select({ id: shareSettings.id })
		.from(shareSettings)
		.where(and(eq(shareSettings.userId, userId), eq(shareSettings.year, year)))
		.limit(1);

	if (existing.length > 0) {
		// Update existing record
		await db
			.update(shareSettings)
			.set({ showLogo })
			.where(and(eq(shareSettings.userId, userId), eq(shareSettings.year, year)));
	} else {
		// Create new record with logo preference
		await db.insert(shareSettings).values({
			userId,
			year,
			mode: 'public',
			showLogo
		});
	}
}
