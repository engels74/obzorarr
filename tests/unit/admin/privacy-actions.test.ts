import { beforeEach, describe, expect, it } from 'bun:test';
import { getAnonymizationMode, setAppSetting } from '$lib/server/admin/settings.service';
import { db } from '$lib/server/db/client';
import { appSettings, shareSettings } from '$lib/server/db/schema';
import {
	getGlobalAllowUserControl,
	getGlobalDefaultShareMode,
	getServerWrappedShareMode
} from '$lib/server/sharing/service';
import { actions } from '../../../src/routes/admin/settings/privacy/+page.server';

type UpdateServerWrappedAction = NonNullable<typeof actions.updateServerWrappedSettings>;
type UpdateUserDefaultsAction = NonNullable<typeof actions.updateUserDefaults>;
type BulkApplyAction = NonNullable<typeof actions.bulkApplyShareDefaults>;

const adminLocals = {
	user: { id: 1, plexId: 1, username: 'admin', isAdmin: true }
} as unknown as App.Locals;

function makeRequest(action: string, fields: Record<string, string>): Request {
	const formData = new FormData();
	for (const [k, v] of Object.entries(fields)) formData.set(k, v);
	return new Request(`http://localhost/admin/settings/privacy?/${action}`, {
		method: 'POST',
		body: formData
	});
}

describe('privacy nested route — updateServerWrappedSettings', () => {
	beforeEach(async () => {
		await db.delete(appSettings);
		await db.delete(shareSettings);
	});

	async function run(request: Request) {
		const handler = actions.updateServerWrappedSettings as UpdateServerWrappedAction;
		return handler({
			request,
			locals: adminLocals
		} as Parameters<UpdateServerWrappedAction>[0]);
	}

	it('persists both anonymizationMode and serverWrappedShareMode', async () => {
		const result = await run(
			makeRequest('updateServerWrappedSettings', {
				anonymizationMode: 'anonymous',
				serverWrappedShareMode: 'private-oauth',
				settingsVersion: new Date(0).toISOString()
			})
		);
		expect(result).toMatchObject({
			success: true,
			message: 'Server-wide wrapped settings updated'
		});
		expect(await getAnonymizationMode()).toBe('anonymous');
		expect(await getServerWrappedShareMode()).toBe('private-oauth');
	});

	it('rejects blank settingsVersion as 409 conflict', async () => {
		const result = await run(
			makeRequest('updateServerWrappedSettings', {
				anonymizationMode: 'real',
				serverWrappedShareMode: 'public',
				settingsVersion: ''
			})
		);
		expect(result).toMatchObject({
			status: 409,
			data: {
				conflict: true,
				error: 'Settings changed in another tab. Please reload.'
			}
		});
	});

	it('rejects stale settingsVersion as 409 without overwriting', async () => {
		await run(
			makeRequest('updateServerWrappedSettings', {
				anonymizationMode: 'anonymous',
				serverWrappedShareMode: 'private-oauth',
				settingsVersion: new Date(0).toISOString()
			})
		);
		expect(await getAnonymizationMode()).toBe('anonymous');

		const result = await run(
			makeRequest('updateServerWrappedSettings', {
				anonymizationMode: 'real',
				serverWrappedShareMode: 'public',
				settingsVersion: new Date(0).toISOString()
			})
		);
		expect(result).toMatchObject({ status: 409, data: { conflict: true } });
		expect(await getAnonymizationMode()).toBe('anonymous');
	});

	it('rejects private-link for serverWrappedShareMode as 400 (server-wide only supports public + private-oauth)', async () => {
		const result = await run(
			makeRequest('updateServerWrappedSettings', {
				anonymizationMode: 'real',
				serverWrappedShareMode: 'private-link',
				settingsVersion: new Date(0).toISOString()
			})
		);
		expect(result).toMatchObject({ status: 400, data: { error: 'Invalid input' } });
	});

	it('rejects unknown anonymizationMode as 400', async () => {
		const result = await run(
			makeRequest('updateServerWrappedSettings', {
				anonymizationMode: 'partial',
				serverWrappedShareMode: 'public',
				settingsVersion: new Date(0).toISOString()
			})
		);
		expect(result).toMatchObject({ status: 400, data: { error: 'Invalid input' } });
	});
});

