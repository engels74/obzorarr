import { isIP } from 'node:net';
import {
	type ConfigSource,
	type ConfigValue,
	getCsrfConfigWithSource,
	getTrustProxyConfigWithSource
} from '$lib/server/admin/settings.service';
import {
	type ForwardedHeaderName,
	type ForwardedProtoHostStatus,
	getForwardedHeaderNamesPresent,
	parseForwardedProtoHost
} from './forwarded-headers';

export type SourceAddressCategory =
	| 'loopback'
	| 'private-lan'
	| 'docker/private-range'
	| 'tailscale/cgnat'
	| 'link-local'
	| 'public'
	| 'unknown';

export type ReverseProxyRecommendationAction =
	| 'enable'
	| 'leave-disabled'
	| 'review-proxy'
	| 'appears-working'
	| 'unable-to-determine'
	| 'env-controlled';

export interface ReverseProxyDiagnosticInput {
	request: Request;
	rawAppUrl: string | URL;
	effectiveAppUrl: string | URL;
	browserOrigin?: string | null;
	sourceAddress?: string | null;
}

export interface ReverseProxyDiagnosticBuildInput extends ReverseProxyDiagnosticInput {
	trustProxy: ConfigValue<string>;
	csrfOrigin: ConfigValue<string>;
}

export interface OriginDiagnostic {
	origin: string | null;
	isValid: boolean;
}

export interface ConfiguredOriginDiagnostic extends OriginDiagnostic {
	source: ConfigSource;
	isConfigured: boolean;
	isLocked: boolean;
}

export interface ForwardedPairDiagnostic {
	status: ForwardedProtoHostStatus;
	isUsable: boolean;
	protoPresent: boolean;
	hostPresent: boolean;
}

export interface ReverseProxyDiagnostic {
	trustProxy: {
		enabled: boolean;
		source: ConfigSource;
		isLocked: boolean;
	};
	origins: {
		rawApp: string | null;
		effectiveApp: string | null;
		browser: OriginDiagnostic;
		configuredPublic: ConfiguredOriginDiagnostic;
	};
	forwardedHeaders: {
		present: ForwardedHeaderName[];
		pair: ForwardedPairDiagnostic;
	};
	sourceAddress: {
		category: SourceAddressCategory;
	};
	originComparison: {
		browserMatchesRawApp: boolean | null;
		browserMatchesEffectiveApp: boolean | null;
		forwardedPairMatchesBrowser: boolean | null;
	};
	recommendation: {
		action: ReverseProxyRecommendationAction;
		summary: string;
	};
	reasons: string[];
	safetyNotice: string;
}

const SAFETY_NOTICE =
	'Only enable reverse proxy header trust when your upstream proxy strips visitor-supplied forwarding headers before requests reach Obzorarr.';

function originFromUrl(value: string | URL): string | null {
	try {
		return value instanceof URL ? value.origin : new URL(value).origin;
	} catch {
		return null;
	}
}

function normalizeOrigin(value: string | null | undefined): OriginDiagnostic {
	if (!value) return { origin: null, isValid: false };

	try {
		const parsed = new URL(value);
		const isHttpOrigin =
			(parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
			!parsed.username &&
			!parsed.password;
		return {
			origin: isHttpOrigin ? parsed.origin : null,
			isValid: isHttpOrigin
		};
	} catch {
		return { origin: null, isValid: false };
	}
}

function originsEqual(a: string | null, b: string | null): boolean | null {
	if (!a || !b) return null;
	return a.toLowerCase() === b.toLowerCase();
}

function stripIpv6Zone(address: string): string {
	const zoneIndex = address.indexOf('%');
	return zoneIndex === -1 ? address : address.slice(0, zoneIndex);
}

function normalizeSourceAddress(address: string): string | null {
	const trimmed = address.trim();
	if (!trimmed) return null;

	const withoutBrackets =
		trimmed.startsWith('[') && trimmed.includes(']')
			? trimmed.slice(1, trimmed.indexOf(']'))
			: trimmed;

	const addressWithoutZone = stripIpv6Zone(withoutBrackets.toLowerCase());
	if (isIP(addressWithoutZone)) return addressWithoutZone;

	const maybeIpv4WithPort = trimmed.match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/);
	if (maybeIpv4WithPort?.[1] && isIP(maybeIpv4WithPort[1])) return maybeIpv4WithPort[1];

	return null;
}

