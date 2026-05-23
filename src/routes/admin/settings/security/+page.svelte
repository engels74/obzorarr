<script lang="ts">
import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
import { enhance } from '$app/forms';
import { invalidateAll } from '$app/navigation';
import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
import { Button } from '$lib/components/ui/button/index.js';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle
} from '$lib/components/ui/card/index.js';
import { Input } from '$lib/components/ui/input/index.js';
import { Label } from '$lib/components/ui/label/index.js';
import { Switch } from '$lib/components/ui/switch/index.js';
import { handleFormToast } from '$lib/utils/form-toast';
import { submitAction } from '$lib/utils/submit-action';
import type { PageData } from './$types';

interface Props {
	data: PageData;
}

let { data }: Props = $props();

const security = $derived(data.security);

// svelte-ignore state_referenced_locally
let csrfOriginInput = $state(security.originValue);

let isSavingCsrf = $state(false);
let isTestingCsrf = $state(false);
let isClearingCsrfSkip = $state(false);
let isResetingWarning = $state(false);
let isTogglingTrustProxy = $state(false);
let isConfirmingTrustProxy = $state(false);
let isConfirmingCsrfMismatch = $state(false);

let csrfMismatchDialogOpen = $state(false);
let pendingCsrfOrigin = $state<string | null>(null);
let pendingMismatchMessage = $state('');

let trustProxyConfirmDialogOpen = $state(false);

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

let diagnostic = $state<ReverseProxyDiagnosticView | null>(null);
let diagnosticStatus = $state<'idle' | 'checking' | 'success' | 'failure'>('idle');
let diagnosticError = $state<string | null>(null);
let showDiagnosticDetails = $state(false);
let hasRunInitialDiagnostic = $state(false);
let diagnosticRunToken = 0;

