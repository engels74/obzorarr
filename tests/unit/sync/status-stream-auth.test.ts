import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { AppSettingsKey, setAppSetting } from '$lib/server/admin/settings.service';
import { db } from '$lib/server/db/client';
import { appSettings } from '$lib/server/db/schema';
import { GET } from '../../../src/routes/api/sync/status/stream/+server';

type HandlerArgs = Parameters<typeof GET>[0];

const anonLocals = {} as HandlerArgs['locals'];

const authedLocals = {
	user: { id: 1, plexId: 100, username: 'admin', isAdmin: true }
} as HandlerArgs['locals'];

function runGet(locals: HandlerArgs['locals'] = anonLocals): ReturnType<typeof GET> {
	const request = new Request('http://localhost/api/sync/status/stream');
	return GET({
		request,
		locals,
		url: new URL('http://localhost/api/sync/status/stream'),
		getClientAddress: () => '127.0.0.1'
	} as unknown as HandlerArgs);
}

/**
 * ISSUE-017 — Gate /api/sync/status/stream
 *
 * The endpoint must be conditionally public:
 *   - anonymous access is ALLOWED while onboarding is incomplete (pre-account)
 *   - anonymous access is DENIED (401) once onboarding is complete
 *   - authenticated access is ALLOWED once onboarding is complete
 */
describe('GET /api/sync/status/stream — auth gate (ISSUE-017)', () => {
	beforeEach(async () => {
		// Start each test with a clean app_settings table so onboarding state
		// is unambiguous (no ONBOARDING_COMPLETED row = onboarding pending).
		await db.delete(appSettings);
	});

	afterEach(async () => {
		await db.delete(appSettings);
	});

	it('(a) denies anonymous GET with 401 once onboarding is complete', async () => {
		// Mark onboarding complete — simulates a fully-provisioned install.
		await setAppSetting(AppSettingsKey.ONBOARDING_COMPLETED, 'true');

		const response = await runGet(anonLocals);

		expect(response.status).toBe(401);
		expect(response.headers.get('Cache-Control')).toBe('no-store');
		const body = await response.json();
		expect(body).toMatchObject({ message: 'Unauthorized' });
	});

	it('(b) allows anonymous GET while onboarding is incomplete (pre-account)', async () => {
		// No ONBOARDING_COMPLETED row — fresh install, onboarding in progress.
		// The onboarding wizard must be able to poll before any user account exists.
		const response = await runGet(anonLocals);

		// Should receive the SSE stream (200 text/event-stream), not a denial.
		expect(response.status).toBe(200);
		expect(response.headers.get('Content-Type')).toBe('text/event-stream');

		// Abort the stream so the interval timer does not leak into subsequent tests.
		response.body?.cancel();
	});

	it('(c) allows authenticated GET once onboarding is complete', async () => {
		await setAppSetting(AppSettingsKey.ONBOARDING_COMPLETED, 'true');

		const response = await runGet(authedLocals);

		expect(response.status).toBe(200);
		expect(response.headers.get('Content-Type')).toBe('text/event-stream');

		response.body?.cancel();
	});
});
