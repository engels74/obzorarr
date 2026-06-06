<script lang="ts">
import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
import CheckIcon from '@lucide/svelte/icons/check';
import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
import { animate } from 'motion';
import SubmitButton from '$lib/components/forms/SubmitButton.svelte';
import OnboardingCard from '$lib/components/onboarding/OnboardingCard.svelte';
import { Button } from '$lib/components/ui/button';
import { REVERSE_PROXY_COPY } from '$lib/copy/reverse-proxy';
import { submitAction } from '$lib/utils/submit-action';
import type { ActionData, PageData } from './$types';

let { data, form }: { data: PageData; form: ActionData } = $props();

type ReverseProxyDiagnosticView = {
	trustProxy: {
		enabled: boolean;
		source: 'env' | 'db' | 'default';
		isLocked: boolean;
	};
	forwardedHeaders: {
		present: string[];
		pair: {
			status: string;
			isUsable: boolean;
			protoPresent: boolean;
			hostPresent: boolean;
		};
	};
	sourceAddress: {
		category: string;
	};
	originComparison: {
		browserMatchesRawApp: boolean | null;
		browserMatchesEffectiveApp: boolean | null;
		forwardedPairMatchesBrowser: boolean | null;
	};
	recommendation: {
		action:
			| 'enable'
			| 'leave-disabled'
			| 'review-proxy'
			| 'appears-working'
			| 'unable-to-determine'
			| 'env-controlled';
		summary: string;
	};
	reasons: string[];
	safetyNotice: string;
};

let browserOrigin = $state<string>('');
let reverseProxyDiagnostic = $state<ReverseProxyDiagnosticView | null>(null);
let diagnosticStatus = $state<'idle' | 'checking' | 'success' | 'failure'>('idle');
let diagnosticError = $state<string | null>(null);
let showDetails = $state(false);
let hasRunInitialDiagnostic = $state(false);
let hasRefreshedAfterTrustProxySuccess = $state(false);
let diagnosticRunToken = 0;

function updateDiagnosticFromActionForm() {
	if (form?.trustProxySuccess) {
		diagnosticError = null;
		if (!hasRefreshedAfterTrustProxySuccess) {
			hasRefreshedAfterTrustProxySuccess = true;
			hasRunInitialDiagnostic = true;
			void runDiagnostic();
		}
		return;
	}
	if (hasRefreshedAfterTrustProxySuccess) {
		hasRefreshedAfterTrustProxySuccess = false;
	}
	if (form?.reverseProxyDiagnostic) {
		reverseProxyDiagnostic = form.reverseProxyDiagnostic as ReverseProxyDiagnosticView;
		diagnosticStatus = 'success';
		diagnosticError = null;
	}
	if (form?.diagnosticError) {
		reverseProxyDiagnostic = null;
		diagnosticStatus = 'failure';
		diagnosticError = form.diagnosticError;
	}
}

async function runDiagnostic() {
	if (diagnosticStatus === 'checking') return;

	const myToken = ++diagnosticRunToken;
	browserOrigin = window.location.origin;
	reverseProxyDiagnostic = null;
	diagnosticStatus = 'checking';
	diagnosticError = null;

	const formData = new FormData();
	formData.set('browserOrigin', browserOrigin);

	try {
		const result = await submitAction<{
			reverseProxyDiagnostic?: ReverseProxyDiagnosticView;
			diagnosticError?: string;
		}>('?/diagnoseReverseProxy', formData);

		if (myToken !== diagnosticRunToken) return;

		if (result.type === 'success') {
			if (result.data.reverseProxyDiagnostic) {
				reverseProxyDiagnostic = result.data.reverseProxyDiagnostic;
				diagnosticStatus = 'success';
			} else {
				diagnosticStatus = 'failure';
				diagnosticError = 'Diagnostic response was incomplete';
			}
		} else if (result.type === 'failure') {
			diagnosticStatus = 'failure';
			diagnosticError = result.data.diagnosticError ?? 'Diagnostic failed';
		} else {
			diagnosticStatus = 'failure';
			diagnosticError = 'Unexpected diagnostic response';
		}
	} catch {
		if (myToken !== diagnosticRunToken) return;
		diagnosticStatus = 'failure';
		diagnosticError = 'Network error - could not complete diagnostic';
	}
}

