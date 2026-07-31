import type {
	ForwardedProtoHostStatus,
	ReverseProxyDiagnostic,
	ReverseProxyDocumentationLink,
	ReverseProxyPresentation,
	ReverseProxyProviderId
} from '$lib/security/reverse-proxy';

export const REVERSE_PROXY_COPY = {
	panelTitle: 'Reverse-proxy header trust',
	panelSubtitle: 'Verify the public host and protocol Obzorarr receives from your proxy',
	rerunButton: 'Re-run diagnostic',
	rerunButtonInProgress: 'Re-checking…',
	detailsButton: 'Technical evidence and repair guides',
	savedVerifying: 'Setting saved. Obzorarr is checking the new result…',
	savedUnverified:
		'The setting was saved, but Obzorarr could not verify the result. Re-run the diagnostic before relying on public URLs.',
	continueWarning:
		'Continuing keeps the detected host/protocol problem. Public links, Plex callbacks, or CSRF origin checks may use the wrong origin.'
} as const;

const SAFETY_NOTICE =
	'Trust forwarding headers only when Obzorarr is reachable through a proxy that removes or overwrites visitor-supplied X-Forwarded-Proto and X-Forwarded-Host values. Never enable TRUST_PROXY for a directly exposed app.';

const PROXY_REPAIR_DOCUMENTATION_IDS = [
	'nginx-proxy-set-header',
	'nginx-proxy-manager-custom-config',
	'caddy-reverse-proxy',
	'apache-request-header',
	'obzorarr-trust-proxy'
] as const;

const PAIR_LABELS: Record<ForwardedProtoHostStatus, string> = {
	usable: 'Both headers are present and valid',
	missing: 'Both headers are missing',
	partial: 'Only one required header is present',
	'invalid-proto': 'X-Forwarded-Proto is invalid',
	'unsafe-host': 'X-Forwarded-Host contains an unsafe value',
	'invalid-host': 'X-Forwarded-Host is invalid'
};

function displayOrigin(origin: string | null): string {
	return origin ?? 'not available';
}

function observedEvidence(diagnostic: ReverseProxyDiagnostic): string {
	const pair = diagnostic.facts.forwardedHeaders.pair;
	const browserOrigin = displayOrigin(diagnostic.facts.browserOrigin.origin);
	const forwardedOrigin = displayOrigin(diagnostic.facts.origins.forwardedPair);

	switch (pair.status) {
		case 'missing':
			return 'Neither X-Forwarded-Proto nor X-Forwarded-Host arrived with this request.';
		case 'partial':
			return pair.protoPresent
				? 'X-Forwarded-Proto arrived, but X-Forwarded-Host is missing.'
				: 'X-Forwarded-Host arrived, but X-Forwarded-Proto is missing.';
		case 'invalid-proto':
			return 'X-Forwarded-Proto arrived with a value other than http or https.';
		case 'unsafe-host':
			return 'X-Forwarded-Host arrived with characters that are unsafe in a public origin.';
		case 'invalid-host':
			return 'X-Forwarded-Host arrived, but it is not a valid public host and optional port.';
		case 'usable':
			if (diagnostic.facts.originComparison.forwardedPairMatchesBrowser === false) {
				return `Both required headers arrived, but forwarded origin ${forwardedOrigin} does not match browser origin ${browserOrigin}.`;
			}
			if (diagnostic.facts.originComparison.browserMatchesRawApp === true) {
				return `Both required headers arrived, but browser origin ${browserOrigin} already matches the direct app origin.`;
			}
			return `Both required headers arrived with forwarded origin ${forwardedOrigin}.`;
		default: {
			const exhaustive: never = pair.status;
			return exhaustive;
		}
	}
}

