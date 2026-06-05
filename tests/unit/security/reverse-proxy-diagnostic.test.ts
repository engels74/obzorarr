import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { env } from '$env/dynamic/private';
import { AppSettingsKey, setAppSetting } from '$lib/server/admin/settings.service';
import { clearRateLimitStore } from '$lib/server/ratelimit';
import {
	assertEnableTrustProxyAllowed,
	classifySourceAddress,
	createReverseProxyDiagnostic,
	ENABLE_TRUST_PROXY_NOT_RECOMMENDED_MESSAGE,
	type ReverseProxyDiagnostic,
	type ReverseProxyRecommendationAction
} from '$lib/server/security/reverse-proxy-diagnostic';
import { GET as diagnosticGET } from '../../../src/routes/api/security/reverse-proxy-diagnostic/+server';
import { resetSharedTestDb } from '../../helpers/db';

function envRecord(): Record<string, string | undefined> {
	return env as Record<string, string | undefined>;
}

function requestWith(headers: Record<string, string> = {}): Request {
	return new Request('http://internal.local/onboarding/csrf', { headers });
}

describe('reverse proxy diagnostic', () => {
	beforeEach(async () => {
		await resetSharedTestDb();
		delete envRecord().TRUST_PROXY;
		delete envRecord().ORIGIN;
	});

	afterEach(() => {
		delete envRecord().TRUST_PROXY;
		delete envRecord().ORIGIN;
	});

	it('recommends enabling when disabled and the usable forwarded pair matches the browser origin', async () => {
		const diagnostic = await createReverseProxyDiagnostic({
			request: requestWith({
				'x-forwarded-proto': 'https',
				'x-forwarded-host': 'wrapped.example.com'
			}),
			rawAppUrl: 'http://internal.local/onboarding/csrf',
			effectiveAppUrl: 'http://internal.local/onboarding/csrf',
			browserOrigin: 'https://wrapped.example.com',
			sourceAddress: '172.18.0.2'
		});

		expect(diagnostic.trustProxy).toEqual({
			enabled: false,
			source: 'default',
			isLocked: false
		});
		expect(diagnostic.origins.rawApp).toBe('http://internal.local');
		expect(diagnostic.origins.effectiveApp).toBe('http://internal.local');
		expect(diagnostic.origins.browser).toEqual({
			origin: 'https://wrapped.example.com',
			isValid: true
		});
		expect(diagnostic.forwardedHeaders.present).toEqual(['X-Forwarded-Host', 'X-Forwarded-Proto']);
		expect(diagnostic.forwardedHeaders.pair).toEqual({
			status: 'usable',
			isUsable: true,
			protoPresent: true,
			hostPresent: true
		});
		expect(diagnostic.sourceAddress.category).toBe('docker/private-range');
		expect(diagnostic.originComparison).toEqual({
			browserMatchesRawApp: false,
			browserMatchesEffectiveApp: false,
			forwardedPairMatchesBrowser: true
		});
		expect(diagnostic.recommendation.action).toBe('enable');
		expect(diagnostic.safetyNotice).toContain('strips visitor-supplied forwarding headers');
	});

	it('recommends leaving trust disabled for direct access without a forwarded pair', async () => {
		const diagnostic = await createReverseProxyDiagnostic({
			request: requestWith(),
			rawAppUrl: 'http://localhost:5173/settings',
			effectiveAppUrl: 'http://localhost:5173/settings',
			browserOrigin: 'http://localhost:5173',
			sourceAddress: '127.0.0.1'
		});

		expect(diagnostic.forwardedHeaders.present).toEqual([]);
		expect(diagnostic.forwardedHeaders.pair.status).toBe('missing');
		expect(diagnostic.sourceAddress.category).toBe('loopback');
		expect(diagnostic.originComparison.browserMatchesRawApp).toBe(true);
		expect(diagnostic.recommendation.action).toBe('leave-disabled');
	});

	it('recommends reviewing proxy config for partial forwarded headers', async () => {
		const diagnostic = await createReverseProxyDiagnostic({
			request: requestWith({ 'x-forwarded-proto': 'https' }),
			rawAppUrl: 'http://internal.local/admin/settings',
			effectiveAppUrl: 'http://internal.local/admin/settings',
			browserOrigin: 'https://wrapped.example.com',
			sourceAddress: '10.0.0.5'
		});

		expect(diagnostic.forwardedHeaders.pair).toEqual({
			status: 'partial',
			isUsable: false,
			protoPresent: true,
			hostPresent: false
		});
		expect(diagnostic.sourceAddress.category).toBe('private-lan');
		expect(diagnostic.recommendation.action).toBe('review-proxy');
	});

	it('reports environment-controlled TRUST_PROXY as locked', async () => {
		await setAppSetting(AppSettingsKey.TRUST_PROXY, 'false');
		envRecord().TRUST_PROXY = 'true';

		const diagnostic = await createReverseProxyDiagnostic({
			request: requestWith({
				'x-forwarded-proto': 'https',
				'x-forwarded-host': 'wrapped.example.com'
			}),
			rawAppUrl: 'http://internal.local/p',
			effectiveAppUrl: 'https://wrapped.example.com/p',
			browserOrigin: 'https://wrapped.example.com',
			sourceAddress: '100.80.0.12'
		});

		expect(diagnostic.trustProxy).toEqual({
			enabled: true,
			source: 'env',
			isLocked: true
		});
		expect(diagnostic.sourceAddress.category).toBe('tailscale/cgnat');
		expect(diagnostic.recommendation.action).toBe('env-controlled');
		expect(diagnostic.reasons.join(' ')).toContain('currently enabled');
	});

	it('reports enabled trust as working when effective origin matches the browser', async () => {
		await setAppSetting(AppSettingsKey.TRUST_PROXY, 'true');

		const diagnostic = await createReverseProxyDiagnostic({
			request: requestWith({
				'x-forwarded-proto': 'https',
				'x-forwarded-host': 'wrapped.example.com'
			}),
			rawAppUrl: 'http://internal.local/wrapped/2025',
			effectiveAppUrl: 'https://wrapped.example.com/wrapped/2025',
			browserOrigin: 'https://wrapped.example.com',
			sourceAddress: '192.168.1.10'
		});

		expect(diagnostic.trustProxy.enabled).toBe(true);
		expect(diagnostic.originComparison.browserMatchesEffectiveApp).toBe(true);
		expect(diagnostic.recommendation.action).toBe('appears-working');
	});

	it('does not trust forwarded headers alone when the browser origin is invalid', async () => {
		const diagnostic = await createReverseProxyDiagnostic({
			request: requestWith({
				'x-forwarded-proto': 'https',
				'x-forwarded-host': 'wrapped.example.com'
			}),
			rawAppUrl: 'http://internal.local/onboarding/csrf',
			effectiveAppUrl: 'http://internal.local/onboarding/csrf',
			browserOrigin: 'not a url',
			sourceAddress: '8.8.8.8'
		});

		expect(diagnostic.origins.browser).toEqual({ origin: null, isValid: false });
		expect(diagnostic.sourceAddress.category).toBe('public');
		expect(diagnostic.originComparison.forwardedPairMatchesBrowser).toBeNull();
		expect(diagnostic.recommendation.action).toBe('unable-to-determine');
	});

	it('includes configured CSRF/public origin without requiring admin auth context', async () => {
		await setAppSetting(AppSettingsKey.CSRF_ORIGIN, 'https://configured.example.com');

		const diagnostic = await createReverseProxyDiagnostic({
			request: requestWith(),
			rawAppUrl: 'http://internal.local/onboarding/csrf',
			effectiveAppUrl: 'http://internal.local/onboarding/csrf',
			browserOrigin: 'http://internal.local',
			sourceAddress: null
		});

		expect(diagnostic.origins.configuredPublic).toEqual({
			origin: 'https://configured.example.com',
			isValid: true,
			source: 'db',
			isConfigured: true,
			isLocked: false
		});
		expect(diagnostic.sourceAddress.category).toBe('unknown');
	});

	it('reports only safe forwarded-header presence signals and no raw sensitive values', async () => {
		const diagnostic = await createReverseProxyDiagnostic({
			request: requestWith({
				cookie: 'session=secret-cookie',
				authorization: 'Bearer secret-authorization',
				'x-forwarded-proto': 'https',
				'x-forwarded-host': 'secret-forwarded.example',
				'x-forwarded-for': '203.0.113.77',
				'x-real-ip': '198.51.100.88',
				forwarded: 'for=secret-forwarded-client;proto=https;host=hidden.example'
			}),
			rawAppUrl: 'http://internal.local/onboarding/csrf?token=secret-query',
			effectiveAppUrl: 'http://internal.local/onboarding/csrf?token=secret-query',
			browserOrigin: 'https://browser.example.com',
			sourceAddress: '203.0.113.44'
		});

		expect(diagnostic.forwardedHeaders.present).toEqual([
			'Forwarded',
			'X-Forwarded-For',
			'X-Forwarded-Host',
			'X-Forwarded-Proto',
			'X-Real-IP'
		]);

		const serialized = JSON.stringify(diagnostic);
		expect(serialized).not.toContain('secret-cookie');
		expect(serialized).not.toContain('secret-authorization');
		expect(serialized).not.toContain('secret-forwarded.example');
		expect(serialized).not.toContain('203.0.113.77');
		expect(serialized).not.toContain('198.51.100.88');
		expect(serialized).not.toContain('secret-forwarded-client');
		expect(serialized).not.toContain('hidden.example');
		expect(serialized).not.toContain('secret-query');
	});

	it.each([
		['127.0.0.1', 'loopback'],
		['[::1]', 'loopback'],
		['10.0.0.4', 'private-lan'],
		['172.20.0.4', 'docker/private-range'],
		['100.64.0.1', 'tailscale/cgnat'],
		['169.254.10.20', 'link-local'],
		['8.8.8.8', 'public'],
		['not-an-address', 'unknown']
	] as const)('classifies %s as %s without returning the raw address', (address, category) => {
		expect(classifySourceAddress(address)).toBe(category);
	});
});

