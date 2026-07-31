import { describe, expect, it } from 'bun:test';
import {
	documentationForDiagnostic,
	documentationForGuide,
	presentReverseProxyDiagnostic,
	REVERSE_PROXY_DOCUMENTATION,
	REVERSE_PROXY_PROVIDER_GUIDES
} from '$lib/copy/reverse-proxy';
import type {
	ForwardedProtoHostStatus,
	ReverseProxyDiagnostic,
	ReverseProxyRecommendationAction
} from '$lib/security/reverse-proxy';

function diagnostic(
	action: ReverseProxyRecommendationAction,
	status: ForwardedProtoHostStatus = 'usable',
	overrides: Partial<ReverseProxyDiagnostic['facts']['trustProxy']> = {}
): ReverseProxyDiagnostic {
	const protoPresent = status !== 'missing';
	const hostPresent = status !== 'missing' && status !== 'partial';
	return {
		facts: {
			trustProxy: { enabled: false, source: 'default', isLocked: false, ...overrides },
			browserOrigin: { isValid: true, origin: 'https://wrapped.example.com' },
			configuredPublicOrigin: {
				isConfigured: true,
				isValid: true,
				source: 'db',
				isLocked: false
			},
			origins: {
				effectiveApp: 'https://wrapped.example.com',
				forwardedPair: 'https://wrapped.example.com'
			},
			forwardedHeaders: {
				present:
					status === 'missing'
						? []
						: status === 'partial'
							? ['X-Forwarded-Proto']
							: ['X-Forwarded-Host', 'X-Forwarded-Proto'],
				pair: {
					status,
					isUsable: status === 'usable',
					protoPresent,
					hostPresent
				}
			},
			sourceAddress: { category: 'docker/private-range' },
			originComparison: {
				browserMatchesRawApp: false,
				browserMatchesEffectiveApp: true,
				forwardedPairMatchesBrowser: true
			}
		},
		action,
		reasonCodes: []
	};
}

