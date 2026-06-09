import { beforeEach, describe, expect, it } from 'bun:test';
import { OCC_CONFLICT_MESSAGE } from '$lib/server/admin/occ-helpers';
import { getPublicLandingLookupEnabled } from '$lib/server/admin/settings.service';
import { actions } from '../../../src/routes/admin/settings/privacy/+page.server';
import { resetSharedTestDb } from '../../helpers/db';

// DF-10: ALL three privacy sub-form OCC conflict branches must return
// fail(409, { form, conflict: true, error: OCC_CONFLICT_MESSAGE }).
//
// The updateServerWrappedSettings and updateUserDefaults OCC branches are
// already exercised in privacy-actions.test.ts. This file adds:
//   - updatePublicLandingLookup stale-version 409 (missing from the existing suite)
//   - assertions that the error payload shape is identical across all three forms
//     (conflict: true + OCC_CONFLICT_MESSAGE + data preserved)
//
// Must fail if any branch reverts from fail(409, ...) to a 200 success.

type UpdateServerWrappedAction = NonNullable<typeof actions.updateServerWrappedSettings>;
type UpdateUserDefaultsAction = NonNullable<typeof actions.updateUserDefaults>;
type UpdatePublicLandingLookupAction = NonNullable<typeof actions.updatePublicLandingLookup>;

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

// ---- updatePublicLandingLookup OCC (not covered in existing suite) ----------

describe('DF-10 — privacy updatePublicLandingLookup OCC branches return 409', () => {
	beforeEach(resetSharedTestDb);

	async function run(fields: Record<string, string>) {
		const handler = actions.updatePublicLandingLookup as UpdatePublicLandingLookupAction;
		return handler({
			request: makeRequest('updatePublicLandingLookup', fields),
			locals: adminLocals
		} as Parameters<UpdatePublicLandingLookupAction>[0]);
	}

	it('blank settingsVersion → 409 + conflict:true + OCC_CONFLICT_MESSAGE', async () => {
		const result = await run({
			publicLandingLookup: 'true',
			settingsVersion: ''
		});
		expect(result).toMatchObject({
			status: 409,
			data: { conflict: true, error: OCC_CONFLICT_MESSAGE }
		});
	});

	it('stale settingsVersion → 409 + OCC_CONFLICT_MESSAGE + value NOT overwritten', async () => {
		// First, do a valid save to advance the stored version.
		await run({
			publicLandingLookup: 'false',
			settingsVersion: new Date(0).toISOString()
		});
		expect(await getPublicLandingLookupEnabled()).toBe(false);

		// Now submit with the stale epoch → must 409 without flipping the value.
		const result = await run({
			publicLandingLookup: 'true',
			settingsVersion: new Date(0).toISOString()
		});
		expect(result).toMatchObject({
			status: 409,
			data: { conflict: true, error: OCC_CONFLICT_MESSAGE }
		});
		// The stored value must NOT have been overwritten by the stale save.
		expect(await getPublicLandingLookupEnabled()).toBe(false);
	});

	it('fresh settingsVersion succeeds and advances the returned version (ISSUE-004)', async () => {
		const first = (await run({
			publicLandingLookup: 'true',
			settingsVersion: new Date(0).toISOString()
		})) as { form: { data: { settingsVersion: string } }; success?: boolean };
		expect(first).toMatchObject({ success: true });
		const advanced = first.form.data.settingsVersion;
		expect(advanced).not.toBe(new Date(0).toISOString());

		// Small delay so the next write has a distinct timestamp.
		await new Promise<void>((resolve) => setTimeout(resolve, 10));

		const second = await run({
			publicLandingLookup: 'false',
			settingsVersion: advanced
		});
		expect(second).toMatchObject({ success: true });
		expect(await getPublicLandingLookupEnabled()).toBe(false);
	});

	it('rejects checkbox-style "on" boolean for publicLandingLookup as 400 (FormBooleanSchema strictness)', async () => {
		const result = await run({
			publicLandingLookup: 'on',
			settingsVersion: new Date(0).toISOString()
		});
		expect(result).toMatchObject({ status: 400 });
	});
});

// ---- Cross-form: blank settingsVersion always 409 on all three sub-forms ----

describe('DF-10 — all three privacy sub-forms 409 on blank settingsVersion', () => {
	beforeEach(resetSharedTestDb);

	it('updateServerWrappedSettings: blank settingsVersion → 409 + OCC_CONFLICT_MESSAGE', async () => {
		const handler = actions.updateServerWrappedSettings as UpdateServerWrappedAction;
		const result = await handler({
			request: makeRequest('updateServerWrappedSettings', {
				anonymizationMode: 'real',
				serverWrappedShareMode: 'public',
				settingsVersion: ''
			}),
			locals: adminLocals
		} as Parameters<UpdateServerWrappedAction>[0]);
		expect(result).toMatchObject({
			status: 409,
			data: { conflict: true, error: OCC_CONFLICT_MESSAGE }
		});
	});

	it('updateUserDefaults: blank settingsVersion → 409 + OCC_CONFLICT_MESSAGE', async () => {
		const handler = actions.updateUserDefaults as UpdateUserDefaultsAction;
		const result = await handler({
			request: makeRequest('updateUserDefaults', {
				defaultShareMode: 'public',
				allowUserControl: 'true',
				settingsVersion: ''
			}),
			locals: adminLocals
		} as Parameters<UpdateUserDefaultsAction>[0]);
		expect(result).toMatchObject({
			status: 409,
			data: { conflict: true, error: OCC_CONFLICT_MESSAGE }
		});
	});

	it('updatePublicLandingLookup: blank settingsVersion → 409 + OCC_CONFLICT_MESSAGE', async () => {
		const handler = actions.updatePublicLandingLookup as UpdatePublicLandingLookupAction;
		const result = await handler({
			request: makeRequest('updatePublicLandingLookup', {
				publicLandingLookup: 'true',
				settingsVersion: ''
			}),
			locals: adminLocals
		} as Parameters<UpdatePublicLandingLookupAction>[0]);
		expect(result).toMatchObject({
			status: 409,
			data: { conflict: true, error: OCC_CONFLICT_MESSAGE }
		});
	});
});
