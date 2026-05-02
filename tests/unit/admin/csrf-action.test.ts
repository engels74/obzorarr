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
	originHeader?: string | null;
}): Request {
	const formData = new FormData();
	if (opts.csrfOrigin !== undefined) {
		formData.set('csrfOrigin', opts.csrfOrigin);
	}
	if (opts.confirmMismatch) {
		formData.set('confirmMismatch', 'true');
	}
	const requestUrl = opts.requestUrl ?? `${ORIGIN}/admin/settings?/updateCsrfOrigin`;
	const headers: HeadersInit = {};
	// Default to setting Origin: ORIGIN so tests exercise the same source-of-truth
	// (browser Origin header) that csrfHandle uses. Pass `originHeader: null` to
	// omit it explicitly; pass a string to override.
	if (opts.originHeader !== null) {
		headers.Origin = opts.originHeader ?? ORIGIN;
	}
	return new Request(requestUrl, {
		method: 'POST',
		body: formData,
		headers
	});
}

async function runUpdate(request: Request, urlOverride?: string) {
	const action = actions.updateCsrfOrigin as UpdateCsrfOriginAction;
	const url = new URL(urlOverride ?? request.url);
	return action({ request, url, locals: adminLocals } as Parameters<UpdateCsrfOriginAction>[0]);
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

	it('uses the browser Origin header for the mismatch check, not request.url', async () => {
		// Behind a reverse proxy, request.url is the immutable raw internal URL
		// (e.g. http://localhost:3000) while the browser's Origin header carries
		// the public-facing origin (e.g. https://app.example.com). The mismatch
		// check must use the Origin header so it predicts the same comparison
		// csrfHandle will perform. Saving the public origin while the request
		// arrives at the internal URL must NOT trip the lockout warning.
		const publicOrigin = 'https://app.example.com';
		const internalUrl = 'http://localhost:3000/admin/settings?/updateCsrfOrigin';
		const result = await runUpdate(
			createRequest({
				csrfOrigin: publicOrigin,
				requestUrl: internalUrl,
				originHeader: publicOrigin
			})
		);

		expect(result).toEqual({ success: true, message: 'CSRF origin updated' });
		expect(await getAppSetting(AppSettingsKey.CSRF_ORIGIN)).toBe(publicOrigin);
	});

	it('falls back to event.url.origin (proxy-rewritten) when Origin/Referer headers are absent', async () => {
		// proxyHandle rewrites event.url to the public-facing origin. When a
		// request arrives without Origin or Referer (unusual for a browser POST
		// but possible), we should use event.url.origin as the fallback rather
		// than request.url which is the raw internal URL.
		const publicOrigin = 'https://app.example.com';
		const internalUrl = 'http://localhost:3000/admin/settings?/updateCsrfOrigin';
		const result = await runUpdate(
			createRequest({
				csrfOrigin: publicOrigin,
				requestUrl: internalUrl,
				originHeader: null
			}),
			`${publicOrigin}/admin/settings?/updateCsrfOrigin`
		);

		expect(result).toEqual({ success: true, message: 'CSRF origin updated' });
		expect(await getAppSetting(AppSettingsKey.CSRF_ORIGIN)).toBe(publicOrigin);
	});

	it('treats whitespace-only csrfOrigin as a clear request, not invalid input', async () => {
		// Whitespace-only inputs should route to the clear branch (same as '') rather
		// than failing schema validation with a confusing "Invalid origin URL" 400.
		await setAppSetting(AppSettingsKey.CSRF_ORIGIN, ORIGIN);
		await setAppSetting(AppSettingsKey.CSRF_ORIGIN_SKIPPED, 'true');

		const result = await runUpdate(createRequest({ csrfOrigin: '   ' }));

		expect((result as { success: boolean }).success).toBe(true);
		expect(await getAppSetting(AppSettingsKey.CSRF_ORIGIN)).toBeNull();

		await deleteAppSetting(AppSettingsKey.CSRF_ORIGIN_SKIPPED);
	});
});