describe('reverse proxy presenter', () => {
	it.each([
		'enable',
		'leave-disabled',
		'review-proxy',
		'appears-working',
		'unable-to-determine',
		'env-controlled'
	] as const)('presents %s with a diagnosis and persistent action', (action) => {
		const view = presentReverseProxyDiagnostic(diagnostic(action));
		expect(view.headline.length).toBeGreaterThan(0);
		expect(view.diagnosis).toContain('Both required headers arrived');
		expect(view.diagnosis).toContain('forwarded origin https://wrapped.example.com');
		expect(view.nextAction.length).toBeGreaterThan(0);
		expect(view.consequence.length).toBeGreaterThan(0);
		expect(view.safetyNotice).toContain('removes or overwrites visitor-supplied');
	});

	it.each([
		['missing', 'Neither X-Forwarded-Proto nor X-Forwarded-Host arrived'],
		['partial', 'X-Forwarded-Proto arrived, but X-Forwarded-Host is missing'],
		['invalid-proto', 'value other than http or https'],
		['unsafe-host', 'characters that are unsafe'],
		['invalid-host', 'not a valid public host']
	] as const)('states the observed %s header condition', (status, expected) => {
		expect(presentReverseProxyDiagnostic(diagnostic('review-proxy', status)).diagnosis).toContain(
			expected
		);
	});

	it.each([
		['missing', 'both X-Forwarded-Proto and X-Forwarded-Host'],
		['partial', 'missing member'],
		['invalid-proto', 'exactly http or https'],
		['unsafe-host', 'public hostname'],
		['invalid-host', 'public hostname'],
		['usable', 'pair is valid']
	] as const)('gives a specific repair for %s', (status, expected) => {
		const view = presentReverseProxyDiagnostic(diagnostic('review-proxy', status));
		expect(view.nextAction).toContain(expected);
	});

	it('distinguishes a forwarded-origin mismatch from an ambiguous valid pair', () => {
		const mismatch = diagnostic('review-proxy', 'usable');
		mismatch.facts.originComparison.forwardedPairMatchesBrowser = false;
		const view = presentReverseProxyDiagnostic(mismatch);
		expect(view.nextAction).toContain('conflicts with the browser origin');
	});

	it('states the exact environment setting and restart requirement', () => {
		const view = presentReverseProxyDiagnostic(
			diagnostic('env-controlled', 'usable', {
				enabled: false,
				source: 'env',
				isLocked: true
			})
		);
		expect(view.headline).toContain('disabled by the environment');
		expect(view.nextAction).toContain('TRUST_PROXY=true');
		expect(view.nextAction).toContain('restart Obzorarr');
	});

	it('does not tell an environment-managed direct deployment to enable proxy trust', () => {
		const direct = diagnostic('env-controlled', 'missing', {
			enabled: false,
			source: 'env',
			isLocked: true
		});
		direct.facts.originComparison.browserMatchesRawApp = true;
		direct.facts.originComparison.browserMatchesEffectiveApp = true;
		direct.facts.originComparison.forwardedPairMatchesBrowser = null;
		const view = presentReverseProxyDiagnostic(direct);
		expect(view.tone).toBe('success');
		expect(view.nextAction).toContain('Leave TRUST_PROXY=false');
		expect(view.documentationIds).toEqual(['obzorarr-trust-proxy']);
	});

	it('distinguishes working and broken environment-managed trust', () => {
		const working = diagnostic('env-controlled', 'usable', {
			enabled: true,
			source: 'env',
			isLocked: true
		});
		expect(presentReverseProxyDiagnostic(working).headline).toContain('origin matches');

		const broken = diagnostic('env-controlled', 'invalid-proto', {
			enabled: true,
			source: 'env',
			isLocked: true
		});
		broken.facts.originComparison.browserMatchesEffectiveApp = false;
		const brokenView = presentReverseProxyDiagnostic(broken);
		expect(brokenView.tone).toBe('danger');
		expect(brokenView.nextAction).toContain('exactly http or https');
		expect(brokenView.nextAction).toContain('Restart Obzorarr');
	});

	it('keeps documentation official, purpose-scoped, and provider-complete', () => {
		for (const link of REVERSE_PROXY_DOCUMENTATION) {
			expect(new URL(link.url).protocol).toBe('https:');
			expect(link.applicabilityLabel.length).toBeGreaterThan(0);
		}
		expect(REVERSE_PROXY_PROVIDER_GUIDES.map((guide) => guide.id)).toEqual([
			'nginx',
			'nginx-proxy-manager',
			'caddy',
			'apache',
			'other'
		]);
		expect(REVERSE_PROXY_PROVIDER_GUIDES.slice(0, 4).every((guide) => guide.config)).toBe(true);
		expect(
			REVERSE_PROXY_PROVIDER_GUIDES.every(
				(guide) => documentationForGuide(guide).id === guide.documentationId
			)
		).toBe(true);
	});

	it('uses canonical public hosts instead of reflecting an unrestricted request Host', () => {
		const configs = REVERSE_PROXY_PROVIDER_GUIDES.flatMap((guide) =>
			guide.config ? [guide.config] : []
		).join('\n');
		expect(configs).toContain('obzorarr.example.com');
		expect(configs).not.toContain('$http_host');
		expect(configs).not.toContain('{host}');
		expect(configs).not.toContain('%{HTTP_HOST}');
	});

	it('uses only host/protocol and Obzorarr configuration guidance', () => {
		const links = documentationForDiagnostic(diagnostic('enable'));
		expect(links.length).toBeGreaterThan(0);
		expect(
			links.every((link) =>
				['forwarded-host-proto', 'header-replacement-boundary', 'obzorarr-configuration'].includes(
					link.purpose
				)
			)
		).toBe(true);
	});
});
