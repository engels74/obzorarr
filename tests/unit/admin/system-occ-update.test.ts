/**
 * Repro test for ISSUE-006: log-settings OCC never fires on stale UPDATE.
 *
 * The three log setters (setLogRetentionDays, setLogMaxCount, setDebugEnabled)
 * did NOT include `updatedAt: now` in their onConflictDoUpdate set clause.
 * After an INSERT the DB default sets updatedAt=T1. A subsequent UPDATE keeps
 * updatedAt=T1 (unchanged). A stale-save then submits T1 as the settingsVersion,
 * which passes the OCC check (T1 === currentMs) and silently clobbers.
 *
 * Fix: add `updatedAt: now` to all three setters' set:{} block, mirroring
 * setAppSetting in settings.service.ts.
 */
import { beforeEach, describe, expect, it } from 'bun:test';
import { getAppSettingsUpdatedAt, LOG_SETTINGS_KEYS } from '$lib/server/admin/settings.service';
import { db } from '$lib/server/db/client';
import { appSettings } from '$lib/server/db/schema';
import { actions } from '../../../src/routes/admin/settings/system/+page.server';

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

describe('system — updateLogSettings OCC on UPDATE path (ISSUE-006 repro)', () => {
	beforeEach(async () => {
		await db.delete(appSettings);
	});

	async function run(request: Request) {
		const handler = actions.updateLogSettings as UpdateLogSettingsAction;
		return handler({
			request,
			locals: adminLocals
		} as Parameters<UpdateLogSettingsAction>[0]);
	}

	it('rejects stale settingsVersion after an UPDATE (not just after INSERT)', async () => {
		// Step 1: INSERT — fresh DB, epoch sentinel is valid for first save.
		await run(
			makeRequest({
				retentionDays: '14',
				maxCount: '2000',
				debugEnabled: 'true',
				settingsVersion: new Date(0).toISOString()
			})
		);

		// Capture the version written by the INSERT.
		const afterInsert = await getAppSettingsUpdatedAt(LOG_SETTINGS_KEYS);
		expect(afterInsert).not.toBeNull();
		const preUpdateVersion = afterInsert!.toISOString();

		// Tiny delay so a fixed new Date() in the UPDATE is strictly > T1.
		await new Promise<void>((resolve) => setTimeout(resolve, 10));

		// Step 2: UPDATE — a legitimate second save using the post-INSERT version.
		const updateResult = await run(
			makeRequest({
				retentionDays: '21',
				maxCount: '3000',
				debugEnabled: 'false',
				settingsVersion: preUpdateVersion
			})
		);
		expect(updateResult).toMatchObject({ success: true });

		// Step 3: Stale-save with the PRE-UPDATE version — must be rejected as 409.
		// BEFORE the fix: updatedAt was not advanced by the UPDATE, so
		// submittedMs (T1) === currentMs (T1) → OCC passes → clobbers (BUG).
		// AFTER the fix: updatedAt advances to T2 > T1 → submittedMs < currentMs → 409.
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

	it('advances the returned settingsVersion so two consecutive saves both succeed (ISSUE-004)', async () => {
		// First save (INSERT) from the epoch sentinel.
		const first = (await run(
			makeRequest({
				retentionDays: '14',
				maxCount: '2000',
				debugEnabled: 'false',
				settingsVersion: new Date(0).toISOString()
			})
		)) as { form: { data: { settingsVersion: string } }; success?: boolean };

		expect(first).toMatchObject({ success: true });
		// The action must return an ADVANCED version (not the submitted epoch),
		// otherwise the next save would false-409 without a page reload.
		const returnedVersion = first.form.data.settingsVersion;
		expect(returnedVersion).not.toBe(new Date(0).toISOString());
		expect(returnedVersion).toBe((await getAppSettingsUpdatedAt(LOG_SETTINGS_KEYS))!.toISOString());

		// Tiny delay so the second UPDATE's updatedAt is strictly greater.
		await new Promise<void>((resolve) => setTimeout(resolve, 10));

		// Second consecutive save using the version the FIRST save returned —
		// must succeed (no reload needed).
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
