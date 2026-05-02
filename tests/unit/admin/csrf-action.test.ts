import { beforeEach, describe, expect, it } from 'bun:test';
import { env } from '$env/dynamic/private';
import {
	AppSettingsKey,
	deleteAppSetting,
	getAppSetting,
	setAppSetting
} from '$lib/server/admin/settings.service';
import { db } from '$lib/server/db/client';
import { appSettings } from '$lib/server/db/schema';
import { actions } from '../../../src/routes/admin/settings/+page.server';

const ORIGIN = 'http://localhost:5173';

type UpdateCsrfOriginAction = NonNullable<typeof actions.updateCsrfOrigin>;

const adminLocals = {
	user: { id: 1, plexId: 1, username: 'admin', isAdmin: true }
} as unknown as App.Locals;

function createRequest(opts: {
	csrfOrigin?: string;
	confirmMismatch?: boolean;
	requestUrl?: string;
}): Request {
	const formData = new FormData();
	if (opts.csrfOrigin !== undefined) {
		formData.set('csrfOrigin', opts.csrfOrigin);
	}
	if (opts.confirmMismatch) {
		formData.set('confirmMismatch', 'true');
	}
	return new Request(opts.requestUrl ?? `${ORIGIN}/admin/settings?/updateCsrfOrigin`, {
		method: 'POST',
		body: formData
	});
}

async function runUpdate(request: Request) {
	const action = actions.updateCsrfOrigin as UpdateCsrfOriginAction;
	return action({ request, locals: adminLocals } as Parameters<UpdateCsrfOriginAction>[0]);
}

describe('admin updateCsrfOrigin action', () => {
	beforeEach(async () => {
		await db.delete(appSettings);
	});

	it('returns fail(409) and does NOT call setAppSetting when origin mismatches and confirmMismatch is absent', async () => {
		const result = (await runUpdate(
			createRequest({ csrfOrigin: 'http://tampered.example.com:5173' })
		)) as { status: number; data: Record<string, unknown> };

		expect(result.status).toBe(409);
		expect(result.data.requireConfirmation).toBe(true);
		expect(result.data.attemptedOrigin).toBe('http://tampered.example.com:5173');
		expect(result.data.requestOrigin).toBe(ORIGIN);
		expect(typeof result.data.csrfMismatchMessage).toBe('string');
		// Critically, no DB write should have happened.
		expect(await getAppSetting(AppSettingsKey.CSRF_ORIGIN)).toBeNull();
	});

	it('writes to DB and returns success+warning when confirmMismatch=true on mismatch', async () => {
		const result = await runUpdate(
			createRequest({
				csrfOrigin: 'http://tampered.example.com:5173',
				confirmMismatch: true
			})
		);

		expect(result).toMatchObject({ success: true, warning: true });
		expect(typeof (result as { message?: string }).message).toBe('string');
		expect(await getAppSetting(AppSettingsKey.CSRF_ORIGIN)).toBe(
			'http://tampered.example.com:5173'
		);
	});

	it('writes to DB and returns plain success when origin matches request origin', async () => {
		const result = await runUpdate(createRequest({ csrfOrigin: ORIGIN }));

		expect(result).toEqual({ success: true, message: 'CSRF origin updated' });
		expect(await getAppSetting(AppSettingsKey.CSRF_ORIGIN)).toBe(ORIGIN);
	});

	it('normalizes trailing slash before persisting', async () => {
		const result = await runUpdate(createRequest({ csrfOrigin: `${ORIGIN}/` }));

		expect(result).toEqual({ success: true, message: 'CSRF origin updated' });
		expect(await getAppSetting(AppSettingsKey.CSRF_ORIGIN)).toBe(ORIGIN);
	});

	it('returns fail(400) for invalid URL', async () => {
		const result = (await runUpdate(createRequest({ csrfOrigin: 'not-a-url' }))) as {
			status: number;
			data: Record<string, unknown>;
		};

		expect(result.status).toBe(400);
		expect(result.data.error).toBe('Invalid origin URL');
		expect(await getAppSetting(AppSettingsKey.CSRF_ORIGIN)).toBeNull();
	});

	it('returns fail(400) when env-locked (ORIGIN env var set)', async () => {
		// $env/dynamic/private is mock.module()-ed at setup time and the underlying
		// `env` object reference is shared across importers — mutate it in place,
		// then restore. process.env doesn't reach the SvelteKit-mocked module.
		const dynamicEnv = env as Record<string, string | undefined>;
		const previous = dynamicEnv.ORIGIN;
		dynamicEnv.ORIGIN = 'http://locked.example.com';
		try {
			const result = (await runUpdate(createRequest({ csrfOrigin: ORIGIN }))) as {
				status: number;
				data: { error: string };
			};

			expect(result.status).toBe(400);
			expect(result.data.error).toMatch(/environment variable/i);
			expect(await getAppSetting(AppSettingsKey.CSRF_ORIGIN)).toBeNull();
		} finally {
			if (previous === undefined) delete dynamicEnv.ORIGIN;
			else dynamicEnv.ORIGIN = previous;
		}
	});

	it('refuses to clear origin when no ORIGIN env and skip flag not set', async () => {
		await setAppSetting(AppSettingsKey.CSRF_ORIGIN, ORIGIN);

		const result = (await runUpdate(createRequest({ csrfOrigin: '' }))) as {
			status: number;
			data: { error: string };
		};

		expect(result.status).toBe(400);
		expect(result.data.error).toMatch(/Cannot clear CSRF origin/);
		expect(await getAppSetting(AppSettingsKey.CSRF_ORIGIN)).toBe(ORIGIN);
	});

	it('clears origin when CSRF skip flag is set', async () => {
		await setAppSetting(AppSettingsKey.CSRF_ORIGIN, ORIGIN);
		await setAppSetting(AppSettingsKey.CSRF_ORIGIN_SKIPPED, 'true');

		const result = await runUpdate(createRequest({ csrfOrigin: '' }));

		expect((result as { success: boolean }).success).toBe(true);
		expect(await getAppSetting(AppSettingsKey.CSRF_ORIGIN)).toBeNull();

		await deleteAppSetting(AppSettingsKey.CSRF_ORIGIN_SKIPPED);
	});
});
