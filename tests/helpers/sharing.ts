import {
	AppSettingsKey,
	getPlexConfig,
	getPlexConfigFingerprint
} from '$lib/server/admin/settings.service';
import { db } from '$lib/server/db/client';
import { appSettings, plexAccounts, shareSettings, users } from '$lib/server/db/schema';
import { buildPlexIdentityProofValue } from '$lib/server/plex/account-reconciliation';
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
const IDENTITY_CONFIRMED_AT = Date.now();

export async function seedPlexAuthorityForTests(): Promise<void> {
	const config = await getPlexConfig();
	const discriminator = getPlexConfigFingerprint(config);
	await db
		.insert(appSettings)
		.values({
			key: AppSettingsKey.PLEX_AUTHORITY_DISCRIMINATOR,
			value: discriminator,
			updatedAt: new Date()
		})
		.onConflictDoUpdate({
			target: appSettings.key,
			set: { value: discriminator, updatedAt: new Date() }
		});
}
export async function seedSharingUser(overrides: TestSharingUserInput = {}) {
	const user = {
		id: overrides.id ?? 42,
		plexId: overrides.plexId ?? 100_042,
		accountId: overrides.accountId ?? 200_042,
		username: overrides.username ?? 'alice',
		isAdmin: overrides.isAdmin ?? false
	};

	await seedPlexAuthorityForTests();
	await db.insert(users).values(user);
	if (user.accountId !== null) {
		await db.insert(plexAccounts).values({
			accountId: user.accountId,
			plexId: user.plexId,
			username: user.username,
			isOwner: user.accountId === 1,
			updatedAt: new Date(IDENTITY_CONFIRMED_AT)
		});
		const proofValue = await buildPlexIdentityProofValue('machine-test', IDENTITY_CONFIRMED_AT);
		await db
			.insert(appSettings)
			.values({
				key: AppSettingsKey.PLEX_IDENTITY_PROOF,
				value: proofValue,
				updatedAt: new Date(IDENTITY_CONFIRMED_AT)
			})
			.onConflictDoUpdate({
				target: appSettings.key,
				set: { value: proofValue, updatedAt: new Date(IDENTITY_CONFIRMED_AT) }
			});
	}

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
