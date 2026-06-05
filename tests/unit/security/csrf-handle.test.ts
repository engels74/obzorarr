import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { and, desc, eq, like } from 'drizzle-orm';
import { AppSettingsKey, setAppSetting } from '$lib/server/admin/settings.service';
import { db } from '$lib/server/db/client';
import { logs } from '$lib/server/db/schema';
import { logger } from '$lib/server/logging';
import { csrfHandle } from '$lib/server/security/csrf-handle';
import { resetSharedTestDb } from '../../helpers/db';

async function flushLogs(): Promise<void> {
	// Flush twice: the first call drains the buffer into the DB, and the second
	// ensures any log entries appended during the first flush (e.g. from a timer
	// that fired concurrently) are also persisted before the test reads rows.
	await logger.forceFlush();
	await logger.forceFlush();
}

async function getCsrfLogByMessage(message: string) {
	return db
		.select()
		.from(logs)
		.where(and(eq(logs.source, 'CSRF'), like(logs.message, `%${message}%`)))
		.orderBy(desc(logs.timestamp));
}

interface RouteOverride {
	id: string | null;
}

function makeEvent(options: {
	method: string;
	url: string;
	origin?: string;
	route?: RouteOverride;
}) {
	const headers = new Headers();
	if (options.origin !== undefined) {
		headers.set('origin', options.origin);
	}

	const request = new Request(options.url, {
		method: options.method,
		headers
	});

	return {
		request,
		url: new URL(options.url),
		route: options.route ?? { id: null }
	} as unknown as Parameters<typeof csrfHandle>[0]['event'];
}

async function invoke(event: ReturnType<typeof makeEvent>): Promise<Response> {
	const sentinel = new Response('resolved', { status: 200 });
	const resolve = mock(async () => sentinel);
	const result = await csrfHandle({
		event,
		resolve
	} as unknown as Parameters<typeof csrfHandle>[0]);
	return result as Response;
}

