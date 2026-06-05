import { db } from '$lib/server/db/client';
import { shareSettings, users } from '$lib/server/db/schema';
import {
	ShareMode,
	ShareModeSource,
	type ShareModeSourceType,
	type ShareModeType
} from '$lib/server/sharing/types';

export interface TestSharingUserInput {
	id?: number;
	plexId?: number;
	accountId?: number | null;
	username?: string;
	isAdmin?: boolean;
}

export async function seedSharingUser(overrides: TestSharingUserInput = {}) {
	const user = {
		id: overrides.id ?? 42,
		plexId: overrides.plexId ?? 100_042,
		accountId: overrides.accountId ?? 200_042,
		username: overrides.username ?? 'alice',
		isAdmin: overrides.isAdmin ?? false
	};

	await db.insert(users).values(user);

	return user;
}

export interface TestShareSettingsInput {
	userId: number;
	year: number;
	mode?: ShareModeType;
	modeSource?: ShareModeSourceType;
	token?: string | null;
	canUserControl?: boolean;
	showLogo?: boolean | null;
}

export async function seedShareSettings(input: TestShareSettingsInput) {
	const values = {
		userId: input.userId,
		year: input.year,
		mode: input.mode ?? ShareMode.PUBLIC,
		modeSource: input.modeSource ?? ShareModeSource.EXPLICIT,
		shareToken: input.token ?? null,
		canUserControl: input.canUserControl ?? false,
		showLogo: input.showLogo ?? null
	};

	await db.insert(shareSettings).values(values);

	return values;
}