function ipv4Octets(address: string): [number, number, number, number] | null {
	const parts = address.split('.');
	if (parts.length !== 4) return null;
	const octets = parts.map((part) => Number(part)) as [number, number, number, number];
	if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
		return null;
	}
	return octets;
}

export function classifySourceAddress(address: string | null | undefined): SourceAddressCategory {
	const normalized = normalizeSourceAddress(address ?? '');
	if (!normalized) return 'unknown';

	if (normalized.startsWith('::ffff:')) {
		return classifySourceAddress(normalized.slice('::ffff:'.length));
	}

	const ipv4 = ipv4Octets(normalized);
	if (ipv4) {
		const [a, b] = ipv4;
		if (a === 127) return 'loopback';
		if (a === 172 && b >= 16 && b <= 31) return 'docker/private-range';
		if (a === 10 || (a === 192 && b === 168)) return 'private-lan';
		if (a === 169 && b === 254) return 'link-local';
		if (a === 100 && b >= 64 && b <= 127) return 'tailscale/cgnat';
		return 'public';
	}

	if (normalized === '::1') return 'loopback';
	if (normalized.startsWith('fc') || normalized.startsWith('fd')) return 'private-lan';
	if (/^fe[89ab]/.test(normalized)) return 'link-local';
	return 'public';
}

function recommendationFor(input: {
	trustEnabled: boolean;
	trustSource: ConfigSource;
	browserOrigin: OriginDiagnostic;
	rawAppOrigin: string | null;
	effectiveAppOrigin: string | null;
	forwardedPair: ReturnType<typeof parseForwardedProtoHost>;
}): Pick<ReverseProxyDiagnostic, 'recommendation' | 'reasons'> {
	const browserMatchesRawApp = originsEqual(input.browserOrigin.origin, input.rawAppOrigin);
	const browserMatchesEffectiveApp = originsEqual(
		input.browserOrigin.origin,
		input.effectiveAppOrigin
	);
	const forwardedPairMatchesBrowser = originsEqual(
		input.browserOrigin.origin,
		input.forwardedPair.url?.origin ?? null
	);
	const reasons: string[] = [];

	if (input.trustSource === 'env') {
		reasons.push(
			`TRUST_PROXY is controlled by the environment and is currently ${input.trustEnabled ? 'enabled' : 'disabled'}.`
		);
		reasons.push('Obzorarr will not change this setting from the UI while it is locked.');
		return {
			recommendation: {
				action: 'env-controlled',
				summary: 'TRUST_PROXY is controlled by the environment.'
			},
			reasons
		};
	}

	if (!input.browserOrigin.isValid) {
		reasons.push(
			'The browser origin was missing or invalid, so the server cannot compare it safely.'
		);
		if (input.forwardedPair.isUsable) {
			reasons.push(
				'A usable forwarded proto and host pair is present, but it was not trusted alone.'
			);
		}
		return {
			recommendation: {
				action: 'unable-to-determine',
				summary: 'Unable to determine safely without a valid browser origin.'
			},
			reasons
		};
	}

	if (!input.trustEnabled) {
		if (
			browserMatchesRawApp === false &&
			input.forwardedPair.isUsable &&
			forwardedPairMatchesBrowser === true
		) {
			reasons.push('The browser origin differs from the raw app origin seen by Obzorarr.');
			reasons.push('The forwarded proto and host pair is usable and matches the browser origin.');
			reasons.push(
				'Enabling trust may fix public URL detection after you verify proxy header stripping.'
			);
			return {
				recommendation: {
					action: 'enable',
					summary: 'Enable reverse proxy header trust after confirming your proxy strips headers.'
				},
				reasons
			};
		}

		if (browserMatchesRawApp === true && input.forwardedPair.status === 'missing') {
			reasons.push('The browser origin already matches the raw app origin.');
			reasons.push('No usable forwarded proto and host pair is present.');
			return {
				recommendation: {
					action: 'leave-disabled',
					summary: 'Leave reverse proxy header trust disabled.'
				},
				reasons
			};
		}

		reasons.push(
			'Forwarded headers are partial, invalid, missing for this proxy shape, or do not match the browser origin.'
		);
		reasons.push('Review your reverse proxy configuration before enabling header trust.');
		return {
			recommendation: {
				action: 'review-proxy',
				summary: 'Review proxy configuration before changing reverse proxy header trust.'
			},
			reasons
		};
	}

	if (input.forwardedPair.isUsable && browserMatchesEffectiveApp === true) {
		reasons.push('Reverse proxy header trust is enabled.');
		reasons.push('The effective app origin matches the browser origin.');
		reasons.push(
			'This appears to be working only if the upstream proxy strips visitor-supplied forwarding headers.'
		);
		return {
			recommendation: {
				action: 'appears-working',
				summary: 'Reverse proxy header trust appears to be working.'
			},
			reasons
		};
	}

	reasons.push(
		'Reverse proxy header trust is enabled, but the forwarded pair is missing, invalid, or not producing the browser origin.'
	);
	reasons.push('Review the proxy setup and disable trust if no trusted reverse proxy needs it.');
	return {
		recommendation: {
			action: 'review-proxy',
			summary: 'Review proxy configuration for the current TRUST_PROXY setting.'
		},
		reasons
	};
}

