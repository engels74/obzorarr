import { beforeEach, describe, expect, it } from 'bun:test';
import { isHttpError } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { AppSettingsKey, setAppSetting } from '$lib/server/admin/settings.service';
import { db } from '$lib/server/db/client';
import { appSettings } from '$lib/server/db/schema';
import { clearRateLimitStore } from '$lib/server/ratelimit';
import { GET } from '../../../src/routes/api/security/reverse-proxy-diagnostic/+server';

type HandlerArgs = Parameters<typeof GET>[0];

const adminLocals = {
	user: { id: 1, plexId: 100, username: 'admin', isAdmin: true }
} as HandlerArgs['locals'];

const userLocals = {
	user: { id: 2, plexId: 200, username: 'viewer', isAdmin: false }
} as HandlerArgs['locals'];

function envRecord(): Record<string, string | undefined> {
	return env as Record<string, string | undefined>;
}

function runGet({
	locals = adminLocals,
	requestUrl = 'http://internal.local/api/security/reverse-proxy-diagnostic?browserOrigin=https%3A%2F%2Fwrapped.example.com',
	effectiveUrl,
	headers = {},
	ip = '172.18.0.2'
}: {
	locals?: HandlerArgs['locals'];
	requestUrl?: string;
	effectiveUrl?: string;
	headers?: Record<string, string>;
	ip?: string;
} = {}): ReturnType<typeof GET> {
	const request = new Request(requestUrl, { headers });
	return GET({
		getClientAddress: () => ip,
		locals,
		request,
		url: new URL(effectiveUrl ?? requestUrl)
	} as unknown as HandlerArgs);
}