describe('assertEnableTrustProxyAllowed', () => {
	function diagnosticWith(action: ReverseProxyRecommendationAction): ReverseProxyDiagnostic {
		return {
			trustProxy: { enabled: false, source: 'default', isLocked: false },
			origins: {
				rawApp: null,
				effectiveApp: null,
				browser: { origin: null, isValid: false },
				configuredPublic: {
					origin: null,
					isValid: false,
					source: 'default',
					isConfigured: false,
					isLocked: false
				}
			},
			forwardedHeaders: {
				present: [],
				pair: { status: 'missing', isUsable: false, protoPresent: false, hostPresent: false }
			},
			sourceAddress: { category: 'unknown' },
			originComparison: {
				browserMatchesRawApp: null,
				browserMatchesEffectiveApp: null,
				forwardedPairMatchesBrowser: null
			},
			recommendation: { action, summary: '' },
			reasons: [],
			safetyNotice: ''
		};
	}

	it('allows enabling when the diagnostic recommends enable', () => {
		expect(assertEnableTrustProxyAllowed(diagnosticWith('enable'))).toEqual({ ok: true });
	});

	it.each([
		'leave-disabled',
		'review-proxy',
		'appears-working',
		'unable-to-determine',
		'env-controlled'
	] as ReverseProxyRecommendationAction[])('rejects enabling when the diagnostic recommendation is "%s"', (action) => {
		expect(assertEnableTrustProxyAllowed(diagnosticWith(action))).toEqual({
			ok: false,
			error: ENABLE_TRUST_PROXY_NOT_RECOMMENDED_MESSAGE
		});
	});
});

