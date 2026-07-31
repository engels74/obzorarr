import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { env } from '$env/dynamic/private';
import type {
	ReverseProxyConfigSource,
	ReverseProxyDiagnosticReasonCode,
	ReverseProxyRecommendationAction
} from '$lib/security/reverse-proxy';
import { AppSettingsKey, setAppSetting } from '$lib/server/admin/settings.service';
import { clearRateLimitStore } from '$lib/server/ratelimit';
import {
	assertEnableTrustProxyAllowed,
	buildReverseProxyDiagnostic,
	classifySourceAddress,
	ENABLE_TRUST_PROXY_NOT_RECOMMENDED_MESSAGE
} from '$lib/server/security/reverse-proxy-diagnostic';
import { GET as diagnosticGET } from '../../../src/routes/api/security/reverse-proxy-diagnostic/+server';
import { resetSharedTestDb } from '../../helpers/db';

function envRecord(): Record<string, string | undefined> {
	return env as Record<string, string | undefined>;
}

function diagnosticFor({
	trustProxy = 'false',
	trustSource = 'default',
	browserOrigin = 'https://browser.example.com',
	rawAppUrl = 'http://internal.local/path',
	effectiveAppUrl = rawAppUrl,
	headers = {},
	csrfOrigin = '',
	sourceAddress = '172.18.0.2'
}: {
	trustProxy?: string;
	trustSource?: ReverseProxyConfigSource;
	browserOrigin?: string | null;
	rawAppUrl?: string;
	effectiveAppUrl?: string;
	headers?: Readonly<Record<string, string>>;
	csrfOrigin?: string;
	sourceAddress?: string;
} = {}) {
	return buildReverseProxyDiagnostic({
		request: new Request(rawAppUrl, { headers: { ...headers } }),
		rawAppUrl,
		effectiveAppUrl,
		browserOrigin,
		sourceAddress,
		trustProxy: {
			value: trustProxy,
			source: trustSource,
			isLocked: trustSource === 'env'
		},
		csrfOrigin: {
			value: csrfOrigin,
			source: 'default',
			isLocked: false
		}
	});
}