async function runDiagnostic() {
	if (diagnosticStatus === 'checking') return;

	const myToken = ++diagnosticRunToken;
	diagnostic = null;
	diagnosticStatus = 'checking';
	diagnosticError = null;

	const formData = new FormData();
	formData.set('browserOrigin', window.location.origin);

	try {
		const result = await submitAction<{
			reverseProxyDiagnostic?: ReverseProxyDiagnosticView;
			diagnosticError?: string;
		}>('?/diagnoseReverseProxy', formData);

		if (myToken !== diagnosticRunToken) return;

		if (result.type === 'success') {
			if (result.data.reverseProxyDiagnostic) {
				diagnostic = result.data.reverseProxyDiagnostic;
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
	if (hasRunInitialDiagnostic) return;
	hasRunInitialDiagnostic = true;
	void runDiagnostic();
});

type StatusTone = 'success' | 'warning' | 'neutral';

const statusView = $derived.by<{
	tone: StatusTone;
	headline: string;
	body: string;
} | null>(() => {
	if (!diagnostic) return null;
	const action = diagnostic.recommendation.action;

	if (action === 'appears-working') {
		return {
			tone: 'success',
			headline: 'Header trust is working',
			body: 'Obzorarr is correctly identifying visitor IP addresses and protocols from your reverse proxy.'
		};
	}
	if (action === 'leave-disabled') {
		return {
			tone: 'success',
			headline: 'No proxy detected',
			body: 'Direct connection details look correct. Header trust does not need to be enabled.'
		};
	}
	if (action === 'enable') {
		return {
			tone: 'warning',
			headline: 'Proxy detected — header trust recommended',
			body: 'Obzorarr appears to be behind a reverse proxy. Enable header trust to use forwarded IPs and protocols, but only if your proxy strips incoming x-forwarded-* headers from external traffic.'
		};
	}
	if (action === 'review-proxy') {
		return {
			tone: 'warning',
			headline: 'Proxy configuration needs review',
			body: 'Some forwarded headers are present but do not match the browser origin. Check your reverse proxy configuration and re-run the check.'
		};
	}
	if (action === 'env-controlled') {
		return {
			tone: 'neutral',
			headline: 'Managed by environment',
			body: 'TRUST_PROXY is controlled by the environment variable. Change it in your environment or container configuration to switch the setting.'
		};
	}
	return {
		tone: 'neutral',
		headline: 'Could not verify automatically',
		body: 'Obzorarr could not determine your proxy setup from the current request.'
	};
});

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
</script>

<svelte:head>
	<title>Security — Settings</title>
</svelte:head>

<div class="space-y-6 p-6 max-w-4xl">
	<Card>
		<CardHeader>
			<CardTitle>CSRF protection</CardTitle>
			<CardDescription>
				Origin check applied to all state-changing requests. Mismatches between this value
				and the browser's Origin header are rejected with 403. Source:
				<strong>{security.originSource}</strong>{#if security.originLocked} (locked by env){/if}.
			</CardDescription>
		</CardHeader>
		<CardContent class="space-y-4">
			{#if !security.originLocked}
				<form
					method="POST"
					action="?/updateCsrfOrigin"
					use:enhance={({ cancel }) => {
						if (isSavingCsrf) {
							cancel();
							return;
						}
						isSavingCsrf = true;
						return async ({ result, update }) => {
							try {
								if (
									result.type === 'failure' &&
									result.data &&
									(result.data as Record<string, unknown>).requireConfirmation
								) {
									const d = result.data as Record<string, unknown>;
									pendingCsrfOrigin = String(d.attemptedOrigin ?? '');
									pendingMismatchMessage = String(d.csrfMismatchMessage ?? '');
									csrfMismatchDialogOpen = true;
								} else if (result.type === 'success' || result.type === 'failure') {
									handleFormToast(
										result.data as { success?: boolean; message?: string; error?: string }
									);
								}
								await update({ reset: false });
								if (result.type === 'success') await invalidateAll();
							} finally {
								isSavingCsrf = false;
							}
						};
					}}
					class="space-y-4"
				>
					<div class="space-y-2">
						<Label for="csrfOrigin">CSRF origin</Label>
						<Input
							id="csrfOrigin"
							name="csrfOrigin"
							type="url"
							placeholder="https://obzorarr.example.com"
							bind:value={csrfOriginInput}
						/>
						<p class="text-xs text-muted-foreground">
							Leave blank to clear (only allowed when ORIGIN env is set or the skip flag is on).
						</p>
					</div>

					<input type="hidden" name="settingsVersion" value={data.csrfOriginVersion} />

					<div class="flex flex-wrap gap-2 justify-end">
						<Button type="submit" class="tap-target" disabled={isSavingCsrf}>
							{isSavingCsrf ? 'Saving…' : 'Save CSRF origin'}
						</Button>
					</div>
				</form>
			{:else}
				<p class="text-sm text-muted-foreground">
					CSRF origin is set via environment variable and cannot be changed here.
				</p>
			{/if}

			<form
				method="POST"
				action="?/testCsrfProtection"
				use:enhance={({ cancel }) => {
					if (isTestingCsrf) {
						cancel();
						return;
					}
					isTestingCsrf = true;
					return async ({ result }) => {
						try {
							if (result.type === 'success' || result.type === 'failure') {
								handleFormToast(
									result.data as { success?: boolean; message?: string; error?: string }
								);
							}
						} finally {
							isTestingCsrf = false;
						}
					};
				}}
			>
				<Button type="submit" variant="outline" class="tap-target" disabled={isTestingCsrf}>
					{isTestingCsrf ? 'Testing…' : 'Test CSRF protection'}
				</Button>
			</form>

			{#if !security.csrfEnabled && !security.originLocked}
				<form
					method="POST"
					action="?/toggleCsrfSkip"
					use:enhance={({ cancel, formData }) => {
						if (isClearingCsrfSkip) {
							cancel();
							return;
						}
						isClearingCsrfSkip = true;
						formData.set('enabled', security.csrfOriginSkipped ? 'false' : 'true');
						return async ({ result, update }) => {
							try {
								if (result.type === 'success' || result.type === 'failure') {
									handleFormToast(
										result.data as { success?: boolean; message?: string; error?: string }
									);
								}
								await update({ reset: false });
								if (result.type === 'success') await invalidateAll();
							} finally {
								isClearingCsrfSkip = false;
							}
						};
					}}
				>
					<Button type="submit" variant="outline" class="tap-target" disabled={isClearingCsrfSkip}>
						{security.csrfOriginSkipped ? 'Disable CSRF skip flag' : 'Enable CSRF skip flag'}
					</Button>
				</form>
			{/if}

			{#if security.warningDismissed}
				<form
					method="POST"
					action="?/resetCsrfWarning"
					use:enhance={({ cancel }) => {
						if (isResetingWarning) {
							cancel();
							return;
						}
						isResetingWarning = true;
						return async ({ result, update }) => {
							try {
								if (result.type === 'success' || result.type === 'failure') {
									handleFormToast(
										result.data as { success?: boolean; message?: string; error?: string }
									);
								}
								await update({ reset: false });
								if (result.type === 'success') await invalidateAll();
							} finally {
								isResetingWarning = false;
							}
						};
					}}
				>
					<Button type="submit" variant="outline" class="tap-target" disabled={isResetingWarning}>
						{isResetingWarning ? 'Resetting…' : 'Re-enable CSRF warning banner'}
					</Button>
				</form>
			{/if}
		</CardContent>
	</Card>

	<Card>
		<CardHeader>
			<CardTitle>Reverse-proxy header trust</CardTitle>
			<CardDescription>
				Controls whether Obzorarr trusts <code>x-forwarded-*</code> headers from your reverse proxy.
				Source: <strong>{security.trustProxySource}</strong>{#if security.trustProxyLocked} (locked by env){/if}.
			</CardDescription>
		</CardHeader>
		<CardContent class="space-y-4">
			{#if diagnosticStatus === 'checking' && !diagnostic}
				<div class="status-card neutral">
					<LoaderCircleIcon class="size-5 animate-spin status-icon" aria-hidden="true" />
					<div class="status-text">
						<span class="status-headline">Checking your connection…</span>
						<span class="status-body">
							Comparing what your browser sees with what Obzorarr receives.
						</span>
					</div>
				</div>
			{:else if diagnosticStatus === 'failure' && !diagnostic}
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
						<span class="status-headline">Could not run the diagnostic</span>
						<span class="status-body">{diagnosticError ?? 'Diagnostic failed'}</span>
					</div>
				</div>
			{:else if statusView && diagnostic}
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

				<button
					type="button"
					class="details-toggle"
					onclick={() => (showDiagnosticDetails = !showDiagnosticDetails)}
					aria-expanded={showDiagnosticDetails}
				>
					<span>
						{showDiagnosticDetails ? 'Hide technical details' : 'Show technical details'}
					</span>
					<ChevronDownIcon
						class="size-4 chevron"
						data-open={showDiagnosticDetails}
						aria-hidden="true"
					/>
				</button>

				{#if showDiagnosticDetails}
					<div class="details-panel">
						<div class="diagnostic-facts">
							<div>
								<span class="fact-label">Forwarded headers</span>
								<span class="fact-value">
									{getForwardedPairLabel(diagnostic.forwardedHeaders.pair.status)}
								</span>
							</div>
							<div>
								<span class="fact-label">Signals present</span>
								<span class="fact-value">
									{diagnostic.forwardedHeaders.present.length > 0
										? diagnostic.forwardedHeaders.present.join(', ')
										: 'None'}
								</span>
							</div>
							<div>
								<span class="fact-label">Current setting</span>
								<span class="fact-value">
									{diagnostic.trustProxy.enabled ? 'Enabled' : 'Disabled'}
									{#if diagnostic.trustProxy.isLocked}
										<span class="inline-badge">ENV</span>
									{/if}
								</span>
							</div>
						</div>

						{#if diagnostic.reasons.length > 0}
							<div class="reasons-block">
								<span class="reasons-label">Why we recommend this</span>
								<ul>
									{#each diagnostic.reasons as reason}
										<li>{reason}</li>
									{/each}
								</ul>
							</div>
						{/if}

						<p class="safety-note">{diagnostic.safetyNotice}</p>

						<div class="re-check">
							<Button
								type="button"
								variant="outline"
								class="tap-target"
								onclick={runDiagnostic}
								disabled={diagnosticStatus === 'checking'}
								aria-busy={diagnosticStatus === 'checking'}
							>
								{diagnosticStatus === 'checking' ? 'Re-checking…' : 'Re-run diagnostic'}
							</Button>
						</div>
					</div>
				{/if}
			{/if}

			{#if security.trustProxyLocked}
				<p class="text-sm text-muted-foreground">
					Reverse-proxy header trust is managed via environment variable and cannot be changed here.
				</p>
			{:else if security.trustProxyValue}
				<form
					method="POST"
					action="?/updateTrustProxy"
					use:enhance={({ cancel }) => {
						if (isTogglingTrustProxy) {
							cancel();
							return;
						}
						isTogglingTrustProxy = true;
						return async ({ result, update }) => {
							try {
								if (result.type === 'success' || result.type === 'failure') {
									handleFormToast(
										result.data as { success?: boolean; message?: string; error?: string }
									);
								}
								await update({ reset: false });
								if (result.type === 'success') await invalidateAll();
							} finally {
								isTogglingTrustProxy = false;
							}
						};
					}}
				>
					<input type="hidden" name="enabled" value="false" />
					<input type="hidden" name="settingsVersion" value={data.trustProxyVersion} />
					<div class="flex justify-end">
						<Button
							type="submit"
							variant="destructive"
							class="tap-target"
							disabled={isTogglingTrustProxy}
						>
							{isTogglingTrustProxy ? 'Disabling…' : 'Disable header trust'}
						</Button>
					</div>
				</form>
			{:else}
				<div class="flex justify-end">
					<Button
						variant="default"
						onclick={() => (trustProxyConfirmDialogOpen = true)}
						disabled={isConfirmingTrustProxy}
					>
						Enable header trust
					</Button>
				</div>
			{/if}
		</CardContent>
	</Card>
</div>

<AlertDialog.Root bind:open={csrfMismatchDialogOpen}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Save mismatched CSRF origin?</AlertDialog.Title>
			<AlertDialog.Description>
				{pendingMismatchMessage}
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel disabled={isConfirmingCsrfMismatch}>Cancel</AlertDialog.Cancel>
			<form
				method="POST"
				action="?/updateCsrfOrigin"
				use:enhance={() => {
					isConfirmingCsrfMismatch = true;
					return async ({ result, update }) => {
						try {
							if (result.type === 'success' || result.type === 'failure') {
								handleFormToast(
									result.data as { success?: boolean; message?: string; error?: string }
								);
							}
							await update({ reset: false });
							if (result.type === 'success') await invalidateAll();
						} finally {
							isConfirmingCsrfMismatch = false;
							csrfMismatchDialogOpen = false;
							pendingCsrfOrigin = null;
						}
					};
				}}
				style="display: contents;"
			>
				<input type="hidden" name="csrfOrigin" value={pendingCsrfOrigin ?? ''} />
				<input type="hidden" name="confirmMismatch" value="true" />
				<input type="hidden" name="settingsVersion" value={data.csrfOriginVersion} />
				<AlertDialog.Action type="submit" class="tap-target" disabled={isConfirmingCsrfMismatch}>
					{isConfirmingCsrfMismatch ? 'Saving…' : 'Save anyway'}
				</AlertDialog.Action>
			</form>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>

<AlertDialog.Root bind:open={trustProxyConfirmDialogOpen}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Enable reverse-proxy header trust?</AlertDialog.Title>
			<AlertDialog.Description>
				Obzorarr will trust the upstream proxy's `x-forwarded-*` headers for client IP, host,
				and protocol. If those headers can reach obzorarr unsanitised, attackers can spoof the
				host or protocol used for security decisions and generated URLs.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel disabled={isConfirmingTrustProxy}>Cancel</AlertDialog.Cancel>
			<form
				method="POST"
				action="?/updateTrustProxy"
				use:enhance={() => {
					isConfirmingTrustProxy = true;
					return async ({ result, update }) => {
						try {
							if (result.type === 'success' || result.type === 'failure') {
								handleFormToast(
									result.data as { success?: boolean; message?: string; error?: string }
								);
							}
							await update({ reset: false });
							if (result.type === 'success') await invalidateAll();
						} finally {
							isConfirmingTrustProxy = false;
							trustProxyConfirmDialogOpen = false;
						}
					};
				}}
				style="display: contents;"
			>
				<input type="hidden" name="enabled" value="true" />
				<input type="hidden" name="confirmRisk" value="true" />
				<input type="hidden" name="settingsVersion" value={data.trustProxyVersion} />
				<input
					type="hidden"
					name="browserOrigin"
					value={typeof window !== 'undefined' ? window.location.origin : ''}
				/>
				<AlertDialog.Action type="submit" class="tap-target" disabled={isConfirmingTrustProxy}>
					{isConfirmingTrustProxy ? 'Enabling…' : 'Enable header trust'}
				</AlertDialog.Action>
			</form>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>

<style>
	.status-card {
		display: flex;
		align-items: flex-start;
		gap: 0.875rem;
		padding: 0.875rem 1rem;
		border-radius: 10px;
		border: 1px solid hsl(var(--border));
		background: hsl(var(--muted) / 0.4);
	}

	.status-card.success {
		background: oklch(0.7205 0.192 149.49 / 0.08);
		border-color: oklch(0.7205 0.192 149.49 / 0.25);
	}

	.status-card.warning {
		background: oklch(0.79 0.1606 79.6 / 0.08);
		border-color: oklch(0.79 0.1606 79.6 / 0.25);
	}

	.status-card.neutral {
		background: hsl(var(--muted) / 0.4);
	}

	:global(.status-icon) {
		flex-shrink: 0;
		width: 20px;
		height: 20px;
		margin-top: 0.1rem;
	}

	.status-card.success :global(.status-icon) {
		color: oklch(0.7205 0.192 149.49);
	}

	.status-card.warning :global(.status-icon) {
		color: oklch(0.79 0.1606 79.6);
	}

	.status-card.neutral :global(.status-icon) {
		color: hsl(var(--muted-foreground));
	}

	.status-text {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		min-width: 0;
	}

	.status-headline {
		font-size: 0.9rem;
		font-weight: 600;
		color: hsl(var(--foreground));
	}

	.status-body {
		font-size: 0.825rem;
		line-height: 1.5;
		color: hsl(var(--muted-foreground));
	}

	.details-toggle {
		align-self: flex-start;
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		background: transparent;
		border: none;
		padding: 0.35rem 0.5rem;
		margin: 0;
		font-size: 0.78rem;
		font-weight: 500;
		color: hsl(var(--muted-foreground));
		cursor: pointer;
		border-radius: 6px;
		transition:
			color 0.2s,
			background 0.2s;
	}

	.details-toggle:hover {
		color: hsl(var(--foreground));
		background: hsl(var(--muted) / 0.5);
	}

	.details-toggle:focus-visible {
		outline: 2px solid hsl(var(--ring));
		outline-offset: 2px;
	}

	.details-toggle :global(.chevron) {
		transition: transform 0.2s ease;
	}

	.details-toggle :global(.chevron[data-open='true']) {
		transform: rotate(180deg);
	}

	.details-panel {
		display: flex;
		flex-direction: column;
		gap: 0.875rem;
		padding: 0.875rem 1rem;
		background: hsl(var(--muted) / 0.3);
		border: 1px solid hsl(var(--border));
		border-radius: 10px;
	}

	.diagnostic-facts {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.6rem;
	}

	.diagnostic-facts > div {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		min-width: 0;
		padding: 0.6rem 0.7rem;
		background: hsl(var(--background) / 0.6);
		border: 1px solid hsl(var(--border));
		border-radius: 8px;
	}

	.fact-label {
		font-size: 0.65rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: hsl(var(--muted-foreground));
	}

	.fact-value {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		min-width: 0;
		font-size: 0.78rem;
		line-height: 1.35;
		color: hsl(var(--foreground));
		overflow-wrap: anywhere;
	}

	.inline-badge {
		display: inline-flex;
		align-items: center;
		padding: 0.05rem 0.35rem;
		border-radius: 4px;
		background: oklch(0.7205 0.192 149.49 / 0.16);
		border: 1px solid oklch(0.7205 0.192 149.49 / 0.3);
		color: oklch(0.7205 0.192 149.49);
		font-size: 0.6rem;
		font-weight: 700;
		letter-spacing: 0.05em;
	}

	.reasons-block {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.reasons-label {
		font-size: 0.7rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: hsl(var(--muted-foreground));
	}

	.reasons-block ul {
		margin: 0;
		padding-left: 1.1rem;
		color: hsl(var(--muted-foreground));
		font-size: 0.8rem;
		line-height: 1.5;
	}

	.safety-note {
		margin: 0;
		font-size: 0.78rem;
		line-height: 1.5;
		color: hsl(var(--muted-foreground));
	}

	.re-check {
		display: flex;
		justify-content: flex-end;
	}

	@media (max-width: 640px) {
		.diagnostic-facts {
			grid-template-columns: 1fr;
		}
	}
</style>
