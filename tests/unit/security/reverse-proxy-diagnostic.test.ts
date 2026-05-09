import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { env } from '$env/dynamic/private';
import { AppSettingsKey, setAppSetting } from '$lib/server/admin/settings.service';
import { db } from '$lib/server/db/client';
import { appSettings } from '$lib/server/db/schema';
import {
	classifySourceAddress,
	createReverseProxyDiagnostic
} from '$lib/server/security/reverse-proxy-diagnostic';

function envRecord(): Record<string, string | undefined> {
	return env as Record<string, string | undefined>;
}

function requestWith(headers: Record<string, string> = {}): Request {
	return new Request('http://internal.local/onboarding/csrf', { headers });
}

describe('reverse proxy diagnostic', () => {
	beforeEach(async () => {
		await db.delete(appSettings);
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

	it('classifies source addresses without returning the raw address', () => {
		expect(classifySourceAddress('127.0.0.1')).toBe('loopback');
		expect(classifySourceAddress('[::1]')).toBe('loopback');
		expect(classifySourceAddress('10.0.0.4')).toBe('private-lan');
		expect(classifySourceAddress('172.20.0.4')).toBe('docker/private-range');
		expect(classifySourceAddress('100.64.0.1')).toBe('tailscale/cgnat');
		expect(classifySourceAddress('169.254.10.20')).toBe('link-local');
		expect(classifySourceAddress('8.8.8.8')).toBe('public');
		expect(classifySourceAddress('not-an-address')).toBe('unknown');
	});
});