export function buildReverseProxyDiagnostic(
	input: ReverseProxyDiagnosticBuildInput
): ReverseProxyDiagnostic {
	const forwardedPair = parseForwardedProtoHost(input.request.headers);
	const rawAppOrigin = originFromUrl(input.rawAppUrl);
	const effectiveAppOrigin = originFromUrl(input.effectiveAppUrl);
	const browserOrigin = normalizeOrigin(input.browserOrigin);
	const configuredPublicOrigin = normalizeOrigin(input.csrfOrigin.value || null);
	const trustEnabled = input.trustProxy.value === 'true';
	const { recommendation, reasons } = recommendationFor({
		trustEnabled,
		trustSource: input.trustProxy.source,
		browserOrigin,
		rawAppOrigin,
		effectiveAppOrigin,
		forwardedPair
	});

	return {
		trustProxy: {
			enabled: trustEnabled,
			source: input.trustProxy.source,
			isLocked: input.trustProxy.isLocked
		},
		origins: {
			rawApp: rawAppOrigin,
			effectiveApp: effectiveAppOrigin,
			browser: browserOrigin,
			configuredPublic: {
				...configuredPublicOrigin,
				source: input.csrfOrigin.source,
				isConfigured: Boolean(input.csrfOrigin.value),
				isLocked: input.csrfOrigin.isLocked
			}
		},
		forwardedHeaders: {
			present: getForwardedHeaderNamesPresent(input.request.headers),
			pair: {
				status: forwardedPair.status,
				isUsable: forwardedPair.isUsable,
				protoPresent: forwardedPair.protoPresent,
				hostPresent: forwardedPair.hostPresent
			}
		},
		sourceAddress: {
			category: classifySourceAddress(input.sourceAddress)
		},
		originComparison: {
			browserMatchesRawApp: originsEqual(browserOrigin.origin, rawAppOrigin),
			browserMatchesEffectiveApp: originsEqual(browserOrigin.origin, effectiveAppOrigin),
			forwardedPairMatchesBrowser: originsEqual(
				browserOrigin.origin,
				forwardedPair.url?.origin ?? null
			)
		},
		recommendation,
		reasons,
		safetyNotice: SAFETY_NOTICE
	};
}

export async function createReverseProxyDiagnostic(
	input: ReverseProxyDiagnosticInput
): Promise<ReverseProxyDiagnostic> {
	const [trustProxy, csrfOrigin] = await Promise.all([
		getTrustProxyConfigWithSource(),
		getCsrfConfigWithSource()
	]);

	return buildReverseProxyDiagnostic({
		...input,
		trustProxy: trustProxy.trustProxy,
		csrfOrigin: csrfOrigin.origin
	});
}

export const ENABLE_TRUST_PROXY_NOT_RECOMMENDED_MESSAGE =
	'The current diagnostic does not recommend enabling reverse proxy header trust.';

export type EnableTrustProxyDecision = { ok: true } | { ok: false; error: string };

/**
 * Gate the "enable TRUST_PROXY" write on the live diagnostic recommendation.
 * Both the admin Security page and the onboarding proxy-trust step run the
 * diagnostic immediately before flipping the setting; this helper is the
 * single source of truth for the rejection message.
 */
export function assertEnableTrustProxyAllowed(
	diagnostic: ReverseProxyDiagnostic
): EnableTrustProxyDecision {
	if (diagnostic.recommendation.action === 'enable') {
		return { ok: true };
	}
	return { ok: false, error: ENABLE_TRUST_PROXY_NOT_RECOMMENDED_MESSAGE };
}
