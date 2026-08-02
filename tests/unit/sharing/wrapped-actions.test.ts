import { beforeEach, describe, expect, it } from 'bun:test';
import { AppSettingsKey, setAppSetting, WrappedLogoMode } from '$lib/server/admin/settings.service';
import { db } from '$lib/server/db/client';
import { appSettings, plexAccounts, users } from '$lib/server/db/schema';
import { buildPlexIdentityProofValue } from '$lib/server/plex/account-reconciliation';
import { getUserLogoPreference } from '$lib/server/sharing/service';
import { actions } from '../../../src/routes/wrapped/[year=year]/u/[identifier]/+page.server';
import { resetSharedTestDb } from '../../helpers/db';
import { seedPlexAuthorityForTests } from '../../helpers/sharing';

type ToggleLogoAction = NonNullable<typeof actions.toggleLogo>;

const locals = {
	user: { id: 42, plexId: 4200, username: 'owner', isAdmin: false }
} as unknown as App.Locals;

function createToggleLogoRequest(showLogo: boolean): Request {
	const formData = new FormData();
	formData.set('showLogo', showLogo ? 'true' : 'false');
	return new Request('http://localhost/wrapped/2024/u/42?/toggleLogo', {
		method: 'POST',
		body: formData
	});
}
async function seedActiveMapping(): Promise<void> {
	const confirmedAt = Date.now();
	await seedPlexAuthorityForTests();
	await db.insert(users).values({
		id: 42,
		plexId: 4200,
		accountId: 42,
		username: 'owner'
	});
	await db.insert(plexAccounts).values({
		accountId: 42,
		plexId: 4200,
		username: 'owner',
		updatedAt: new Date(confirmedAt)
	});
	await db.insert(appSettings).values({
		key: AppSettingsKey.PLEX_IDENTITY_PROOF,
		value: await buildPlexIdentityProofValue('machine-test', confirmedAt),
		updatedAt: new Date(confirmedAt)
	});
}

describe('wrapped actions', () => {
	beforeEach(resetSharedTestDb);

	it('toggleLogo returns and persists the saved showLogo value', async () => {
		await setAppSetting(AppSettingsKey.WRAPPED_LOGO_MODE, WrappedLogoMode.USER_CHOICE);
		await seedActiveMapping();

		const action = actions.toggleLogo as ToggleLogoAction;
		const result = await action({
			request: createToggleLogoRequest(false),
			params: { year: '2024', identifier: '42' },
			locals
		} as Parameters<ToggleLogoAction>[0]);

		expect(result).toMatchObject({ success: true, showLogo: false });
		expect(await getUserLogoPreference(42, 2024)).toBe(false);
	});

	it('toggleLogo rejects a removed user without writing a preference', async () => {
		await setAppSetting(AppSettingsKey.WRAPPED_LOGO_MODE, WrappedLogoMode.USER_CHOICE);
		const action = actions.toggleLogo as ToggleLogoAction;
		const result = await action({
			request: createToggleLogoRequest(false),
			params: { year: '2024', identifier: '42' },
			locals
		} as Parameters<ToggleLogoAction>[0]);

		expect(result).toMatchObject({ status: 404 });
		expect(await getUserLogoPreference(42, 2024)).toBeNull();
	});

	it('toggleLogo preserves the admin mapping bypass', async () => {
		await setAppSetting(AppSettingsKey.WRAPPED_LOGO_MODE, WrappedLogoMode.USER_CHOICE);
		await db.insert(users).values({
			id: 42,
			plexId: 4200,
			accountId: 42,
			username: 'admin',
			isAdmin: true
		});
		const action = actions.toggleLogo as ToggleLogoAction;
		const result = await action({
			request: createToggleLogoRequest(false),
			params: { year: '2024', identifier: '42' },
			locals: {
				user: { id: 42, plexId: 4200, username: 'admin', isAdmin: true }
			} as App.Locals
		} as Parameters<ToggleLogoAction>[0]);

		expect(result).toMatchObject({ success: true, showLogo: false });
		expect(await getUserLogoPreference(42, 2024)).toBe(false);
	});
});
