import { and, eq } from 'drizzle-orm';
import {
	getWrappedLogoMode,
	WrappedLogoMode,
	type WrappedLogoModeType
} from '$lib/server/admin/settings.service';
import { db } from '$lib/server/db/client';
import { shareSettings } from '$lib/server/db/schema';

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

	if (mode === WrappedLogoMode.ALWAYS_SHOW) {
		return {
			showLogo: true,
			canUserControl: false,
			mode
		};
	}

	if (mode === WrappedLogoMode.ALWAYS_HIDE) {
		return {
			showLogo: false,
			canUserControl: false,
			mode
		};
	}

	if (userId === null) {
		return {
			showLogo: true,
			canUserControl: false,
			mode
		};
	}

	const result = await db
		.select({ showLogo: shareSettings.showLogo })
		.from(shareSettings)
		.where(and(eq(shareSettings.userId, userId), eq(shareSettings.year, year)))
		.limit(1);

	const settings = result[0];
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

	const existing = await db
		.select({ id: shareSettings.id })
		.from(shareSettings)
		.where(and(eq(shareSettings.userId, userId), eq(shareSettings.year, year)))
		.limit(1);

	if (existing.length > 0) {
		await db
			.update(shareSettings)
			.set({ showLogo })
			.where(and(eq(shareSettings.userId, userId), eq(shareSettings.year, year)));
	} else {
		await db.insert(shareSettings).values({
			userId,
			year,
			mode: 'public',
			showLogo
		});
	}
}