describe('csrfHandle (production mode)', () => {
	beforeEach(async () => {
		await resetSharedTestDb();
	});

	describe('no origin configured', () => {
		it('rejects state-changing requests with 403 when onboarding is complete and no skip flag is set', async () => {
			await setAppSetting(AppSettingsKey.ONBOARDING_COMPLETED, 'true');

			const event = makeEvent({
				method: 'POST',
				url: 'https://example.com/admin/settings',
				origin: 'https://example.com'
			});

			const response = await invoke(event);

			expect(response.status).toBe(403);
			const body = await response.json();
			expect(body.error).toBe('CSRF protection not configured');
		});

		it('passes through when onboarding is complete but CSRF_ORIGIN_SKIPPED is set to true', async () => {
			await setAppSetting(AppSettingsKey.ONBOARDING_COMPLETED, 'true');
			await setAppSetting(AppSettingsKey.CSRF_ORIGIN_SKIPPED, 'true');

			const event = makeEvent({
				method: 'POST',
				url: 'https://example.com/admin/settings',
				origin: 'https://example.com'
			});

			const response = await invoke(event);

			expect(response.status).toBe(200);
			expect(await response.text()).toBe('resolved');
		});

		it('passes through when onboarding is still in progress', async () => {
			// ONBOARDING_COMPLETED not set ⇒ onboarding in progress.

			const event = makeEvent({
				method: 'POST',
				url: 'https://example.com/onboarding/csrf?/skipCsrf',
				origin: 'https://example.com'
			});

			const response = await invoke(event);

			expect(response.status).toBe(200);
			expect(await response.text()).toBe('resolved');
		});
	});

	describe('origin configured (logging redaction)', () => {
		it('missing origin: logs route id instead of raw pathname with share tokens', async () => {
			await setAppSetting(AppSettingsKey.CSRF_ORIGIN, 'https://example.com');

			const tokenUUID = '550e8400-e29b-41d4-a716-446655440000';
			const event = makeEvent({
				method: 'POST',
				url: `https://example.com/wrapped/2024/u/${tokenUUID}?/updateShareMode`,
				// No origin header → missing-origin branch.
				route: { id: '/wrapped/[year=year]/u/[identifier]' }
			});

			const response = await invoke(event);
			expect(response.status).toBe(403);

			await flushLogs();
			const rows = await getCsrfLogByMessage('missing origin header');
			expect(rows.length).toBeGreaterThan(0);

			const metadata = rows[0]?.metadata ?? '';
			expect(metadata).toContain('/wrapped/[year=year]/u/[identifier]');
			// The raw UUID must NOT appear anywhere in the log metadata.
			expect(metadata).not.toContain(tokenUUID);
			expect(metadata).not.toContain('"path"');
		});

		it('origin mismatch: logs route id instead of raw pathname with share tokens', async () => {
			await setAppSetting(AppSettingsKey.CSRF_ORIGIN, 'https://example.com');

			const tokenUUID = '650e8400-e29b-41d4-a716-446655440000';
			const event = makeEvent({
				method: 'POST',
				url: `https://example.com/wrapped/2024/u/${tokenUUID}?/updateShareMode`,
				origin: 'https://attacker.example',
				route: { id: '/wrapped/[year=year]/u/[identifier]' }
			});

			const response = await invoke(event);
			expect(response.status).toBe(403);

			await flushLogs();
			const rows = await getCsrfLogByMessage('origin mismatch');
			expect(rows.length).toBeGreaterThan(0);

			const metadata = rows[0]?.metadata ?? '';
			expect(metadata).toContain('/wrapped/[year=year]/u/[identifier]');
			expect(metadata).not.toContain(tokenUUID);
		});

		it('falls back to <unmatched> when route.id is null', async () => {
			await setAppSetting(AppSettingsKey.CSRF_ORIGIN, 'https://example.com');

			const event = makeEvent({
				method: 'POST',
				url: 'https://example.com/totally/unknown',
				origin: 'https://attacker.example',
				route: { id: null }
			});

			const response = await invoke(event);
			expect(response.status).toBe(403);

			await flushLogs();
			const rows = await getCsrfLogByMessage('origin mismatch');
			expect(rows.length).toBeGreaterThan(0);

			const metadata = rows[0]?.metadata ?? '';
			expect(metadata).toContain('<unmatched>');
		});
	});

	describe('CSRF self-lockout recovery carve-out (ISSUE-002)', () => {
		it('lets the security-route updateCsrfOrigin repair POST reach its action despite a mismatched stored origin', async () => {
			// A bad origin is stored — every normal POST would 403.
			await setAppSetting(AppSettingsKey.CSRF_ORIGIN, 'https://wrong.example');

			const event = makeEvent({
				method: 'POST',
				// Admin is loaded on the real origin and repairs the setting.
				url: 'https://example.com/admin/settings/security?/updateCsrfOrigin',
				origin: 'https://example.com',
				route: { id: '/admin/settings/security' }
			});

			const response = await invoke(event);
			// Reaches the action (200 sentinel) — the action's confirm-mismatch
			// gate governs the actual write, not the hook.
			expect(response.status).toBe(200);
			expect(await response.text()).toBe('resolved');

			await flushLogs();
			const rows = await getCsrfLogByMessage('CSRF self-repair');
			expect(rows.length).toBeGreaterThan(0);
		});

		it('does NOT extend the carve-out to a different action on the same route', async () => {
			await setAppSetting(AppSettingsKey.CSRF_ORIGIN, 'https://example.com');

			const event = makeEvent({
				method: 'POST',
				url: 'https://example.com/admin/settings/security?/toggleCsrfSkip',
				origin: 'https://attacker.example',
				route: { id: '/admin/settings/security' }
			});

			const response = await invoke(event);
			expect(response.status).toBe(403);
		});

		it('does NOT extend the carve-out to the updateCsrfOrigin action on a different route', async () => {
			await setAppSetting(AppSettingsKey.CSRF_ORIGIN, 'https://example.com');

			const event = makeEvent({
				method: 'POST',
				url: 'https://example.com/admin/settings/connections?/updateCsrfOrigin',
				origin: 'https://attacker.example',
				route: { id: '/admin/settings/connections' }
			});

			const response = await invoke(event);
			expect(response.status).toBe(403);
		});

		it('keys on route+action regardless of origin header (forged x-forwarded cannot widen it)', async () => {
			// Under TRUST_PROXY, proxyHandle rewrites event.url.origin from
			// x-forwarded-* before csrfHandle runs. The carve-out decision must be
			// independent of that origin: the repair POST resolves whether or not
			// the (spoofable) request origin matches, AND a non-repair route still
			// 403s — so a forged forwarded header cannot exempt anything else.
			await setAppSetting(AppSettingsKey.CSRF_ORIGIN, 'https://wrong.example');

			const repairWithForgedOrigin = makeEvent({
				method: 'POST',
				url: 'https://example.com/admin/settings/security?/updateCsrfOrigin',
				origin: 'https://attacker.example',
				route: { id: '/admin/settings/security' }
			});
			const repairResponse = await invoke(repairWithForgedOrigin);
			expect(repairResponse.status).toBe(200);

			// A different state-changing route gets no exemption.
			const otherRoute = makeEvent({
				method: 'POST',
				url: 'https://example.com/admin/users?/deleteUser',
				origin: 'https://attacker.example',
				route: { id: '/admin/users' }
			});
			const otherResponse = await invoke(otherRoute);
			expect(otherResponse.status).toBe(403);
		});
	});
});