$effect(() => {
	updateDiagnosticFromActionForm();
	if (hasRunInitialDiagnostic) return;
	hasRunInitialDiagnostic = true;
	if (data.trustProxy?.isLocked) {
		diagnosticStatus = 'success';
		reverseProxyDiagnostic = {
			trustProxy: {
				enabled: data.trustProxy.enabled,
				source: data.trustProxy.source,
				isLocked: true
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
			recommendation: {
				action: 'env-controlled',
				summary: 'TRUST_PROXY is controlled by the environment.'
			},
			reasons: [
				`TRUST_PROXY is controlled by the environment and is currently ${data.trustProxy.enabled ? 'enabled' : 'disabled'}.`,
				'Obzorarr will not change this setting from the UI while it is locked.'
			],
			safetyNotice:
				'Only enable reverse proxy header trust when your upstream proxy strips visitor-supplied forwarding headers before requests reach Obzorarr.'
		};
		return;
	}
	void runDiagnostic();
});

let iconRef: HTMLElement | undefined = $state();
let contentRef: HTMLElement | undefined = $state();

$effect(() => {
	if (!iconRef) return;
	// biome-ignore lint/suspicious/noExplicitAny: Motion's animate function has complex overloads that TypeScript cannot infer correctly
	const animation = (animate as any)(
		iconRef,
		{
			opacity: [0, 1],
			transform: ['scale(0.8)', 'scale(1)']
		},
		{ duration: 0.5, easing: [0.22, 1, 0.36, 1] }
	);
	return () => animation.stop?.();
});

type Tone = 'success' | 'warning' | 'neutral';

type StatusView = {
	tone: Tone;
	headline: string;
	body: string;
};

function getStatusView(
	diagnostic: ReverseProxyDiagnosticView | null,
	formState: ActionData
): StatusView | null {
	if (!diagnostic) return null;

	if (formState?.trustProxySuccess) {
		return {
			tone: 'success',
			headline: 'Header trust enabled',
			body: 'Obzorarr will now identify visitors using your reverse proxy headers.'
		};
	}

	const action = diagnostic.recommendation.action;

	if (action === 'appears-working') {
		return {
			tone: 'success',
			headline: 'Connection looks good',
			body: 'Obzorarr can correctly identify visitor IP addresses and protocols.'
		};
	}

	if (action === 'leave-disabled') {
		return {
			tone: 'success',
			headline: 'Connection looks good',
			body: "No proxy detected — Obzorarr will use the direct connection details. You're all set."
		};
	}

	if (action === 'enable') {
		return {
			tone: 'warning',
			headline: 'Proxy detected',
			body: "Obzorarr is behind a proxy (like Nginx or Cloudflare) but isn't trusting its headers yet. Without header trust, visitor IPs and protocols may appear incorrect."
		};
	}

	if (action === 'env-controlled') {
		return {
			tone: 'neutral',
			headline: 'Controlled by environment',
			body: 'Reverse-proxy header trust is fixed by the TRUST_PROXY environment variable. Change it in your environment or container configuration and restart Obzorarr.'
		};
	}

	if (action === 'review-proxy') {
		return {
			tone: 'warning',
			headline: 'Proxy needs a closer look',
			body: 'Some forwarded headers are present but they do not line up with how your browser sees this site. Review your reverse proxy configuration, then re-run the check.'
		};
	}

	return {
		tone: 'neutral',
		headline: 'Could not verify automatically',
		body: 'Obzorarr could not determine your proxy setup. You can continue, but visitor data may be inaccurate.'
	};
}

function getForwardedPairLabel(status: string): string {
	switch (status) {
		case 'usable':
			return 'Forwarded scheme and host look usable';
		case 'missing':
			return 'No forwarded scheme/host pair detected';
		case 'partial':
			return 'Forwarded scheme/host pair is incomplete';
		case 'invalid-proto':
		case 'unsafe-host':
		case 'invalid-host':
			return 'Forwarded scheme/host pair is invalid';
		default:
			return 'Forwarded scheme/host pair needs review';
	}
}

const statusView = $derived(getStatusView(reverseProxyDiagnostic, form));

function canEnableTrustProxy(): boolean {
	return (
		diagnosticStatus === 'success' &&
		reverseProxyDiagnostic?.recommendation.action === 'enable' &&
		!reverseProxyDiagnostic.trustProxy.isLocked &&
		!form?.trustProxySuccess
	);
}

function toggleDetails() {
	showDetails = !showDetails;
}
</script>

<OnboardingCard
	title={REVERSE_PROXY_COPY.panelTitle}
	subtitle={REVERSE_PROXY_COPY.panelSubtitle}
>
	<div class="proxy-content" bind:this={contentRef}>
		<div class="icon-container" bind:this={iconRef}>
			<div class="icon-wrapper">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
					<path d="M3 12h4m10 0h4" stroke-linecap="round" />
					<rect
						x="8"
						y="8"
						width="8"
						height="8"
						rx="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
			</div>
		</div>

		<p class="intro-text">
			If you put Obzorarr behind a reverse proxy like Nginx, Cloudflare, or Caddy, it needs to trust
			the headers that proxy sends so visitor IPs and HTTPS detection work correctly.
		</p>

		{#if diagnosticStatus === 'checking' && !reverseProxyDiagnostic}
			<div class="status-card neutral loading">
				<LoaderCircleIcon class="size-5 animate-spin" aria-hidden="true" />
				<div class="status-text">
					<span class="status-headline">Checking your connection…</span>
					<span class="status-body">Comparing what your browser sees with what Obzorarr receives.</span>
				</div>
			</div>
		{:else if diagnosticStatus === 'failure' && !reverseProxyDiagnostic}
			<div class="status-card warning">
				<svg
					class="status-icon"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
				>
					<circle cx="12" cy="12" r="10" />
					<line x1="15" y1="9" x2="9" y2="15" stroke-linecap="round" />
					<line x1="9" y1="9" x2="15" y2="15" stroke-linecap="round" />
				</svg>
				<div class="status-text">
					<span class="status-headline">Could not run the check</span>
					<span class="status-body">{diagnosticError ?? 'Diagnostic failed'}</span>
				</div>
			</div>
		{:else if statusView && reverseProxyDiagnostic}
			<div class="status-card {statusView.tone}">
				{#if statusView.tone === 'success'}
					<svg
						class="status-icon"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<circle cx="12" cy="12" r="10" />
						<path d="M9 12l2 2 4-4" stroke-linecap="round" stroke-linejoin="round" />
					</svg>
				{:else if statusView.tone === 'warning'}
					<svg
						class="status-icon"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<path d="M12 2l10 18H2z" stroke-linecap="round" stroke-linejoin="round" />
						<line x1="12" y1="9" x2="12" y2="13" stroke-linecap="round" />
						<circle cx="12" cy="16" r="0.6" fill="currentColor" />
					</svg>
				{:else}
					<svg
						class="status-icon"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<circle cx="12" cy="12" r="10" />
						<path d="M12 16v-4" stroke-linecap="round" />
						<path d="M12 8h.01" stroke-linecap="round" />
					</svg>
				{/if}
				<div class="status-text">
					<span class="status-headline">{statusView.headline}</span>
					<span class="status-body">{statusView.body}</span>
				</div>
			</div>

			{#if canEnableTrustProxy()}
				<form method="POST" action="?/enableTrustProxy" class="trust-proxy-enable-form">
					<input type="hidden" name="browserOrigin" value={browserOrigin} />
					<label class="risk-confirmation">
						<input type="checkbox" name="confirmRisk" value="true" required />
						<span>
							I've confirmed my reverse proxy is configured to strip incoming
							<code>x-forwarded-*</code> headers from external visitors.
						</span>
					</label>
					<p class="risk-explainer">
						This prevents attackers from spoofing their location, but should only be enabled if
						your proxy is configured securely.
					</p>
					<SubmitButton class="enable-trust-btn tap-target">
						{#snippet children()}
							Enable Header Trust
						{/snippet}
					</SubmitButton>
				</form>
			{/if}

			{#if form?.trustProxyError}
				<div class="inline-error">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<circle cx="12" cy="12" r="10" />
						<line x1="15" y1="9" x2="9" y2="15" stroke-linecap="round" />
						<line x1="9" y1="9" x2="15" y2="15" stroke-linecap="round" />
					</svg>
					<span>{form.trustProxyError}</span>
				</div>
			{/if}

			<button type="button" class="details-toggle" onclick={toggleDetails} aria-expanded={showDetails}>
				<span>{showDetails ? 'Hide technical details' : 'Show technical details'}</span>
				<span class="chevron-wrap" class:open={showDetails} aria-hidden="true">
					<ChevronDownIcon class="size-4" />
				</span>
			</button>

			{#if showDetails}
				<div class="details-panel">
					<div class="diagnostic-facts">
						<div>
							<span class="fact-label">Forwarded headers</span>
							<span class="fact-value">
								{getForwardedPairLabel(reverseProxyDiagnostic.forwardedHeaders.pair.status)}
							</span>
						</div>
						<div>
							<span class="fact-label">Signals present</span>
							<span class="fact-value">
								{reverseProxyDiagnostic.forwardedHeaders.present.length > 0
									? reverseProxyDiagnostic.forwardedHeaders.present.join(', ')
									: 'None'}
							</span>
						</div>
						<div>
							<span class="fact-label">Current setting</span>
							<span class="fact-value">
								{reverseProxyDiagnostic.trustProxy.enabled ? 'Enabled' : 'Disabled'}
								{#if reverseProxyDiagnostic.trustProxy.isLocked}
									<span class="inline-badge">ENV</span>
								{/if}
							</span>
						</div>
					</div>

					{#if reverseProxyDiagnostic.reasons.length > 0}
						<div class="reasons-block">
							<span class="reasons-label">Why we recommend this</span>
							<ul>
								{#each reverseProxyDiagnostic.reasons as reason}
									<li>{reason}</li>
								{/each}
							</ul>
						</div>
					{/if}

					<p class="safety-note">{reverseProxyDiagnostic.safetyNotice}</p>

					<div class="re-check">
						<Button
							type="button"
							class="recheck-btn tap-target"
							onclick={runDiagnostic}
							disabled={diagnosticStatus === 'checking'}
							aria-busy={diagnosticStatus === 'checking'}
						>
							{#if diagnosticStatus === 'checking'}
								<LoaderCircleIcon class="size-3.5 animate-spin" aria-hidden="true" />
								{REVERSE_PROXY_COPY.rerunButtonInProgress}
							{:else}
								{REVERSE_PROXY_COPY.rerunButton}
							{/if}
						</Button>
					</div>
				</div>
			{/if}
		{/if}

		{#if form?.trustProxySuccess}
			<div class="success-banner">
				<CheckIcon class="size-4" strokeWidth={2.5} />
				<span>{form.trustProxyMessage ?? 'Reverse-proxy header trust enabled.'}</span>
			</div>
		{/if}
	</div>

	{#snippet footer()}
		<form method="POST" action="?/goBack" class="mr-auto">
			<Button type="submit" variant="outline" class="tap-target">
				<ArrowLeftIcon class="size-[18px]" />
				Previous
			</Button>
		</form>
		<form method="POST" action="?/continue" class="continue-form">
			<SubmitButton class="continue-btn tap-target">
				{#snippet children()}
					Continue
				{/snippet}
			</SubmitButton>
		</form>
	{/snippet}
</OnboardingCard>

<style>
	.proxy-content {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
		width: 100%;
	}

	.icon-container {
		display: flex;
		justify-content: center;
		margin-bottom: 0.25rem;
	}

	.icon-wrapper {
		width: 72px;
		height: 72px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: linear-gradient(135deg, rgba(59, 130, 246, 0.15) 0%, rgba(59, 130, 246, 0.05) 100%);
		border-radius: 18px;
		color: oklch(0.6261 0.1859 259.6);
	}

	.icon-wrapper svg {
		width: 40px;
		height: 40px;
	}

	.intro-text {
		margin: 0;
		font-size: 0.875rem;
		line-height: 1.55;
		color: rgba(255, 255, 255, 0.6);
		text-align: center;
	}

	.status-card {
		display: flex;
		align-items: flex-start;
		gap: 0.875rem;
		padding: 1rem 1.125rem;
		border-radius: 12px;
		border: 1px solid rgba(255, 255, 255, 0.1);
		background: rgba(255, 255, 255, 0.04);
	}

	.status-card.success {
		background: rgba(34, 197, 94, 0.09);
		border-color: rgba(34, 197, 94, 0.22);
	}

	.status-card.warning {
		background: rgba(245, 158, 11, 0.09);
		border-color: rgba(245, 158, 11, 0.22);
	}

	.status-card.neutral {
		background: rgba(255, 255, 255, 0.05);
		border-color: rgba(255, 255, 255, 0.1);
	}

	.status-card.loading {
		color: rgba(255, 255, 255, 0.6);
	}

	.status-icon {
		flex-shrink: 0;
		width: 22px;
		height: 22px;
		margin-top: 0.1rem;
	}

	.status-card.success .status-icon {
		color: oklch(0.7946 0.1951 150.81);
	}

	.status-card.warning .status-icon {
		color: oklch(0.79 0.1606 79.6);
	}

	.status-card.neutral .status-icon {
		color: rgba(255, 255, 255, 0.55);
	}

	.status-text {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		min-width: 0;
	}

	.status-headline {
		font-size: 0.95rem;
		font-weight: 600;
		color: rgba(255, 255, 255, 0.94);
	}

	.status-body {
		font-size: 0.825rem;
		line-height: 1.5;
		color: rgba(255, 255, 255, 0.62);
	}

	.trust-proxy-enable-form {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		margin: 0;
		padding: 1rem 1.125rem;
		background: rgba(34, 197, 94, 0.05);
		border: 1px solid rgba(34, 197, 94, 0.18);
		border-radius: 12px;
	}

	.risk-confirmation {
		display: flex;
		align-items: flex-start;
		gap: 0.625rem;
		font-size: 0.825rem;
		line-height: 1.5;
		color: rgba(255, 255, 255, 0.78);
	}

	.risk-confirmation input {
		flex-shrink: 0;
		margin-top: 0.2rem;
		accent-color: oklch(0.6261 0.1859 259.6);
	}

	.risk-confirmation code {
		font-family: 'SF Mono', 'Monaco', 'Inconsolata', monospace;
		font-size: 0.78rem;
		background: rgba(255, 255, 255, 0.08);
		padding: 0.05rem 0.3rem;
		border-radius: 4px;
		color: rgba(255, 255, 255, 0.8);
	}

	.risk-explainer {
		margin: 0;
		padding-left: 1.5rem;
		font-size: 0.775rem;
		line-height: 1.5;
		color: rgba(255, 255, 255, 0.5);
	}

	:global(.enable-trust-btn) {
		width: fit-content;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.375rem;
		padding: 0.55rem 0.95rem;
		border-radius: 8px;
		font-size: 0.825rem;
		font-weight: 600;
		cursor: pointer;
		background: rgba(34, 197, 94, 0.18);
		border: 1px solid rgba(34, 197, 94, 0.35);
		color: oklch(0.8046 0.1857 151.6);
		transition:
			background 0.2s,
			border-color 0.2s,
			transform 0.15s;
	}

	:global(.enable-trust-btn:hover:not(:disabled)) {
		background: rgba(34, 197, 94, 0.26);
		border-color: rgba(34, 197, 94, 0.5);
		transform: translateY(-1px);
	}

	:global(.enable-trust-btn:disabled) {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.inline-error {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
		padding: 0.7rem 0.875rem;
		border-radius: 10px;
		background: rgba(239, 68, 68, 0.1);
		border: 1px solid rgba(239, 68, 68, 0.2);
		color: oklch(0.6356 0.2082 25.38);
		font-size: 0.825rem;
		line-height: 1.45;
	}

	.inline-error svg {
		flex-shrink: 0;
		width: 18px;
		height: 18px;
		margin-top: 0.1rem;
	}

	.success-banner {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.7rem 0.875rem;
		border-radius: 10px;
		background: rgba(34, 197, 94, 0.12);
		border: 1px solid rgba(34, 197, 94, 0.25);
		color: oklch(0.8046 0.1857 151.6);
		font-size: 0.85rem;
		font-weight: 500;
	}

	.details-toggle {
		align-self: center;
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		background: transparent;
		border: none;
		padding: 0.4rem 0.6rem;
		font-size: 0.78rem;
		font-weight: 500;
		color: rgba(255, 255, 255, 0.55);
		cursor: pointer;
		border-radius: 6px;
		transition: color 0.2s, background 0.2s;
	}

	.details-toggle:hover {
		color: rgba(255, 255, 255, 0.85);
		background: rgba(255, 255, 255, 0.04);
	}

	.details-toggle:focus-visible {
		outline: 2px solid oklch(0.6684 0.1625 259.49);
		outline-offset: 2px;
	}

	.chevron-wrap {
		display: inline-flex;
		align-items: center;
		transition: transform 0.2s ease;
	}

	.chevron-wrap.open {
		transform: rotate(180deg);
	}

	.details-panel {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 1rem 1.125rem;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.07);
		border-radius: 12px;
	}

	.diagnostic-facts {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.75rem;
	}

	.diagnostic-facts > div {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		min-width: 0;
		padding: 0.7rem 0.75rem;
		background: rgba(255, 255, 255, 0.04);
		border: 1px solid rgba(255, 255, 255, 0.07);
		border-radius: 8px;
	}

	.fact-label {
		font-size: 0.65rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: rgba(255, 255, 255, 0.4);
	}

	.fact-value {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		min-width: 0;
		font-size: 0.78rem;
		line-height: 1.35;
		color: rgba(255, 255, 255, 0.74);
		overflow-wrap: anywhere;
	}

	.inline-badge {
		display: inline-flex;
		align-items: center;
		padding: 0.1rem 0.35rem;
		border-radius: 4px;
		background: rgba(34, 197, 94, 0.14);
		border: 1px solid rgba(34, 197, 94, 0.25);
		color: oklch(0.8116 0.1789 152.1);
		font-size: 0.6rem;
		font-weight: 700;
		letter-spacing: 0.05em;
	}

	.reasons-block {
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
	}

	.reasons-label {
		font-size: 0.7rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: rgba(255, 255, 255, 0.45);
	}

	.reasons-block ul {
		margin: 0;
		padding-left: 1.1rem;
		color: rgba(255, 255, 255, 0.62);
		font-size: 0.8rem;
		line-height: 1.5;
	}

	.safety-note {
		margin: 0;
		font-size: 0.78rem;
		line-height: 1.5;
		color: rgba(255, 255, 255, 0.5);
	}

	.re-check {
		display: flex;
		justify-content: flex-end;
	}

	:global(.recheck-btn) {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.45rem 0.75rem;
		border-radius: 6px;
		background: rgba(59, 130, 246, 0.08);
		border: 1px solid rgba(59, 130, 246, 0.18);
		color: oklch(0.695 0.1481 259.5);
		font-size: 0.75rem;
		font-weight: 600;
		cursor: pointer;
		transition: background 0.2s, border-color 0.2s;
	}

	:global(.recheck-btn:hover:not(:disabled)) {
		background: rgba(59, 130, 246, 0.14);
		border-color: rgba(59, 130, 246, 0.28);
	}

	:global(.recheck-btn:disabled) {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.continue-form {
		display: flex;
		margin: 0;
		width: 100%;
	}

	:global(.continue-btn) {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 0.875rem 1.5rem;
		background: linear-gradient(135deg, oklch(0.5869 0.2079 260) 0%, oklch(0.5516 0.2278 260.85) 100%);
		border: none;
		border-radius: 10px;
		font-size: 0.9rem;
		font-weight: 600;
		color: white;
		cursor: pointer;
		transition: opacity 0.2s, transform 0.2s;
	}

	:global(.continue-btn:hover:not(:disabled)) {
		opacity: 0.9;
		transform: translateY(-1px);
	}

	:global(.continue-btn:disabled) {
		opacity: 0.5;
		cursor: not-allowed;
	}

	@media (max-width: 480px) {
		.diagnostic-facts {
			grid-template-columns: 1fr;
		}
	}
</style>