function reviewNextAction(diagnostic: ReverseProxyDiagnostic): string {
	const status = diagnostic.facts.forwardedHeaders.pair.status;
	switch (status) {
		case 'missing':
			return 'Configure the proxy to overwrite both X-Forwarded-Proto and X-Forwarded-Host, then rerun.';
		case 'partial':
			return 'Add the missing member of the X-Forwarded-Proto/X-Forwarded-Host pair, overwrite both values at the proxy, then rerun.';
		case 'invalid-proto':
			return 'Set X-Forwarded-Proto to exactly http or https at the proxy, then rerun.';
		case 'unsafe-host':
		case 'invalid-host':
			return 'Set X-Forwarded-Host to the public hostname (and port when non-standard), then rerun.';
		case 'usable':
			if (diagnostic.facts.originComparison.forwardedPairMatchesBrowser === false) {
				return 'The forwarded origin conflicts with the browser origin. Set both headers from the public request, then rerun.';
			}
			if (diagnostic.facts.originComparison.browserMatchesRawApp === true) {
				return 'The direct app origin already matches the browser, so these headers do not prove a trusted proxy is required. Remove unnecessary forwarding headers and leave TRUST_PROXY disabled, or open the intended public proxy address and rerun.';
			}
			return 'The pair is valid, but Obzorarr could not confirm the trusted proxy boundary. Verify the last proxy overwrites both headers, then rerun.';
		default: {
			const exhaustive: never = status;
			return exhaustive;
		}
	}
}

export function presentReverseProxyDiagnostic(
	diagnostic: ReverseProxyDiagnostic
): ReverseProxyPresentation {
	const pairLabel = PAIR_LABELS[diagnostic.facts.forwardedHeaders.pair.status];
	const diagnosis = observedEvidence(diagnostic);

	switch (diagnostic.action) {
		case 'enable':
			return {
				tone: 'warning',
				headline: 'Forwarded origin matches; trust is still disabled',
				diagnosis,
				nextAction:
					'Verify that the upstream proxy overwrites visitor-supplied forwarding headers, confirm the risk, then enable TRUST_PROXY.',
				consequence:
					'Until enabled, Obzorarr continues using the internal app origin for generated public URLs.',
				pairLabel,
				safetyNotice: SAFETY_NOTICE,
				documentationIds: [...PROXY_REPAIR_DOCUMENTATION_IDS]
			};
		case 'leave-disabled':
			return {
				tone: 'success',
				headline: 'Direct origin is already consistent',
				diagnosis,
				nextAction:
					'Leave TRUST_PROXY disabled unless you later place Obzorarr behind a trusted proxy.',
				consequence: 'No proxy-origin repair is needed for this request.',
				pairLabel,
				safetyNotice: SAFETY_NOTICE,
				documentationIds: ['obzorarr-trust-proxy']
			};
		case 'appears-working':
			return {
				tone: 'success',
				headline: 'Trusted proxy origin appears to be working',
				diagnosis,
				nextAction:
					'No setting change is needed. Confirm the proxy replacement boundary remains enforced, especially after proxy changes.',
				consequence: 'Obzorarr’s effective public host and protocol match the browser origin.',
				pairLabel,
				safetyNotice: SAFETY_NOTICE,
				documentationIds: ['obzorarr-trust-proxy']
			};
		case 'unable-to-determine':
			return {
				tone: 'warning',
				headline: 'Open Obzorarr at its intended public address',
				diagnosis,
				nextAction:
					'Load this page from the public http:// or https:// origin and rerun; forwarded headers alone are not trusted evidence.',
				consequence: REVERSE_PROXY_COPY.continueWarning,
				pairLabel,
				safetyNotice: SAFETY_NOTICE,
				documentationIds: ['obzorarr-trust-proxy']
			};
		case 'env-controlled': {
			const enabled = diagnostic.facts.trustProxy.enabled;
			const pair = diagnostic.facts.forwardedHeaders.pair;
			const effectiveMatches = diagnostic.facts.originComparison.browserMatchesEffectiveApp;
			const rawMatches = diagnostic.facts.originComparison.browserMatchesRawApp;
			const forwardedMatches = diagnostic.facts.originComparison.forwardedPairMatchesBrowser;

			if (enabled && pair.isUsable && effectiveMatches === true) {
				return {
					tone: 'success',
					headline: 'TRUST_PROXY is enabled by the environment and the origin matches',
					diagnosis,
					nextAction:
						'No environment change is needed. Keep the proxy replacement boundary enforced and rerun after proxy changes.',
					consequence:
						'Environment-managed TRUST_PROXY is working for this request; client-IP handling remains separate.',
					pairLabel,
					safetyNotice: SAFETY_NOTICE,
					documentationIds: ['obzorarr-trust-proxy']
				};
			}

			if (!enabled && rawMatches === true && pair.status === 'missing') {
				return {
					tone: 'success',
					headline: 'TRUST_PROXY is disabled by the environment and direct origin is consistent',
					diagnosis,
					nextAction:
						'Leave TRUST_PROXY=false. Change it only after placing Obzorarr behind a trusted proxy that overwrites both forwarding headers.',
					consequence:
						'The environment-managed setting already matches this direct-access request.',
					pairLabel,
					safetyNotice: SAFETY_NOTICE,
					documentationIds: ['obzorarr-trust-proxy']
				};
			}

			if (!enabled && pair.isUsable && forwardedMatches === true && rawMatches === false) {
				return {
					tone: 'warning',
					headline: 'TRUST_PROXY is disabled by the environment',
					diagnosis,
					nextAction:
						'After verifying the proxy replacement boundary, set TRUST_PROXY=true in the environment or container configuration, restart Obzorarr, and rerun.',
					consequence:
						'Obzorarr cannot use the matching forwarded public origin until the environment setting changes and the app restarts.',
					pairLabel,
					safetyNotice: SAFETY_NOTICE,
					documentationIds: [...PROXY_REPAIR_DOCUMENTATION_IDS]
				};
			}

			return {
				tone: 'danger',
				headline: `TRUST_PROXY is ${enabled ? 'enabled' : 'disabled'} by the environment, but the proxy evidence needs repair`,
				diagnosis,
				nextAction: `${reviewNextAction(diagnostic)} Restart Obzorarr after changing TRUST_PROXY in the environment or container configuration.`,
				consequence: enabled
					? 'Obzorarr is trusting a host/protocol result that does not match the browser origin.'
					: 'Do not enable TRUST_PROXY until the forwarding pair and replacement boundary are correct.',
				pairLabel,
				safetyNotice: SAFETY_NOTICE,
				documentationIds: [...PROXY_REPAIR_DOCUMENTATION_IDS]
			};
		}
		case 'review-proxy':
			return {
				tone: 'danger',
				headline: 'Proxy headers need repair',
				diagnosis,
				nextAction: reviewNextAction(diagnostic),
				consequence: REVERSE_PROXY_COPY.continueWarning,
				pairLabel,
				safetyNotice: SAFETY_NOTICE,
				documentationIds: [...PROXY_REPAIR_DOCUMENTATION_IDS]
			};
		default: {
			const exhaustive: never = diagnostic.action;
			return exhaustive;
		}
	}
}