describe('GET /api/security/reverse-proxy-diagnostic', () => {
	beforeEach(async () => {
		clearRateLimitStore();
		await db.delete(appSettings);
		delete envRecord().TRUST_PROXY;
		delete envRecord().ORIGIN;
	});

	it('rejects anonymous requests with 401', async () => {
		try {
			await runGet({ locals: {} as HandlerArgs['locals'] });
			expect.unreachable('Expected error to be thrown');
		} catch (err) {
			expect(isHttpError(err)).toBe(true);
			if (!isHttpError(err)) throw err;
			expect(err.status).toBe(401);
			expect(err.body.message).toBe('Unauthorized');
		}
	});

	it('rejects non-admin requests with 403', async () => {
		try {
			await runGet({ locals: userLocals });
			expect.unreachable('Expected error to be thrown');
		} catch (err) {
			expect(isHttpError(err)).toBe(true);
			if (!isHttpError(err)) throw err;
			expect(err.status).toBe(403);
			expect(err.body.message).toBe('Admin access required');
		}
	});

	it('returns the sanitized diagnostic payload for admins', async () => {
		const response = await runGet({
			headers: {
				'x-forwarded-proto': 'https',
				'x-forwarded-host': 'wrapped.example.com',
				'x-forwarded-for': '203.0.113.77',
				'x-real-ip': '198.51.100.88',
				forwarded: 'for=secret-client;proto=https;host=hidden.example'
			}
		});

		expect(response.status).toBe(200);
		expect(response.headers.get('Cache-Control')).toBe('no-store');
		const body = await response.json();
		expect(Object.keys(body).sort()).toEqual([
			'forwardedHeaders',
			'originComparison',
			'origins',
			'reasons',
			'recommendation',
			'safetyNotice',
			'sourceAddress',
			'trustProxy'
		]);
		expect(body.recommendation.action).toBe('enable');
		expect(body.forwardedHeaders).toEqual({
			present: [
				'Forwarded',
				'X-Forwarded-For',
				'X-Forwarded-Host',
				'X-Forwarded-Proto',
				'X-Real-IP'
			],
			pair: {
				status: 'usable',
				isUsable: true,
				protoPresent: true,
				hostPresent: true
			}
		});
		expect(body.sourceAddress).toEqual({ category: 'docker/private-range' });
	});

	it('compares the browser, raw app, and effective app origins', async () => {
		await setAppSetting(AppSettingsKey.TRUST_PROXY, 'true');

		const response = await runGet({
			requestUrl:
				'http://internal.local/api/security/reverse-proxy-diagnostic?browserOrigin=https%3A%2F%2Fwrapped.example.com',
			effectiveUrl:
				'https://wrapped.example.com/api/security/reverse-proxy-diagnostic?browserOrigin=https%3A%2F%2Fwrapped.example.com',
			headers: {
				'x-forwarded-proto': 'https',
				'x-forwarded-host': 'wrapped.example.com'
			}
		});

		const body = await response.json();
		expect(body.origins.rawApp).toBe('http://internal.local');
		expect(body.origins.effectiveApp).toBe('https://wrapped.example.com');
		expect(body.origins.browser).toEqual({
			origin: 'https://wrapped.example.com',
			isValid: true
		});
		expect(body.originComparison).toEqual({
			browserMatchesRawApp: false,
			browserMatchesEffectiveApp: true,
			forwardedPairMatchesBrowser: true
		});
		expect(body.recommendation.action).toBe('appears-working');
	});

	it('handles missing browserOrigin without failing', async () => {
		const response = await runGet({
			requestUrl: 'http://internal.local/api/security/reverse-proxy-diagnostic',
			headers: {
				'x-forwarded-proto': 'https',
				'x-forwarded-host': 'wrapped.example.com'
			}
		});

		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.origins.browser).toEqual({ origin: null, isValid: false });
		expect(body.recommendation.action).toBe('unable-to-determine');
		expect(body.reasons.join(' ')).toContain('browser origin was missing or invalid');
	});

	it('handles invalid browserOrigin without failing', async () => {
		const response = await runGet({
			requestUrl:
				'http://internal.local/api/security/reverse-proxy-diagnostic?browserOrigin=not-a-url',
			headers: {
				'x-forwarded-proto': 'https',
				'x-forwarded-host': 'wrapped.example.com'
			}
		});

		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.origins.browser).toEqual({ origin: null, isValid: false });
		expect(body.originComparison.forwardedPairMatchesBrowser).toBeNull();
		expect(body.recommendation.action).toBe('unable-to-determine');
	});

	it('rejects structurally abusive browserOrigin values', async () => {
		try {
			await runGet({
				requestUrl: `http://internal.local/api/security/reverse-proxy-diagnostic?browserOrigin=${'a'.repeat(2049)}`
			});
			expect.unreachable('Expected error to be thrown');
		} catch (err) {
			expect(isHttpError(err)).toBe(true);
			if (!isHttpError(err)) throw err;
			expect(err.status).toBe(400);
			expect(err.body.message).toBe('browserOrigin is too long');
		}
	});

	it('does not expose raw secrets, forwarded values, source IPs, or query strings', async () => {
		const response = await runGet({
			requestUrl:
				'http://internal.local/api/security/reverse-proxy-diagnostic?browserOrigin=https%3A%2F%2Fbrowser.example.com&token=secret-query',
			headers: {
				cookie: 'session=secret-cookie',
				authorization: 'Bearer secret-authorization',
				'x-forwarded-proto': 'https',
				'x-forwarded-host': 'secret-forwarded.example',
				'x-forwarded-for': '203.0.113.77',
				'x-real-ip': '198.51.100.88',
				forwarded: 'for=secret-client;proto=https;host=hidden.example'
			},
			ip: '203.0.113.44'
		});

		const serialized = JSON.stringify(await response.json());
		expect(serialized).not.toContain('secret-cookie');
		expect(serialized).not.toContain('secret-authorization');
		expect(serialized).not.toContain('secret-forwarded.example');
		expect(serialized).not.toContain('203.0.113.77');
		expect(serialized).not.toContain('198.51.100.88');
		expect(serialized).not.toContain('secret-client');
		expect(serialized).not.toContain('hidden.example');
		expect(serialized).not.toContain('203.0.113.44');
		expect(serialized).not.toContain('secret-query');
	});

	it('rate limits repeated diagnostic requests per admin and source address', async () => {
		let response: Response | undefined;
		for (let i = 0; i < 13; i++) {
			response = await runGet();
		}

		expect(response?.status).toBe(429);
		expect(response?.headers.get('Cache-Control')).toBe('no-store');
		expect(response?.headers.get('Retry-After')).toBeTruthy();
		expect(await response?.json()).toEqual({ error: 'Too many diagnostic requests' });
	});
});
