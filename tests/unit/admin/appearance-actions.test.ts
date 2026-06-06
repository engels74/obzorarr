import { beforeEach, describe, expect, it } from 'bun:test';
import {
	AppSettingsKey,
	getUITheme,
	getWrappedLogoMode,
	getWrappedTheme,
	setAppSetting,
	WrappedLogoMode
} from '$lib/server/admin/settings.service';
import { actions } from '../../../src/routes/admin/settings/appearance/+page.server';
import { resetSharedTestDb } from '../../helpers/db';

// The actions handler signatures take `{ request, locals }`. requireAdminActions
// wraps each handler so the test exercises both the admin guard and the action
// body. Post-ISSUE-015 the appearance route uses Superforms with inline OCC:
// success returns `{ form, success, message }` and an advanced
// `form.data.settingsVersion`; a stale/blank version returns
// `fail(409, { form, conflict: true, error })`.
type UpdateUIThemeAction = NonNullable<typeof actions.updateUITheme>;
type UpdateWrappedThemeAction = NonNullable<typeof actions.updateWrappedTheme>;
type UpdateWrappedLogoModeAction = NonNullable<typeof actions.updateWrappedLogoMode>;

const adminLocals = {
	user: { id: 1, plexId: 1, username: 'admin', isAdmin: true }
} as unknown as App.Locals;

const OCC_MESSAGE = 'Settings changed in another tab. Please reload.';

beforeEach(async () => {
	await resetSharedTestDb();
});

function makeRequest(action: string, fields: Record<string, string>): Request {
	const formData = new FormData();
	for (const [k, v] of Object.entries(fields)) formData.set(k, v);
	return new Request(`http://localhost/admin/settings/appearance?/${action}`, {
		method: 'POST',
		body: formData
	});
}

describe('appearance nested route — updateUITheme', () => {
	async function run(request: Request) {
		const handler = actions.updateUITheme as UpdateUIThemeAction;
		return handler({ request, locals: adminLocals } as Parameters<UpdateUIThemeAction>[0]);
	}

	it('persists a valid theme with epoch settingsVersion on a fresh DB', async () => {
		const result = await run(
			makeRequest('updateUITheme', {
				uiTheme: 'modern-minimal',
				settingsVersion: new Date(0).toISOString()
			})
		);
		expect(result).toMatchObject({ success: true, message: 'UI theme updated' });
		expect(await getUITheme()).toBe('modern-minimal');
	});

	it('returns an advanced settingsVersion on a clean save (not the submitted epoch)', async () => {
		const result = (await run(
			makeRequest('updateUITheme', {
				uiTheme: 'supabase',
				settingsVersion: new Date(0).toISOString()
			})
		)) as { form: { data: { settingsVersion: string } }; success?: boolean };
		expect(result).toMatchObject({ success: true });
		expect(result.form.data.settingsVersion).not.toBe(new Date(0).toISOString());
	});

	it('advances the returned settingsVersion so two consecutive saves both succeed (ISSUE-015)', async () => {
		const first = (await run(
			makeRequest('updateUITheme', {
				uiTheme: 'supabase',
				settingsVersion: new Date(0).toISOString()
			})
		)) as { form: { data: { settingsVersion: string } }; success?: boolean };
		expect(first).toMatchObject({ success: true });
		const returnedVersion = first.form.data.settingsVersion;
		expect(returnedVersion).not.toBe(new Date(0).toISOString());

		await new Promise<void>((resolve) => setTimeout(resolve, 10));

		// Second consecutive save reusing the FIRST save's returned version must
		// succeed without a reload (no false 409). This is the regression the
		// pre-migration server (which returned no fresh version) failed.
		const second = await run(
			makeRequest('updateUITheme', {
				uiTheme: 'doom-64',
				settingsVersion: returnedVersion
			})
		);
		expect(second).toMatchObject({ success: true });
		expect(await getUITheme()).toBe('doom-64');
	});

	it('rejects blank settingsVersion as 409 conflict', async () => {
		const result = await run(
			makeRequest('updateUITheme', { uiTheme: 'modern-minimal', settingsVersion: '' })
		);
		expect(result).toMatchObject({
			status: 409,
			data: { conflict: true, error: OCC_MESSAGE }
		});
	});

	it('rejects stale settingsVersion as 409 without overwriting current value', async () => {
		await run(
			makeRequest('updateUITheme', {
				uiTheme: 'soviet-red',
				settingsVersion: new Date(0).toISOString()
			})
		);
		expect(await getUITheme()).toBe('soviet-red');

		const result = await run(
			makeRequest('updateUITheme', {
				uiTheme: 'doom-64',
				settingsVersion: new Date(0).toISOString()
			})
		);
		expect(result).toMatchObject({ status: 409, data: { conflict: true } });
		expect(await getUITheme()).toBe('soviet-red');
	});

	it('rejects unknown theme as 400', async () => {
		const result = await run(
			makeRequest('updateUITheme', {
				uiTheme: 'not-a-theme',
				settingsVersion: new Date(0).toISOString()
			})
		);
		expect(result).toMatchObject({ status: 400, data: { error: 'Invalid theme selection' } });
	});

	it('rejects an absent uiTheme field as 400 instead of silently persisting the enum default', async () => {
		// A request that omits uiTheme entirely (e.g. a stale client) must not
		// have the required z.enum silently filled with its first member
		// ('modern-minimal') and persisted. Expect a 400, no write.
		const result = (await run(
			makeRequest('updateUITheme', { settingsVersion: new Date(0).toISOString() })
		)) as { status: number; data: { error: string; form: { valid: boolean; message?: string } } };
		expect(result).toMatchObject({ status: 400, data: { error: 'Invalid theme selection' } });
		// setMessage(..., { status: 400 }) makes form.valid honest (the absent enum
		// is silently coerced, so without this the client would show a false 'Saved'
		// toast — onUpdated branches on form.valid). Pin valid===false + the message.
		expect(result.data.form.valid).toBe(false);
		expect(result.data.form.message).toBe('Invalid theme selection');
		expect(await getUITheme()).toBe('modern-minimal');
	});
});

