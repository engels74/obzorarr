import { beforeEach, describe, expect, it } from 'bun:test';
import {
	AppSettingsKey,
	getUITheme,
	getWrappedLogoMode,
	getWrappedTheme,
	setAppSetting,
	WrappedLogoMode
} from '$lib/server/admin/settings.service';
import { db } from '$lib/server/db/client';
import { appSettings } from '$lib/server/db/schema';
import { actions } from '../../../src/routes/admin/settings/appearance/+page.server';

// The actions handler signatures take `{ request, locals }` (and `url` for some).
// requireAdminActions wraps each handler so the test exercises both the admin
// guard and the action body.
type UpdateUIThemeAction = NonNullable<typeof actions.updateUITheme>;
type UpdateWrappedThemeAction = NonNullable<typeof actions.updateWrappedTheme>;
type UpdateWrappedLogoModeAction = NonNullable<typeof actions.updateWrappedLogoMode>;

const adminLocals = {
	user: { id: 1, plexId: 1, username: 'admin', isAdmin: true }
} as unknown as App.Locals;

function makeRequest(action: string, fields: Record<string, string>): Request {
	const formData = new FormData();
	for (const [k, v] of Object.entries(fields)) formData.set(k, v);
	return new Request(`http://localhost/admin/settings/appearance?/${action}`, {
		method: 'POST',
		body: formData
	});
}

describe('appearance nested route — updateUITheme', () => {
	beforeEach(async () => {
		await db.delete(appSettings);
	});

	async function run(request: Request) {
		const handler = actions.updateUITheme as UpdateUIThemeAction;
		return handler({ request, locals: adminLocals } as Parameters<UpdateUIThemeAction>[0]);
	}

	it('persists a valid theme with epoch settingsVersion on a fresh DB', async () => {
		const result = await run(
			makeRequest('updateUITheme', {
				theme: 'modern-minimal',
				settingsVersion: new Date(0).toISOString()
			})
		);
		expect(result).toMatchObject({ success: true, message: 'UI theme updated' });
		expect(await getUITheme()).toBe('modern-minimal');
	});

	it('rejects blank settingsVersion as 409 __OCC_CONFLICT__', async () => {
		const result = await run(
			makeRequest('updateUITheme', { theme: 'modern-minimal', settingsVersion: '' })
		);
		expect(result).toMatchObject({
			status: 409,
			data: { error: '__OCC_CONFLICT__' }
		});
		// `current` ISO included so the client can refresh
		expect(typeof (result as { data: { settingsVersion: unknown } }).data.settingsVersion).toBe(
			'string'
		);
	});

	it('rejects stale settingsVersion as 409 without overwriting current value', async () => {
		await run(
			makeRequest('updateUITheme', {
				theme: 'soviet-red',
				settingsVersion: new Date(0).toISOString()
			})
		);
		expect(await getUITheme()).toBe('soviet-red');

		const result = await run(
			makeRequest('updateUITheme', {
				theme: 'doom-64',
				settingsVersion: new Date(0).toISOString()
			})
		);
		expect(result).toMatchObject({ status: 409, data: { error: '__OCC_CONFLICT__' } });
		expect(await getUITheme()).toBe('soviet-red');
	});

	it('rejects unknown theme as 400', async () => {
		const result = await run(
			makeRequest('updateUITheme', {
				theme: 'not-a-theme',
				settingsVersion: new Date(0).toISOString()
			})
		);
		expect(result).toMatchObject({ status: 400, data: { error: 'Invalid theme selection' } });
	});
});

describe('appearance nested route — updateWrappedTheme', () => {
	beforeEach(async () => {
		await db.delete(appSettings);
	});

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

	it('falls back to the `theme` field when `wrappedTheme` is missing', async () => {
		// The action reads `wrappedTheme ?? theme` because the monolith UI used
		// both names across panels; the nested route preserves the fallback so
		// stale clients still work.
		const result = await run(
			makeRequest('updateWrappedTheme', {
				theme: 'supabase',
				settingsVersion: new Date(0).toISOString()
			})
		);
		expect(result).toMatchObject({ success: true });
		expect(await getWrappedTheme()).toBe('supabase');
	});

	it('prefers `wrappedTheme` over `theme` when both are present (?? precedence)', async () => {
		// Pin the documented precedence of `wrappedTheme ?? theme`. If a client
		// happens to send both (a stale UI from the monolith era + the new
		// per-tab input both wired up), wrappedTheme wins.
		const result = await run(
			makeRequest('updateWrappedTheme', {
				wrappedTheme: 'doom-64',
				theme: 'amber-minimal',
				settingsVersion: new Date(0).toISOString()
			})
		);
		expect(result).toMatchObject({ success: true });
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
		expect(result).toMatchObject({ status: 409, data: { error: '__OCC_CONFLICT__' } });
		expect(await getWrappedTheme()).toBe('supabase');
	});
});

describe('appearance nested route — updateWrappedLogoMode', () => {
	beforeEach(async () => {
		await db.delete(appSettings);
	});

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

	it('rejects blank settingsVersion as 409 __OCC_CONFLICT__', async () => {
		const result = await run(
			makeRequest('updateWrappedLogoMode', {
				logoMode: WrappedLogoMode.ALWAYS_HIDE,
				settingsVersion: ''
			})
		);
		expect(result).toMatchObject({
			status: 409,
			data: { error: '__OCC_CONFLICT__' }
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
});
