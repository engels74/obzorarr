import { describe, expect, it } from 'bun:test';
import {
	diagramForReverseProxyDiagnostic,
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
				browserMatchesRequestUrl: false,
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
		'confirm-trust-boundary',
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

	it('identifies a missing forwarded proto when only the host arrives', () => {
		const partial = diagnostic('review-proxy', 'partial');
		partial.facts.forwardedHeaders.present = ['X-Forwarded-Host'];
		partial.facts.forwardedHeaders.pair.protoPresent = false;
		partial.facts.forwardedHeaders.pair.hostPresent = true;

		expect(presentReverseProxyDiagnostic(partial).diagnosis).toContain(
			'X-Forwarded-Host arrived, but X-Forwarded-Proto is missing'
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
	it('does not present matching forwarded values as proof of a trusted proxy', () => {
		const view = presentReverseProxyDiagnostic(diagnostic('confirm-trust-boundary'));
		expect(view.headline).toContain('boundary is unverified');
		expect(view.consequence).toContain('consistency');
		expect(view.consequence).toContain('not that a trusted proxy supplied them');
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
		direct.facts.originComparison.browserMatchesRequestUrl = true;
		direct.facts.originComparison.browserMatchesEffectiveApp = true;
		direct.facts.originComparison.forwardedPairMatchesBrowser = null;
		const view = presentReverseProxyDiagnostic(direct);
		expect(view.tone).toBe('success');
		expect(view.nextAction).toContain('Leave TRUST_PROXY=false');
		expect(view.documentationIds).toEqual(['obzorarr-trust-proxy']);
	});
	it('keeps environment-managed trust disabled when Caddy headers are present but unnecessary', () => {
		const caddy = diagnostic('env-controlled', 'usable', {
			enabled: false,
			source: 'env',
			isLocked: true
		});
		caddy.facts.originComparison.browserMatchesRequestUrl = true;
		const view = presentReverseProxyDiagnostic(caddy);
		expect(view.tone).toBe('success');
		expect(view.nextAction).toContain('Leave TRUST_PROXY=false');
		expect(view.nextAction).not.toContain('TRUST_PROXY=true');
	});
	it('does not make unused malformed headers override an environment-managed false setting', () => {
		const partial = diagnostic('env-controlled', 'partial', {
			enabled: false,
			source: 'env',
			isLocked: true
		});
		partial.facts.originComparison.browserMatchesRequestUrl = true;
		partial.facts.originComparison.browserMatchesEffectiveApp = true;
		partial.facts.originComparison.forwardedPairMatchesBrowser = null;

		const view = presentReverseProxyDiagnostic(partial);
		expect(view.tone).toBe('success');
		expect(view.nextAction).toContain('Leave TRUST_PROXY=false');
		expect(view.nextAction).not.toContain('TRUST_PROXY=true');
	});

	it('distinguishes working and broken environment-managed trust', () => {
		const working = diagnostic('env-controlled', 'usable', {
			enabled: true,
			source: 'env',
			isLocked: true
		});
		expect(presentReverseProxyDiagnostic(working).headline).toContain('origin matches');
		const unusable = diagnostic('env-controlled', 'invalid-proto', {
			enabled: true,
			source: 'env',
			isLocked: true
		});
		expect(presentReverseProxyDiagnostic(unusable).consequence).toContain(
			'unusable forwarding metadata'
		);
		const unknown = diagnostic('env-controlled', 'usable', {
			enabled: true,
			source: 'env',
			isLocked: true
		});
		unknown.facts.originComparison.browserMatchesEffectiveApp = null;
		expect(presentReverseProxyDiagnostic(unknown).consequence).toContain('cannot be verified');

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
		expect(brokenView.consequence).toContain('rejected the unusable forwarding metadata');
	});

	it('selects the matching diagram for every diagnostic result state', () => {
		const protocolMissing = diagnostic('review-proxy', 'partial');
		protocolMissing.facts.forwardedHeaders.pair.protoPresent = false;
		protocolMissing.facts.forwardedHeaders.pair.hostPresent = true;

		const forwardedConflict = diagnostic('review-proxy');
		forwardedConflict.facts.originComparison.forwardedPairMatchesBrowser = false;

		const environmentEnabledWorking = diagnostic('env-controlled', 'usable', {
			enabled: true,
			source: 'env',
			isLocked: true
		});
		const environmentEnabledBroken = diagnostic('env-controlled', 'invalid-proto', {
			enabled: true,
			source: 'env',
			isLocked: true
		});
		const environmentDisabledCorrect = diagnostic('env-controlled', 'missing', {
			source: 'env',
			isLocked: true
		});
		environmentDisabledCorrect.facts.originComparison.browserMatchesRequestUrl = true;
		const environmentDisabledNeeded = diagnostic('env-controlled', 'usable', {
			source: 'env',
			isLocked: true
		});
		const environmentDisabledBroken = diagnostic('env-controlled', 'missing', {
			source: 'env',
			isLocked: true
		});

		const states = {
			'browser-address-unavailable': diagnostic('unable-to-determine'),
			'correct-without-trust': diagnostic('leave-disabled'),
			'environment-disabled-broken': environmentDisabledBroken,
			'environment-disabled-correct': environmentDisabledCorrect,
			'environment-disabled-needed': environmentDisabledNeeded,
			'environment-enabled-broken': environmentEnabledBroken,
			'environment-enabled-working': environmentEnabledWorking,
			'forwarded-address-conflict': forwardedConflict,
			'forwarded-match-boundary-unverified': diagnostic('confirm-trust-boundary'),
			'headers-missing': diagnostic('review-proxy', 'missing'),
			'host-invalid': diagnostic('review-proxy', 'invalid-host'),
			'host-missing': diagnostic('review-proxy', 'partial'),
			'host-unsafe': diagnostic('review-proxy', 'unsafe-host'),
			'protocol-invalid': diagnostic('review-proxy', 'invalid-proto'),
			'protocol-missing': protocolMissing,
			'trust-enabled-broken': diagnostic('review-proxy', 'invalid-proto', {
				enabled: true,
				source: 'db'
			}),
			'trust-working': diagnostic('appears-working')
		} as const;

		for (const expected of Object.keys(states) as Array<keyof typeof states>) {
			expect(diagramForReverseProxyDiagnostic(states[expected])).toBe(expected);
		}
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
		expect(
			REVERSE_PROXY_PROVIDER_GUIDES.filter((guide) =>
				['nginx', 'caddy', 'apache'].includes(guide.id)
			).every((guide) => guide.config)
		).toBe(true);
		expect(
			REVERSE_PROXY_PROVIDER_GUIDES.every(
				(guide) => documentationForGuide(guide).id === guide.documentationId
			)
		).toBe(true);
	});

	it('uses provider-derived values without redundant or hardcoded forwarding headers', () => {
		const guide = (id: (typeof REVERSE_PROXY_PROVIDER_GUIDES)[number]['id']) =>
			REVERSE_PROXY_PROVIDER_GUIDES.find((candidate) => candidate.id === id);

		const caddy = guide('caddy');
		expect(caddy?.config).toBe('obzorarr.example.com {\n\treverse_proxy obzorarr:3000\n}');
		expect(caddy?.config).not.toContain('header_up');
		const npm = guide('nginx-proxy-manager');
		expect(npm?.config).toBeUndefined();
		expect(npm?.steps.join(' ')).toContain('not runtime-verified');

		const nginx = guide('nginx');
		expect(nginx?.config).toContain('X-Forwarded-Proto $scheme');
		expect(nginx?.config).toContain('X-Forwarded-Host $server_name:$server_port');
		expect(nginx?.config).not.toContain('X-Forwarded-Proto https');
		expect(nginx?.config).not.toContain('$http_host');

		expect(guide('apache')?.config).toContain('expr=%{REQUEST_SCHEME}');
		expect(guide('apache')?.config).toContain('expr=%{SERVER_NAME}:%{SERVER_PORT}');
		expect(guide('apache')?.steps.join(' ')).toContain('rejects unmatched Host values');
		expect(guide('apache')?.config).not.toContain('%{HTTP_HOST}');
	});

	it('uses only host/protocol and Obzorarr configuration guidance', () => {
		const links = documentationForDiagnostic(diagnostic('confirm-trust-boundary'));
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