export const REVERSE_PROXY_DOCUMENTATION: ReverseProxyDocumentationLink[] = [
	{
		id: 'nginx-proxy-set-header',
		provider: 'Nginx',
		url: 'https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_set_header',
		purpose: 'forwarded-host-proto',
		applicabilityLabel: 'Official proxy_set_header reference'
	},
	{
		id: 'nginx-proxy-manager-custom-config',
		provider: 'Nginx Proxy Manager',
		url: 'https://nginxproxymanager.com/advanced-config/#custom-nginx-configurations',
		purpose: 'forwarded-host-proto',
		applicabilityLabel: 'Official custom Nginx configuration locations'
	},
	{
		id: 'caddy-reverse-proxy',
		provider: 'Caddy',
		url: 'https://caddyserver.com/docs/caddyfile/directives/reverse_proxy#headers',
		purpose: 'header-replacement-boundary',
		applicabilityLabel: 'Official reverse_proxy header behavior'
	},
	{
		id: 'apache-request-header',
		provider: 'Apache',
		url: 'https://httpd.apache.org/docs/2.4/mod/mod_headers.html#requestheader',
		purpose: 'header-replacement-boundary',
		applicabilityLabel: 'Official RequestHeader replacement reference'
	},
	{
		id: 'obzorarr-trust-proxy',
		provider: 'Obzorarr',
		url: 'https://github.com/engels74/obzorarr#reverse-proxy-header-trust',
		purpose: 'obzorarr-configuration',
		applicabilityLabel: 'Obzorarr TRUST_PROXY and restart guidance'
	}
];

