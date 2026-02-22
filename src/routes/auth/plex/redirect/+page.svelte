<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';

	type Status = 'loading' | 'success' | 'error' | 'cancelled';

	let status = $state<Status>('loading');
	let errorMessage = $state<string | null>(null);

	const PIN_STORAGE_KEY = 'obzorarr_plex_pin';
	const MAX_POLL_ATTEMPTS = 30;
	const POLL_INTERVAL_MS = 2000;
	const PIN_MAX_AGE_MS = 15 * 60 * 1000;

	interface StoredPinData {
		pinId: number;
		createdAt: number;
		context: 'landing' | 'onboarding';
	}

	onMount(async () => {
		if (!browser) return;

		const storedData = sessionStorage.getItem(PIN_STORAGE_KEY);
		if (!storedData) {
			status = 'error';
			errorMessage = 'No pending authentication found. Please try again.';
			return;
		}

		let pinData: StoredPinData;
		try {
			pinData = JSON.parse(storedData);
		} catch {
			sessionStorage.removeItem(PIN_STORAGE_KEY);
			status = 'error';
			errorMessage = 'Invalid authentication data. Please try again.';
			return;
		}

		const pinAge = Date.now() - pinData.createdAt;
		if (pinAge > PIN_MAX_AGE_MS) {
			sessionStorage.removeItem(PIN_STORAGE_KEY);
			status = 'error';
			errorMessage = 'Authentication session expired. Please try again.';
			return;
		}

		try {
			const authToken = await pollForToken(pinData.pinId);

			if (!authToken) {
				status = 'cancelled';
				sessionStorage.removeItem(PIN_STORAGE_KEY);
				return;
			}

			const callbackResponse = await fetch('/auth/plex/callback', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ authToken })
			});

			if (!callbackResponse.ok) {
				const errData = await callbackResponse.json().catch(() => ({}));
				throw new Error(
					(errData as { message?: string }).message || 'Failed to complete authentication'
				);
			}

			const userData = (await callbackResponse.json()) as {
				user: { isAdmin: boolean };
			};
			sessionStorage.removeItem(PIN_STORAGE_KEY);

			status = 'success';

			const targetUrl =
				pinData.context === 'onboarding'
					? '/onboarding/plex'
					: userData.user.isAdmin
						? '/admin'
						: '/dashboard';

			window.location.href = targetUrl;
		} catch (err) {
			sessionStorage.removeItem(PIN_STORAGE_KEY);
			status = 'error';
			errorMessage = err instanceof Error ? err.message : 'Authentication failed';
		}
	});

	async function pollForToken(pinId: number): Promise<string | null> {
		for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
			const response = await fetch('/auth/plex', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ pinId })
			});

			if (!response.ok) {
				if (response.status === 401) {
					return null;
				}
				throw new Error('Failed to check authentication status');
			}

			const result = (await response.json()) as { pending: true } | { authToken: string };

			if ('authToken' in result && result.authToken) {
				return result.authToken;
			}

			await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
		}

		return null;
	}

	function handleRetry(): void {
		sessionStorage.removeItem(PIN_STORAGE_KEY);
		window.location.href = '/';
	}
</script>

<svelte:head>
	<title>Completing Authentication - Obzorarr</title>
</svelte:head>

<div class="redirect-container">
	{#if status === 'loading'}
		<div class="status-box loading">
			<div class="spinner"></div>
			<h1>Completing Authentication</h1>
			<p>Please wait while we verify your Plex account...</p>
		</div>
	{:else if status === 'success'}
		<div class="status-box success">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="48"
				height="48"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<polyline points="20 6 9 17 4 12" />
			</svg>
			<h1>Authentication Successful</h1>
			<p>Redirecting you now...</p>
		</div>
	{:else if status === 'cancelled'}
		<div class="status-box cancelled">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="48"
				height="48"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<circle cx="12" cy="12" r="10" />
				<line x1="15" y1="9" x2="9" y2="15" />
				<line x1="9" y1="9" x2="15" y2="15" />
			</svg>
			<h1>Authentication Cancelled</h1>
			<p>You cancelled the Plex authentication.</p>
			<button type="button" onclick={handleRetry} class="retry-button">Try Again</button>
		</div>
	{:else if status === 'error'}
		<div class="status-box error">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="48"
				height="48"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<circle cx="12" cy="12" r="10" />
				<line x1="12" y1="8" x2="12" y2="12" />
				<line x1="12" y1="16" x2="12.01" y2="16" />
			</svg>
			<h1>Authentication Error</h1>
			<p>{errorMessage}</p>
			<button type="button" onclick={handleRetry} class="retry-button">Try Again</button>
		</div>
	{/if}
</div>

<style>
	.redirect-container {
		display: flex;
		justify-content: center;
		align-items: center;
		min-height: 100vh;
		padding: 1rem;
		background: linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 100%);
	}

	.status-box {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		padding: 2.5rem;
		background: hsl(var(--card));
		border: 1px solid hsl(var(--border));
		border-radius: 12px;
		max-width: 400px;
		width: 100%;
	}

	.status-box h1 {
		margin: 1rem 0 0.5rem;
		font-size: 1.5rem;
		font-weight: 600;
		color: hsl(var(--foreground));
	}

	.status-box p {
		margin: 0;
		font-size: 0.875rem;
		color: hsl(var(--muted-foreground));
		line-height: 1.5;
	}

	.spinner {
		width: 48px;
		height: 48px;
		border: 3px solid hsl(var(--border));
		border-top-color: hsl(var(--primary));
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.success svg {
		color: #22c55e;
	}

	.cancelled svg {
		color: hsl(var(--muted-foreground));
	}

	.error svg {
		color: #ef4444;
	}

	.retry-button {
		margin-top: 1.5rem;
		padding: 0.75rem 1.5rem;
		font-size: 0.875rem;
		font-weight: 500;
		color: hsl(var(--primary-foreground));
		background: hsl(var(--primary));
		border: none;
		border-radius: 8px;
		cursor: pointer;
		transition: opacity 0.15s ease;
	}

	.retry-button:hover {
		opacity: 0.9;
	}
</style>