describe('privacy nested route — updateUserDefaults', () => {
	beforeEach(async () => {
		await db.delete(appSettings);
		await db.delete(shareSettings);
	});

	async function run(request: Request) {
		const handler = actions.updateUserDefaults as UpdateUserDefaultsAction;
		return handler({
			request,
			locals: adminLocals
		} as Parameters<UpdateUserDefaultsAction>[0]);
	}

	it('persists defaultShareMode + allowUserControl=true', async () => {
		const result = await run(
			makeRequest('updateUserDefaults', {
				defaultShareMode: 'private-oauth',
				allowUserControl: 'true',
				settingsVersion: new Date(0).toISOString()
			})
		);
		expect(result).toMatchObject({ success: true, message: 'User sharing defaults updated' });
		expect(await getGlobalDefaultShareMode()).toBe('private-oauth');
		expect(await getGlobalAllowUserControl()).toBe(true);
	});

	it('persists allowUserControl=false from form-encoded string (not silent truthy)', async () => {
		// Catches the z.coerce.boolean() trap: literal 'false' string is truthy.
		// FormBooleanSchema's preprocess (v === 'true' || v === true) keeps the
		// flag from silently flipping to true.
		const result = await run(
			makeRequest('updateUserDefaults', {
				defaultShareMode: 'public',
				allowUserControl: 'false',
				settingsVersion: new Date(0).toISOString()
			})
		);
		expect(result).toMatchObject({ success: true });
		expect(await getGlobalAllowUserControl()).toBe(false);
	});

	it('rejects blank settingsVersion as 409 conflict', async () => {
		const result = await run(
			makeRequest('updateUserDefaults', {
				defaultShareMode: 'public',
				allowUserControl: 'true',
				settingsVersion: ''
			})
		);
		expect(result).toMatchObject({
			status: 409,
			data: {
				conflict: true,
				error: 'Settings changed in another tab. Please reload.'
			}
		});
	});

	it('rejects unknown defaultShareMode as 400', async () => {
		const result = await run(
			makeRequest('updateUserDefaults', {
				defaultShareMode: 'mystery-mode',
				allowUserControl: 'true',
				settingsVersion: new Date(0).toISOString()
			})
		);
		expect(result).toMatchObject({ status: 400, data: { error: 'Invalid input' } });
	});

	it('accepts private-link for defaultShareMode (user defaults are broader than server-wide)', async () => {
		const result = await run(
			makeRequest('updateUserDefaults', {
				defaultShareMode: 'private-link',
				allowUserControl: 'false',
				settingsVersion: new Date(0).toISOString()
			})
		);
		expect(result).toMatchObject({ success: true });
		expect(await getGlobalDefaultShareMode()).toBe('private-link');
	});
});

describe('privacy nested route — bulkApplyShareDefaults', () => {
	beforeEach(async () => {
		await db.delete(shareSettings);
	});

	async function run() {
		const handler = actions.bulkApplyShareDefaults as BulkApplyAction;
		return handler({
			request: new Request('http://localhost/admin/settings/privacy?/bulkApplyShareDefaults', {
				method: 'POST',
				body: new FormData()
			}),
			locals: adminLocals
		} as Parameters<BulkApplyAction>[0]);
	}

	it('returns success with the affected-row count message', async () => {
		// No users / no share rows → count is 0 but action still succeeds.
		const result = await run();
		expect(result).toMatchObject({
			success: true,
			message: 'Updated 0 user share records'
		});
	});

	it('survives when global defaults have not been initialised yet', async () => {
		// Belt-and-suspenders: even with empty appSettings, the bulk action
		// shouldn't throw — it falls back to schema defaults.
		await db.delete(appSettings);
		const result = await run();
		expect(result).toMatchObject({ success: true });
	});
});

// Touch setAppSetting so the import isn't dropped if a future refactor
// inlines the priming logic above into a helper.
void setAppSetting;
