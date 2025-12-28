import { db } from '$lib/server/db/client';
import { shareSettings } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import {
	getWrappedLogoMode,
	WrappedLogoMode,
	type WrappedLogoModeType
} from '$lib/server/admin/settings.service';

export interface LogoVisibilityResult {
	showLogo: boolean;
	canUserControl: boolean;
	mode: WrappedLogoModeType;
}

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