describe('appearance nested route — updateWrappedTheme', () => {
	async function run(request: Request) {
		const handler = actions.updateWrappedTheme as UpdateWrappedThemeAction;
		return handler({ request, locals: adminLocals } as Parameters<UpdateWrappedThemeAction>[0]);
	}

	it('persists a valid theme', async () => {
		const result = await run(
			makeRequest('updateWrappedTheme', {
				wrappedTheme: 'amber-minimal',
				settingsVersion: new Date(0).toISOString()
			})
		);
		expect(result).toMatchObject({ success: true, message: 'Wrapped theme updated' });
		expect(await getWrappedTheme()).toBe('amber-minimal');
	});

	it('advances the returned settingsVersion so two consecutive saves both succeed (ISSUE-015)', async () => {
		const first = (await run(
			makeRequest('updateWrappedTheme', {
				wrappedTheme: 'amber-minimal',
				settingsVersion: new Date(0).toISOString()
			})
		)) as { form: { data: { settingsVersion: string } }; success?: boolean };
		expect(first).toMatchObject({ success: true });
		const returnedVersion = first.form.data.settingsVersion;
		expect(returnedVersion).not.toBe(new Date(0).toISOString());

		await new Promise<void>((resolve) => setTimeout(resolve, 10));

		const second = await run(
			makeRequest('updateWrappedTheme', {
				wrappedTheme: 'doom-64',
				settingsVersion: returnedVersion
			})
		);
		expect(second).toMatchObject({ success: true });
		expect(await getWrappedTheme()).toBe('doom-64');
	});

	it('rejects stale settingsVersion as 409', async () => {
		await setAppSetting(AppSettingsKey.WRAPPED_THEME, 'supabase');
		const result = await run(
			makeRequest('updateWrappedTheme', {
				wrappedTheme: 'doom-64',
				settingsVersion: new Date(0).toISOString()
			})
		);
		expect(result).toMatchObject({
			status: 409,
			data: { conflict: true, error: OCC_MESSAGE }
		});
		expect(await getWrappedTheme()).toBe('supabase');
	});

	it('rejects unknown theme as 400', async () => {
		const result = await run(
			makeRequest('updateWrappedTheme', {
				wrappedTheme: 'not-a-theme',
				settingsVersion: new Date(0).toISOString()
			})
		);
		expect(result).toMatchObject({ status: 400, data: { error: 'Invalid theme selection' } });
	});

	it('rejects an absent wrappedTheme field as 400 instead of silently persisting the enum default', async () => {
		// A request that omits wrappedTheme entirely (e.g. a stale client) must not
		// have the required z.enum silently filled with its first member
		// ('modern-minimal') and persisted. Expect a 400, no write.
		const result = (await run(
			makeRequest('updateWrappedTheme', { settingsVersion: new Date(0).toISOString() })
		)) as { status: number; data: { error: string; form: { valid: boolean; message?: string } } };
		expect(result).toMatchObject({ status: 400, data: { error: 'Invalid theme selection' } });
		// See updateUITheme: form.valid must be false so the client toast reports a
		// failure instead of a false 'Saved'.
		expect(result.data.form.valid).toBe(false);
		expect(result.data.form.message).toBe('Invalid theme selection');
		expect(await getWrappedTheme()).toBe('modern-minimal');
	});
});

