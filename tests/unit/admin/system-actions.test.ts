import { beforeEach, describe, expect, it } from 'bun:test';
import {
	getAppSettingsUpdatedAt,
	LOG_SETTINGS_KEYS,
	setAppSetting
} from '$lib/server/admin/settings.service';
import { getLogMaxCount, getLogRetentionDays, isDebugEnabled } from '$lib/server/logging';
import { actions } from '../../../src/routes/admin/settings/system/+page.server';
import { resetSharedTestDb } from '../../helpers/db';

type UpdateLogSettingsAction = NonNullable<typeof actions.updateLogSettings>;

const adminLocals = {
	user: { id: 1, plexId: 1, username: 'admin', isAdmin: true }
} as unknown as App.Locals;

function makeRequest(fields: Record<string, string>): Request {
	const formData = new FormData();
	for (const [k, v] of Object.entries(fields)) formData.set(k, v);
	return new Request('http://localhost/admin/settings/system?/updateLogSettings', {
		method: 'POST',
		body: formData
	});
}

describe('system nested route — updateLogSettings (Superforms + inline OCC)', () => {
	beforeEach(async () => {
		await resetSharedTestDb();
	});

	async function run(request: Request) {
		const handler = actions.updateLogSettings as UpdateLogSettingsAction;
		return handler({
			request,
			locals: adminLocals
		} as Parameters<UpdateLogSettingsAction>[0]);
	}

	it('persists retentionDays + maxCount + debugEnabled on a fresh DB', async () => {
		const result = await run(
			makeRequest({
				retentionDays: '14',
				maxCount: '2000',
				debugEnabled: 'true',
				settingsVersion: new Date(0).toISOString()
			})
		);
		expect(result).toMatchObject({ success: true, message: 'Logging settings updated' });
		expect(await getLogRetentionDays()).toBe(14);
		expect(await getLogMaxCount()).toBe(2000);
		expect(await isDebugEnabled()).toBe(true);
	});

	it('rejects blank settingsVersion as 409 conflict (Superforms zod error path)', async () => {
		const result = await run(
			makeRequest({
				retentionDays: '14',
				maxCount: '2000',
				debugEnabled: 'true',
				settingsVersion: ''
			})
		);
		// Superforms wraps fail() with { form, conflict: true, error: '...' }
		expect(result).toMatchObject({
			status: 409,
			data: {
				conflict: true,
				error: 'Settings changed in another tab. Please reload.'
			}
		});
		// Defaults preserved
		expect(await getLogRetentionDays()).toBe(7);
		expect(await getLogMaxCount()).toBe(50000);
	});

	it('rejects stale settingsVersion as 409 conflict', async () => {
		// Seed the row by writing once.
		await run(
			makeRequest({
				retentionDays: '14',
				maxCount: '2000',
				debugEnabled: 'true',
				settingsVersion: new Date(0).toISOString()
			})
		);

		// Second write uses the original (stale) epoch.
		const result = await run(
			makeRequest({
				retentionDays: '21',
				maxCount: '3000',
				debugEnabled: 'false',
				settingsVersion: new Date(0).toISOString()
			})
		);
		expect(result).toMatchObject({
			status: 409,
			data: { conflict: true }
		});
		// First write's values still in place.
		expect(await getLogRetentionDays()).toBe(14);
		expect(await getLogMaxCount()).toBe(2000);
	});

	it('rejects retentionDays out of range as 400 (Superforms validation failure)', async () => {
		const result = await run(
			makeRequest({
				retentionDays: '999',
				maxCount: '2000',
				debugEnabled: 'true',
				settingsVersion: new Date(0).toISOString()
			})
		);
		expect(result).toMatchObject({ status: 400, data: { error: 'Invalid input' } });
		// Confirm no partial write.
		expect(await getLogRetentionDays()).toBe(7);
		expect(await getLogMaxCount()).toBe(50000);
	});

	it('rejects maxCount below floor as 400', async () => {
		const result = await run(
			makeRequest({
				retentionDays: '14',
				maxCount: '500',
				debugEnabled: 'true',
				settingsVersion: new Date(0).toISOString()
			})
		);
		expect(result).toMatchObject({ status: 400, data: { error: 'Invalid input' } });
		expect(await getLogMaxCount()).toBe(50000);
	});

	it('allows a follow-up save with a bumped settingsVersion (no spurious 409)', async () => {
		await run(
			makeRequest({
				retentionDays: '14',
				maxCount: '2000',
				debugEnabled: 'true',
				settingsVersion: new Date(0).toISOString()
			})
		);
		// Future timestamp wins OCC against any current row updatedAt.
		const result = await run(
			makeRequest({
				retentionDays: '21',
				maxCount: '5000',
				debugEnabled: 'false',
				settingsVersion: new Date(Date.now() + 60_000).toISOString()
			})
		);
		expect(result).toMatchObject({ success: true });
		expect(await getLogRetentionDays()).toBe(21);
		expect(await getLogMaxCount()).toBe(5000);
		expect(await isDebugEnabled()).toBe(false);
	});

	it('coerces debugEnabled from form-encoded "true"/"false" strings', async () => {
		// Superforms decodes form bodies; z.boolean() via standard Superforms
		// boolean handling accepts 'true' / 'false' / 'on' from form encoding.
		const trueResult = await run(
			makeRequest({
				retentionDays: '14',
				maxCount: '2000',
				debugEnabled: 'true',
				settingsVersion: new Date(0).toISOString()
			})
		);
		expect(trueResult).toMatchObject({ success: true });
		expect(await isDebugEnabled()).toBe(true);

		// Seed the row updatedAt so the next write must use a fresh version
		await setAppSetting('log_debug_enabled' as never, 'true');
		const falseResult = await run(
			makeRequest({
				retentionDays: '14',
				maxCount: '2000',
				debugEnabled: 'false',
				settingsVersion: new Date(Date.now() + 60_000).toISOString()
			})
		);
		expect(falseResult).toMatchObject({ success: true });
		expect(await isDebugEnabled()).toBe(false);
	});

	it('rejects stale settingsVersion after an UPDATE (not just after INSERT)', async () => {
		await run(
			makeRequest({
				retentionDays: '14',
				maxCount: '2000',
				debugEnabled: 'true',
				settingsVersion: new Date(0).toISOString()
			})
		);

		const afterInsert = await getAppSettingsUpdatedAt(LOG_SETTINGS_KEYS);
		expect(afterInsert).not.toBeNull();
		const preUpdateVersion = afterInsert!.toISOString();

		await new Promise<void>((resolve) => setTimeout(resolve, 10));

		const updateResult = await run(
			makeRequest({
				retentionDays: '21',
				maxCount: '3000',
				debugEnabled: 'false',
				settingsVersion: preUpdateVersion
			})
		);
		expect(updateResult).toMatchObject({ success: true });

		const staleResult = await run(
			makeRequest({
				retentionDays: '90',
				maxCount: '9000',
				debugEnabled: 'true',
				settingsVersion: preUpdateVersion
			})
		);

		expect(staleResult).toMatchObject({
			status: 409,
			data: {
				conflict: true,
				error: 'Settings changed in another tab. Please reload.'
			}
		});
	});

	it('advances the returned settingsVersion so two consecutive saves both succeed', async () => {
		const first = (await run(
			makeRequest({
				retentionDays: '14',
				maxCount: '2000',
				debugEnabled: 'false',
				settingsVersion: new Date(0).toISOString()
			})
		)) as { form: { data: { settingsVersion: string } }; success?: boolean };

		expect(first).toMatchObject({ success: true });
		const returnedVersion = first.form.data.settingsVersion;
		expect(returnedVersion).not.toBe(new Date(0).toISOString());
		expect(returnedVersion).toBe((await getAppSettingsUpdatedAt(LOG_SETTINGS_KEYS))!.toISOString());

		await new Promise<void>((resolve) => setTimeout(resolve, 10));

		const second = await run(
			makeRequest({
				retentionDays: '30',
				maxCount: '5000',
				debugEnabled: 'true',
				settingsVersion: returnedVersion
			})
		);
		expect(second).toMatchObject({ success: true });
	});
});
