import { beforeEach, describe, expect, it } from 'bun:test';
import { AppSettingsKey, setAppSetting, WrappedLogoMode } from '$lib/server/admin/settings.service';
import { db } from '$lib/server/db/client';
import { appSettings, shareSettings } from '$lib/server/db/schema';
import { getUserLogoPreference } from '$lib/server/sharing/service';
import { actions } from '../../../src/routes/wrapped/[year=year]/u/[identifier]/+page.server';

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

describe('wrapped actions', () => {
	beforeEach(async () => {
		await db.delete(shareSettings);
		await db.delete(appSettings);
	});

	it('toggleLogo returns and persists the saved showLogo value', async () => {
		await setAppSetting(AppSettingsKey.WRAPPED_LOGO_MODE, WrappedLogoMode.USER_CHOICE);

		const action = actions.toggleLogo as ToggleLogoAction;
		const result = await action({
			request: createToggleLogoRequest(false),
			params: { year: '2024', identifier: '42' },
			locals
		} as Parameters<ToggleLogoAction>[0]);

		expect(result).toMatchObject({ success: true, showLogo: false });
		expect(await getUserLogoPreference(42, 2024)).toBe(false);
	});
});
