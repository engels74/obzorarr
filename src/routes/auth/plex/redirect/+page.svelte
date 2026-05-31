<script lang="ts">
import CheckIcon from '@lucide/svelte/icons/check';
import CircleAlertIcon from '@lucide/svelte/icons/circle-alert';
import CircleXIcon from '@lucide/svelte/icons/circle-x';
import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
import { onMount } from 'svelte';
import { browser } from '$app/environment';
import type { ServerPinFallback } from '$lib/client/plex-login';
import {
	LOGIN_TIMEOUT_MS,
	PIN_STORAGE_KEY,
	POLL_INTERVAL_MS,
	resolveRedirectPinData,
	sanitizeCompletedLoginResponse
} from '$lib/client/plex-login';
import { Button } from '$lib/components/ui/button';
import * as Card from '$lib/components/ui/card';
import type { PageData } from './$types';

type Status = 'loading' | 'success' | 'error' | 'cancelled';

let status = $state<Status>('loading');
let errorMessage = $state<string | null>(null);
let { data }: { data: PageData } = $props();

const MAX_POLL_ATTEMPTS = Math.floor(LOGIN_TIMEOUT_MS / POLL_INTERVAL_MS);

onMount(async () => {
	if (!browser) return;

	if (!data.stateVerified) {
		status = 'error';
		errorMessage = 'Authentication session could not be verified. Please try again.';
		return;
	}

	if (data.flow === 'popup') {
		status = 'success';
		setTimeout(() => window.close(), 750);
		return;
	}

	try {
		const pinData = resolveRedirectPinData(
			sessionStorage,
			data.serverPinFallback as ServerPinFallback | null
		);
		const loginResult = await pollForLogin(pinData.pinId);

		if (!loginResult) {
			status = 'cancelled';
			removeRedirectPinData();
			return;
		}
		removeRedirectPinData();

		status = 'success';

		const targetUrl =
			pinData.context === 'onboarding'
				? '/onboarding/plex'
				: (loginResult.redirectTo ?? (loginResult.user.isAdmin ? '/admin' : '/dashboard'));

		window.location.href = targetUrl;
	} catch (err) {
		removeRedirectPinData();
		status = 'error';
		errorMessage = err instanceof Error ? err.message : 'Authentication failed';
	}
});

async function pollForLogin(
	pinId: number
): Promise<{ user: { isAdmin: boolean }; redirectTo?: string } | null> {
	for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
		if (attempt > 0) await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

		const response = await fetch('/auth/plex', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ pinId })
		});

		if (!response.ok) {
			if (response.status === 401) {
				return null;
			}
			const errData = (await response.json().catch(() => ({}))) as { message?: string };
			throw new Error(errData.message || 'Failed to check authentication status');
		}

		const result = (await response.json()) as unknown;

		const completedLogin = sanitizeCompletedLoginResponse(result);
		if (completedLogin) {
			return completedLogin;
		}
	}

	return null;
}

function removeRedirectPinData(): void {
	try {
		sessionStorage.removeItem(PIN_STORAGE_KEY);
	} catch {}
}

function handleRetry(): void {
	removeRedirectPinData();
	window.location.href = '/';
}
</script>

<svelte:head>
	<title>Completing Authentication - Obzorarr</title>
</svelte:head>

<div class="redirect-container">
	<Card.Root class="redirect-card">
		<Card.Header class="items-center text-center">
			{#if status === 'loading'}
				<LoaderCircleIcon class="size-12 text-primary animate-spin mx-auto" />
				<Card.Title>Completing Authentication</Card.Title>
				<Card.Description>Please wait while we verify your Plex account...</Card.Description>
			{:else if status === 'success'}
				<CheckIcon class="size-12 text-success mx-auto" />
				<Card.Title>Authentication Successful</Card.Title>
				<Card.Description>Redirecting you now...</Card.Description>
			{:else if status === 'cancelled'}
				<CircleXIcon class="size-12 text-muted-foreground mx-auto" />
				<Card.Title>Authentication Cancelled</Card.Title>
				<Card.Description>You cancelled the Plex authentication.</Card.Description>
			{:else if status === 'error'}
				<CircleAlertIcon class="size-12 text-destructive mx-auto" />
				<Card.Title>Authentication Error</Card.Title>
				<Card.Description>{errorMessage}</Card.Description>
			{/if}
		</Card.Header>

		{#if status === 'cancelled' || status === 'error'}
			<Card.Footer class="justify-center">
				<Button class="tap-target" onclick={handleRetry}>Try Again</Button>
			</Card.Footer>
		{/if}
	</Card.Root>
</div>

<style>
	.redirect-container {
		display: flex;
		justify-content: center;
		align-items: center;
		min-height: 100vh;
		padding: 1rem;
		background: linear-gradient(135deg, oklch(0.12 0 0) 0%, oklch(0.18 0.04 270) 100%);
	}

	:global(.redirect-card) {
		max-width: 400px;
		width: 100%;
	}

	:global(.text-success) {
		color: oklch(0.72 0.18 145);
	}
</style>