export interface ReverseProxyProviderGuide {
	id: ReverseProxyProviderId;
	label: string;
	steps: string[];
	config?: string;
	documentationId: ReverseProxyDocumentationLink['id'];
}

export const REVERSE_PROXY_PROVIDER_GUIDES: ReverseProxyProviderGuide[] = [
	{
		id: 'nginx',
		label: 'Nginx',
		steps: [
			'Route only the intended public hostname to this server block. Replace the example hostname and scheme below with the exact public origin.',
			'Add these directives in the location that proxies to Obzorarr, reload Nginx, then rerun. Restart Obzorarr too only when TRUST_PROXY is environment-controlled.'
		],
		config:
			'# Replace with your exact public origin.\nproxy_set_header X-Forwarded-Proto https;\nproxy_set_header X-Forwarded-Host obzorarr.example.com;',
		documentationId: 'nginx-proxy-set-header'
	},
	{
		id: 'nginx-proxy-manager',
		label: 'Nginx Proxy Manager',
		steps: [
			'Make this Proxy Host match only the intended public hostname. In Advanced, replace the example hostname and scheme below with that exact public origin.',
			'Save the host, then rerun. Restart Obzorarr too only when TRUST_PROXY is environment-controlled.'
		],
		config:
			'# Replace with your exact public origin.\nproxy_set_header X-Forwarded-Proto https;\nproxy_set_header X-Forwarded-Host obzorarr.example.com;',
		documentationId: 'nginx-proxy-manager-custom-config'
	},
	{
		id: 'caddy',
		label: 'Caddy',
		steps: [
			'Use the exact public hostname as the Caddy site address. Replace the example upstream and hostname below for your deployment.',
			'Reload Caddy, then rerun. Restart Obzorarr too only when TRUST_PROXY is environment-controlled.'
		],
		config:
			'obzorarr.example.com {\n\treverse_proxy obzorarr:3000 {\n\t\theader_up X-Forwarded-Proto https\n\t\theader_up X-Forwarded-Host obzorarr.example.com\n\t}\n}',
		documentationId: 'caddy-reverse-proxy'
	},
	{
		id: 'apache',
		label: 'Apache',
		steps: [
			'Use a name-based virtual host for the exact public hostname. Replace the example hostname and scheme below for your deployment.',
			'Enable mod_proxy, mod_proxy_http, and mod_headers; reload Apache, then rerun. Restart Obzorarr too only when TRUST_PROXY is environment-controlled.'
		],
		config:
			'# Replace with your exact public origin.\nRequestHeader set X-Forwarded-Proto "https"\nRequestHeader set X-Forwarded-Host "obzorarr.example.com"',
		documentationId: 'apache-request-header'
	},
	{
		id: 'other',
		label: 'Other proxy',
		steps: [
			'At the last trusted hop, remove any inbound X-Forwarded-Proto and X-Forwarded-Host values.',
			'Set X-Forwarded-Proto from the public request scheme and X-Forwarded-Host from its public host.',
			'Reload the proxy, restart Obzorarr only if TRUST_PROXY is environment-controlled, then rerun.'
		],
		documentationId: 'obzorarr-trust-proxy'
	}
];

export function documentationForDiagnostic(
	diagnostic: ReverseProxyDiagnostic
): ReverseProxyDocumentationLink[] {
	const ids = new Set(presentReverseProxyDiagnostic(diagnostic).documentationIds);
	return REVERSE_PROXY_DOCUMENTATION.filter((link) => ids.has(link.id));
}

export function documentationForGuide(
	guide: ReverseProxyProviderGuide
): ReverseProxyDocumentationLink {
	const link = REVERSE_PROXY_DOCUMENTATION.find(({ id }) => id === guide.documentationId);
	if (!link) throw new Error(`Missing reverse-proxy documentation: ${guide.documentationId}`);
	return link;
}
