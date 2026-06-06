import { beforeEach, describe, expect, it } from 'bun:test';
import { getAnonymizationMode } from '$lib/server/admin/settings.service';
import {
	getGlobalAllowUserControl,
	getGlobalDefaultShareMode,
	getServerWrappedShareMode
} from '$lib/server/sharing/service';
import { actions } from '../../../src/routes/admin/settings/privacy/+page.server';
import { resetSharedTestDb } from '../../helpers/db';

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
	beforeEach(resetSharedTestDb);

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

	it('advances the returned settingsVersion so two consecutive saves both succeed (ISSUE-004)', async () => {
		const first = (await run(
			makeRequest('updateServerWrappedSettings', {
				anonymizationMode: 'anonymous',
				serverWrappedShareMode: 'private-oauth',
				settingsVersion: new Date(0).toISOString()
			})
		)) as { form: { data: { settingsVersion: string } }; success?: boolean };
		expect(first).toMatchObject({ success: true });
		// The action must hand back an advanced version, not the submitted epoch.
		const returnedVersion = first.form.data.settingsVersion;
		expect(returnedVersion).not.toBe(new Date(0).toISOString());

		await new Promise<void>((resolve) => setTimeout(resolve, 10));

		// Second consecutive save reusing the FIRST save's returned version must
		// succeed without a reload (no false 409).
		const second = await run(
			makeRequest('updateServerWrappedSettings', {
				anonymizationMode: 'real',
				serverWrappedShareMode: 'public',
				settingsVersion: returnedVersion
			})
		);
		expect(second).toMatchObject({ success: true });
		expect(await getAnonymizationMode()).toBe('real');
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
	beforeEach(resetSharedTestDb);

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

	it('advances the returned settingsVersion so two consecutive saves both succeed (ISSUE-004)', async () => {
		const first = (await run(
			makeRequest('updateUserDefaults', {
				defaultShareMode: 'public',
				allowUserControl: 'true',
				settingsVersion: new Date(0).toISOString()
			})
		)) as { form: { data: { settingsVersion: string } }; success?: boolean };
		expect(first).toMatchObject({ success: true });
		const returnedVersion = first.form.data.settingsVersion;
		expect(returnedVersion).not.toBe(new Date(0).toISOString());

		await new Promise<void>((resolve) => setTimeout(resolve, 10));

		const second = await run(
			makeRequest('updateUserDefaults', {
				defaultShareMode: 'private-oauth',
				allowUserControl: 'false',
				settingsVersion: returnedVersion
			})
		);
		expect(second).toMatchObject({ success: true });
		expect(await getGlobalDefaultShareMode()).toBe('private-oauth');
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

	it('rejects checkbox-style boolean for allowUserControl (FormBooleanSchema strictness)', async () => {
		// FormBooleanSchema = z.union([z.literal('true'), z.literal('false'),
		// z.literal(true), z.literal(false)]).transform. The HTML checkbox 'on'
		// string is NOT in the union — schema validation fails before any
		// service-layer write. Without this guard, a refactor to z.preprocess
		// or z.coerce.boolean would silently turn 'on' into false (or true,
		// depending on the coercion rule) without the operator noticing.
		const result = await run(
			makeRequest('updateUserDefaults', {
				defaultShareMode: 'public',
				allowUserControl: 'on',
				settingsVersion: new Date(0).toISOString()
			})
		);
		expect(result).toMatchObject({ status: 400, data: { error: 'Invalid input' } });
	});

	it('ISSUE-016 regression: stale save 409s with the surfaceOccConflict marker, fresh save advances version', async () => {
		// Locks in the #125 fix: updateUserDefaults must return the exact conflict
		// shape `surfaceOccConflict` keys on (`conflict: true` + OCC message) for a
		// stale settingsVersion, AND a fresh successful save must advance the
		// returned settingsVersion. Together these prevent the false-success /
		// sequential-save staleness class of bug on the privacy tab.
		const fresh = (await run(
			makeRequest('updateUserDefaults', {
				defaultShareMode: 'public',
				allowUserControl: 'true',
				settingsVersion: new Date(0).toISOString()
			})
		)) as { form: { data: { settingsVersion: string } }; success?: boolean };
		expect(fresh).toMatchObject({ success: true });
		const advanced = fresh.form.data.settingsVersion;
		expect(advanced).not.toBe(new Date(0).toISOString());

		// A subsequent submission with the now-stale epoch must 409 with the
		// marker, not false-succeed.
		const stale = await run(
			makeRequest('updateUserDefaults', {
				defaultShareMode: 'private-oauth',
				allowUserControl: 'false',
				settingsVersion: new Date(0).toISOString()
			})
		);
		expect(stale).toMatchObject({
			status: 409,
			data: { conflict: true, error: 'Settings changed in another tab. Please reload.' }
		});
		expect(await getGlobalDefaultShareMode()).toBe('public');
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
	beforeEach(resetSharedTestDb);

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
		// Toast pluralisation is folded into the message (ISSUE-007 fix):
		// 0 → "No users needed to be updated"
		// 1 → "Updated 1 user share record"
		// N>1 → "Updated N user share records"
		const result = await run();
		expect(result).toMatchObject({
			success: true,
			message: 'No users needed to be updated'
		});
	});

	it('survives when global defaults have not been initialised yet', async () => {
		// Belt-and-suspenders: even with empty appSettings, the bulk action
		// shouldn't throw — it falls back to schema defaults.
		const result = await run();
		expect(result).toMatchObject({ success: true });
	});
});