type HandlerArgs = Parameters<typeof diagnosticGET>[0];

const adminLocals = {
	user: { id: 1, plexId: 100, username: 'admin', isAdmin: true }
} as HandlerArgs['locals'];

const userLocals = {
	user: { id: 2, plexId: 200, username: 'viewer', isAdmin: false }
} as HandlerArgs['locals'];

function runDiagnosticGET({
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
} = {}): ReturnType<typeof diagnosticGET> {
	const request = new Request(requestUrl, { headers });
	return diagnosticGET({
		getClientAddress: () => ip,
		locals,
		request,
		url: new URL(effectiveUrl ?? requestUrl)
	} as unknown as HandlerArgs);
}

describe('GET /api/security/reverse-proxy-diagnostic', () => {
	beforeEach(async () => {
		clearRateLimitStore();
		await resetSharedTestDb();
		delete envRecord().TRUST_PROXY;
		delete envRecord().ORIGIN;
	});

	it.each([
		['anonymous requests with 401', {} as HandlerArgs['locals'], 401, { message: 'Unauthorized' }],
		['non-admin requests with 403', userLocals, 403, { message: 'Admin access required' }]
	] as const)('rejects %s', async (_label, locals, status, body) => {
		const response = await runDiagnosticGET({ locals });

		expect(response.status).toBe(status);
		expect(response.headers.get('Cache-Control')).toBe('no-store');
		expect(await response.json()).toEqual(body);
	});

	it('returns the sanitized diagnostic payload for admins', async () => {
		const response = await runDiagnosticGET({
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

		const response = await runDiagnosticGET({
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

	it.each([
		['missing', 'http://internal.local/api/security/reverse-proxy-diagnostic'],
		[
			'invalid',
			'http://internal.local/api/security/reverse-proxy-diagnostic?browserOrigin=not-a-url'
		]
	] as const)('handles %s browserOrigin without failing', async (_label, requestUrl) => {
		const response = await runDiagnosticGET({
			requestUrl,
			headers: {
				'x-forwarded-proto': 'https',
				'x-forwarded-host': 'wrapped.example.com'
			}
		});

		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.origins.browser).toEqual({ origin: null, isValid: false });
		expect(body.recommendation.action).toBe('unable-to-determine');
	});

	it('rejects structurally abusive browserOrigin values', async () => {
		const response = await runDiagnosticGET({
			requestUrl: `http://internal.local/api/security/reverse-proxy-diagnostic?browserOrigin=${'a'.repeat(2049)}`
		});

		expect(response.status).toBe(400);
		expect(response.headers.get('Cache-Control')).toBe('no-store');
		expect(await response.json()).toEqual({ message: 'browserOrigin is too long' });
	});

	it('does not expose raw secrets, forwarded values, source IPs, or query strings', async () => {
		const response = await runDiagnosticGET({
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
		for (const secret of [
			'secret-cookie',
			'secret-authorization',
			'secret-forwarded.example',
			'203.0.113.77',
			'198.51.100.88',
			'secret-client',
			'hidden.example',
			'203.0.113.44',
			'secret-query'
		]) {
			expect(serialized).not.toContain(secret);
		}
	});

	it('rate limits repeated diagnostic requests per admin and source address', async () => {
		let response: Response | undefined;
		for (let i = 0; i < 13; i++) response = await runDiagnosticGET();

		expect(response?.status).toBe(429);
		expect(response?.headers.get('Cache-Control')).toBe('no-store');
		expect(response?.headers.get('Retry-After')).toBeTruthy();
		expect(await response?.json()).toEqual({ error: 'Too many diagnostic requests' });
	});
});