describe('appearance nested route — updateWrappedLogoMode', () => {
	async function run(request: Request) {
		const handler = actions.updateWrappedLogoMode as UpdateWrappedLogoModeAction;
		return handler({
			request,
			locals: adminLocals
		} as Parameters<UpdateWrappedLogoModeAction>[0]);
	}

	for (const mode of [
		WrappedLogoMode.ALWAYS_SHOW,
		WrappedLogoMode.ALWAYS_HIDE,
		WrappedLogoMode.USER_CHOICE
	]) {
		it(`persists logo mode ${mode}`, async () => {
			const result = await run(
				makeRequest('updateWrappedLogoMode', {
					logoMode: mode,
					settingsVersion: new Date(0).toISOString()
				})
			);
			expect(result).toMatchObject({ success: true });
			expect(await getWrappedLogoMode()).toBe(mode);
		});
	}

	it('advances the returned settingsVersion so two consecutive saves both succeed (ISSUE-015)', async () => {
		const first = (await run(
			makeRequest('updateWrappedLogoMode', {
				logoMode: WrappedLogoMode.ALWAYS_HIDE,
				settingsVersion: new Date(0).toISOString()
			})
		)) as { form: { data: { settingsVersion: string } }; success?: boolean };
		expect(first).toMatchObject({ success: true });
		const returnedVersion = first.form.data.settingsVersion;
		expect(returnedVersion).not.toBe(new Date(0).toISOString());

		await new Promise<void>((resolve) => setTimeout(resolve, 10));

		const second = await run(
			makeRequest('updateWrappedLogoMode', {
				logoMode: WrappedLogoMode.USER_CHOICE,
				settingsVersion: returnedVersion
			})
		);
		expect(second).toMatchObject({ success: true });
		expect(await getWrappedLogoMode()).toBe(WrappedLogoMode.USER_CHOICE);
	});

	it('rejects blank settingsVersion as 409 conflict', async () => {
		const result = await run(
			makeRequest('updateWrappedLogoMode', {
				logoMode: WrappedLogoMode.ALWAYS_HIDE,
				settingsVersion: ''
			})
		);
		expect(result).toMatchObject({
			status: 409,
			data: { conflict: true, error: OCC_MESSAGE }
		});
	});

	it('rejects unknown logo mode as 400', async () => {
		const result = await run(
			makeRequest('updateWrappedLogoMode', {
				logoMode: 'invalid',
				settingsVersion: new Date(0).toISOString()
			})
		);
		expect(result).toMatchObject({ status: 400, data: { error: 'Invalid logo mode' } });
	});

	it('rejects an absent logoMode field as 400 instead of silently persisting the enum default', async () => {
		// A request that omits logoMode entirely (e.g. a stale client) must not
		// have the required z.enum silently filled with its first member
		// ('always_show') and persisted. Expect a 400, no write.
		const result = (await run(
			makeRequest('updateWrappedLogoMode', { settingsVersion: new Date(0).toISOString() })
		)) as { status: number; data: { error: string; form: { valid: boolean; message?: string } } };
		expect(result).toMatchObject({ status: 400, data: { error: 'Invalid logo mode' } });
		// See updateUITheme: form.valid must be false so the client toast reports a
		// failure instead of a false 'Saved'.
		expect(result.data.form.valid).toBe(false);
		expect(result.data.form.message).toBe('Invalid logo mode');
		expect(await getWrappedLogoMode()).toBe(WrappedLogoMode.ALWAYS_SHOW);
	});
});
