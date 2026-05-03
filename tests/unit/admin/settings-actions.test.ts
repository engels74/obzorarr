import { beforeEach, describe, expect, it } from 'bun:test';
import {
	getAppSettingsUpdatedAt,
	USER_DEFAULTS_SETTINGS_KEYS
} from '$lib/server/admin/settings.service';
import { db } from '$lib/server/db/client';
import { appSettings } from '$lib/server/db/schema';
import { getGlobalAllowUserControl, getGlobalDefaultShareMode } from '$lib/server/sharing/service';
import { actions } from '../../../src/routes/admin/settings/+page.server';

type UpdateUserDefaultsAction = NonNullable<typeof actions.updateUserDefaults>;

const adminLocals = {
	user: { id: 1, plexId: 1, username: 'admin', isAdmin: true }
} as unknown as App.Locals;

function createUserDefaultsRequest(overrides: Record<string, string> = {}): Request {
	const formData = new FormData();
	formData.set('defaultShareMode', 'private-oauth');
	formData.set('allowUserControl', 'false');
	formData.set('settingsVersion', '');

	for (const [key, value] of Object.entries(overrides)) {
		formData.set(key, value);
	}

	return new Request('http://localhost/admin/settings?/updateUserDefaults', {
		method: 'POST',
		body: formData
	});
}

async function runUpdateUserDefaults(request: Request) {
	const updateUserDefaults = actions.updateUserDefaults as UpdateUserDefaultsAction;
	return updateUserDefaults({
		request,
		locals: adminLocals
	} as Parameters<UpdateUserDefaultsAction>[0]);
}

describe('admin settings actions', () => {
	beforeEach(async () => {
		await db.delete(appSettings);
	});

	it('persists explicit false and true allowUserControl values', async () => {
		await expect(runUpdateUserDefaults(createUserDefaultsRequest())).resolves.toMatchObject({
			success: true
		});
		expect(await getGlobalDefaultShareMode()).toBe('private-oauth');
		expect(await getGlobalAllowUserControl()).toBe(false);

		const updatedAt = await getAppSettingsUpdatedAt(USER_DEFAULTS_SETTINGS_KEYS);
		expect(updatedAt).not.toBeNull();

		await expect(
			runUpdateUserDefaults(
				createUserDefaultsRequest({
					defaultShareMode: 'public',
					allowUserControl: 'true',
					settingsVersion: (updatedAt as Date).toISOString()
				})
			)
		).resolves.toMatchObject({ success: true });

		expect(await getGlobalDefaultShareMode()).toBe('public');
		expect(await getGlobalAllowUserControl()).toBe(true);
	});

	it('rejects checkbox-style boolean values instead of silently coercing them', async () => {
		const result = await runUpdateUserDefaults(
			createUserDefaultsRequest({ allowUserControl: 'on' })
		);

		expect(result).toMatchObject({
			status: 400,
			data: {
				error: 'Invalid input'
			}
		});
	});
});