describe('reverse proxy diagnostic contract', () => {
	it.each([
		{
			name: 'environment lock enabled',
			input: {
				trustProxy: 'true',
				trustSource: 'env' as const,
				browserOrigin: 'not a URL'
			},
			action: 'env-controlled',
			reason: 'trust-proxy-env-locked-enabled'
		},
		{
			name: 'environment lock disabled',
			input: {
				trustProxy: 'false',
				trustSource: 'env' as const,
				browserOrigin: 'not a URL'
			},
			action: 'env-controlled',
			reason: 'trust-proxy-env-locked-disabled'
		},
		{
			name: 'invalid browser origin',
			input: {
				browserOrigin: 'not a URL',
				headers: {
					'x-forwarded-proto': 'https',
					'x-forwarded-host': 'browser.example.com'
				}
			},
			action: 'unable-to-determine',
			reason: 'browser-origin-invalid'
		},
		{
			name: 'enable evidence',
			input: {
				headers: {
					'x-forwarded-proto': 'https',
					'x-forwarded-host': 'browser.example.com'
				}
			},
			action: 'enable',
			reason: 'forwarded-pair-matches-browser'
		},
		{
			name: 'direct access',
			input: {
				browserOrigin: 'http://internal.local',
				rawAppUrl: 'http://internal.local/path'
			},
			action: 'leave-disabled',
			reason: 'direct-access-without-forwarded-pair'
		},
		{
			name: 'missing forwarded pair with mismatched origins',
			input: {},
			action: 'review-proxy',
			reason: 'forwarded-pair-missing'
		},
		{
			name: 'partial forwarded pair',
			input: { headers: { 'x-forwarded-proto': 'https' } },
			action: 'review-proxy',
			reason: 'forwarded-pair-partial'
		},
		{
			name: 'invalid forwarded pair',
			input: {
				headers: {
					'x-forwarded-proto': 'ftp',
					'x-forwarded-host': 'browser.example.com'
				}
			},
			action: 'review-proxy',
			reason: 'forwarded-pair-invalid'
		},
		{
			name: 'ambiguous forwarded pair',
			input: {
				headers: {
					'x-forwarded-proto': 'https',
					'x-forwarded-host': 'different.example.com'
				}
			},
			action: 'review-proxy',
			reason: 'forwarded-pair-ambiguous'
		},
		{
			name: 'working enabled trust',
			input: {
				trustProxy: 'true',
				effectiveAppUrl: 'https://browser.example.com/path',
				headers: {
					'x-forwarded-proto': 'https',
					'x-forwarded-host': 'browser.example.com'
				}
			},
			action: 'appears-working',
			reason: 'trust-proxy-working'
		},
		{
			name: 'enabled but broken trust',
			input: { trustProxy: 'true' },
			action: 'review-proxy',
			reason: 'trust-proxy-enabled-broken'
		}
	] as const)('$name returns $action with $reason', ({ input, action, reason }) => {
		const diagnostic = diagnosticFor(input as Parameters<typeof diagnosticFor>[0]);
		expect(diagnostic.action).toBe(action as ReverseProxyRecommendationAction);
		expect(diagnostic.reasonCodes).toEqual([reason as ReverseProxyDiagnosticReasonCode]);
	});

	it('serializes only safe facts, action, and stable reason codes', () => {
		const diagnostic = diagnosticFor({
			rawAppUrl: 'http://internal.local/path?token=secret-query',
			effectiveAppUrl: 'http://internal.local/path?token=secret-query',
			browserOrigin: 'https://browser-secret.example.com',
			csrfOrigin: 'https://configured-secret.example.com',
			sourceAddress: '203.0.113.44',
			headers: {
				cookie: 'session=secret-cookie',
				authorization: 'Bearer secret-authorization',
				forwarded: 'for=secret-client;proto=https;host=hidden.example',
				'x-forwarded-for': '203.0.113.77',
				'x-forwarded-host': 'secret-forwarded.example',
				'x-forwarded-proto': 'https',
				'x-real-ip': '198.51.100.88'
			}
		});

		expect(Object.keys(diagnostic).sort()).toEqual(['action', 'facts', 'reasonCodes']);
		expect(diagnostic.facts).toEqual({
			trustProxy: { enabled: false, source: 'default', isLocked: false },
			browserOrigin: { isValid: true, origin: 'https://browser-secret.example.com' },
			configuredPublicOrigin: {
				isConfigured: true,
				isValid: true,
				source: 'default',
				isLocked: false
			},
			origins: {
				effectiveApp: 'http://internal.local',
				forwardedPair: 'https://secret-forwarded.example'
			},
			forwardedHeaders: {
				present: [
					'Forwarded',
					'X-Forwarded-For',
					'X-Forwarded-Host',
					'X-Forwarded-Proto',
					'X-Real-IP'
				],
				pair: { status: 'usable', isUsable: true, protoPresent: true, hostPresent: true }
			},
			sourceAddress: { category: 'public' },
			originComparison: {
				browserMatchesRawApp: false,
				browserMatchesEffectiveApp: false,
				forwardedPairMatchesBrowser: false
			}
		});

		const serialized = JSON.stringify(diagnostic);
		for (const secret of [
			'secret-cookie',
			'secret-authorization',
			'secret-client',
			'203.0.113.77',
			'198.51.100.88',
			'hidden.example',
			'203.0.113.44',
			'secret-query',
			'configured-secret.example.com'
		]) {
			expect(serialized).not.toContain(secret);
		}
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

	it('keeps enabling authority with the action code', () => {
		const enabled = diagnosticFor({
			headers: {
				'x-forwarded-proto': 'https',
				'x-forwarded-host': 'browser.example.com'
			}
		});
		expect(assertEnableTrustProxyAllowed(enabled)).toEqual({ ok: true });
		expect(assertEnableTrustProxyAllowed({ ...enabled, action: 'review-proxy' })).toEqual({
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

	afterEach(() => {
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

	it('returns the client-safe diagnostic contract for admins with no-store', async () => {
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
		expect(Object.keys(body).sort()).toEqual(['action', 'facts', 'reasonCodes']);
		expect(body.action).toBe('enable');
		expect(body.facts.forwardedHeaders.present).toEqual([
			'Forwarded',
			'X-Forwarded-For',
			'X-Forwarded-Host',
			'X-Forwarded-Proto',
			'X-Real-IP'
		]);
		expect(body.facts.sourceAddress).toEqual({ category: 'docker/private-range' });
	});

	it('reports normalized browser, forwarded, and effective origins without a raw app origin', async () => {
		await setAppSetting(AppSettingsKey.TRUST_PROXY, 'true');
		const response = await runDiagnosticGET({
			effectiveUrl:
				'https://wrapped.example.com/api/security/reverse-proxy-diagnostic?browserOrigin=https%3A%2F%2Fwrapped.example.com',
			headers: {
				'x-forwarded-proto': 'https',
				'x-forwarded-host': 'wrapped.example.com'
			}
		});
		const body = await response.json();
		expect(body.facts.browserOrigin).toEqual({
			origin: 'https://wrapped.example.com',
			isValid: true
		});
		expect(body.facts.origins).toEqual({
			effectiveApp: 'https://wrapped.example.com',
			forwardedPair: 'https://wrapped.example.com'
		});
		expect(body.facts.origins.rawApp).toBeUndefined();
		expect(body.action).toBe('appears-working');
	});

	it('rejects an overlong browser origin with no-store', async () => {
		const response = await runDiagnosticGET({
			requestUrl: `http://internal.local/api/security/reverse-proxy-diagnostic?browserOrigin=${'a'.repeat(2049)}`
		});
		expect(response.status).toBe(400);
		expect(response.headers.get('Cache-Control')).toBe('no-store');
		expect(await response.json()).toEqual({ message: 'browserOrigin is too long' });
	});

	it('does not expose credentials, client addresses, queries, or unrelated forwarding values', async () => {
		const response = await runDiagnosticGET({
			requestUrl:
				'http://internal.local/api/security/reverse-proxy-diagnostic?browserOrigin=https%3A%2F%2Fbrowser.example.com&token=secret-query',
			headers: {
				cookie: 'session=secret-cookie',
				authorization: 'Bearer secret-authorization',
				'x-forwarded-proto': 'https',
				'x-forwarded-host': 'browser.example.com',
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

	it('rate limits repeated diagnostics per admin and source address', async () => {
		let response: Response | undefined;
		for (let i = 0; i < 13; i++) response = await runDiagnosticGET();
		expect(response?.status).toBe(429);
		expect(response?.headers.get('Cache-Control')).toBe('no-store');
		expect(response?.headers.get('Retry-After')).toBeTruthy();
		expect(await response?.json()).toEqual({ error: 'Too many diagnostic requests' });
	});
});
