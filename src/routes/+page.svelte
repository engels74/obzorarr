<script lang="ts">
	import { enhance } from '$app/forms';
	import { animate } from 'motion';
	import { prefersReducedMotion } from 'svelte/motion';
	import { browser } from '$app/environment';
	import Logo from '$lib/components/Logo.svelte';
	import PopupBlockedModal from '$lib/components/auth/PopupBlockedModal.svelte';
	import type { PageData, ActionData } from './$types';

	/**
	 * Public Landing Page
	 *
	 * Soviet/communist themed landing page for Obzorarr with:
	 * - Username-based quick access to wrapped pages (primary CTA)
	 * - Plex OAuth login button for dashboard access (secondary)
	 */

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// Username lookup state
	let username = $state('');
	let isLookingUp = $state(false);

	// Sync username from form response (preserves user input on error)
	$effect(() => {
		if (form?.username) {
			username = form.username;
		}
	});

	// Plex OAuth state
	let isOAuthLoading = $state(false);
	let oauthError = $state<string | null>(null);
	let pollIntervalId: ReturnType<typeof setInterval> | null = null;
	let timeoutId: ReturnType<typeof setTimeout> | null = null;

	// Popup fallback state
	let showPopupBlockedModal = $state(false);
	let pendingPinId = $state<number | null>(null);
	let pendingAuthUrl = $state<string | null>(null);
	const PIN_STORAGE_KEY = 'obzorarr_plex_pin';

	// Element refs for animation
	let heroContainer: HTMLElement | undefined = $state();

	// Entrance animation for hero
	$effect(() => {
		if (!heroContainer || prefersReducedMotion.current) return;
		const animation = animate(
			heroContainer,
			{ opacity: [0, 1], transform: ['translateY(30px)', 'translateY(0)'] },
			{ type: 'spring', stiffness: 100, damping: 15 }
		);
		return () => animation.stop();
	});

	// Cleanup polling on unmount
	$effect(() => {
		return () => {
			if (pollIntervalId) clearInterval(pollIntervalId);
			if (timeoutId) clearTimeout(timeoutId);
		};
	});

	// Plex OAuth handler
	async function handlePlexLogin() {
		isOAuthLoading = true;
		oauthError = null;

		try {
			const response = await fetch('/auth/plex');
			if (!response.ok) {
				const errData = await response.json().catch(() => ({}));
				throw new Error(errData.message || 'Failed to initiate login');
			}
			const { pinId, authUrl } = (await response.json()) as { pinId: number; authUrl: string };

			const authWindow = window.open(authUrl, 'plex-auth', 'width=600,height=700');

			if (!authWindow) {
				await handlePopupBlocked(pinId);
				return;
			}

			await new Promise((r) => setTimeout(r, 100));
			if (authWindow.closed) {
				await handlePopupBlocked(pinId);
				return;
			}

			pollIntervalId = setInterval(async () => {
				try {
					const pollResponse = await fetch('/auth/plex', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ pinId })
					});

					if (!pollResponse.ok) {
						const status = pollResponse.status;
						if (status === 401) {
							if (pollIntervalId) clearInterval(pollIntervalId);
							pollIntervalId = null;
							isOAuthLoading = false;
							oauthError = 'Authentication expired. Please try again.';
							return;
						}
						return;
					}

					const result = (await pollResponse.json()) as { pending: true } | { authToken: string };

					if ('authToken' in result && result.authToken) {
						if (pollIntervalId) clearInterval(pollIntervalId);
						pollIntervalId = null;
						authWindow?.close();

						const callbackResponse = await fetch('/auth/plex/callback', {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({ authToken: result.authToken })
						});

						if (!callbackResponse.ok) {
							const errData = await callbackResponse.json().catch(() => ({}));
							throw new Error((errData as { message?: string }).message || 'Login failed');
						}

						const userData = (await callbackResponse.json()) as {
							user: { isAdmin: boolean };
						};

						window.location.href = userData.user.isAdmin ? '/admin' : '/dashboard';
					}
				} catch (err) {
					if (pollIntervalId) clearInterval(pollIntervalId);
					pollIntervalId = null;
					isOAuthLoading = false;
					oauthError = err instanceof Error ? err.message : 'Login failed';
				}
			}, 2000);

			timeoutId = setTimeout(
				() => {
					if (pollIntervalId) {
						clearInterval(pollIntervalId);
						pollIntervalId = null;
					}
					if (isOAuthLoading) {
						isOAuthLoading = false;
						oauthError = 'Authentication timed out. Please try again.';
					}
				},
				5 * 60 * 1000
			);
		} catch (err) {
			isOAuthLoading = false;
			oauthError = err instanceof Error ? err.message : 'Login failed';
		}
	}

	async function handlePopupBlocked(_originalPinId: number): Promise<void> {
		try {
			const redirectUrl = browser ? `${window.location.origin}/auth/plex/redirect` : '';
			const response = await fetch(`/auth/plex?redirectUrl=${encodeURIComponent(redirectUrl)}`);
			if (!response.ok) {
				throw new Error('Failed to prepare redirect');
			}
			const { pinId, authUrl } = (await response.json()) as { pinId: number; authUrl: string };
			pendingPinId = pinId;
			pendingAuthUrl = authUrl;
		} catch {
			pendingPinId = null;
			pendingAuthUrl = null;
		}

		isOAuthLoading = false;
		showPopupBlockedModal = true;
	}

	function handleContinueWithRedirect(): void {
		if (!pendingPinId || !pendingAuthUrl || !browser) return;

		sessionStorage.setItem(
			PIN_STORAGE_KEY,
			JSON.stringify({
				pinId: pendingPinId,
				createdAt: Date.now(),
				context: 'landing'
			})
		);

		showPopupBlockedModal = false;
		window.location.href = pendingAuthUrl;
	}

	function handleCancelRedirect(): void {
		pendingPinId = null;
		pendingAuthUrl = null;
		showPopupBlockedModal = false;
		oauthError = 'Login cancelled. Try enabling popups for this site.';
	}
</script>

<div class="landing">
	<!-- Hero Section -->
	<section class="hero" bind:this={heroContainer}>
		<div class="hero-content">
			<!-- Logo Decorative Element -->
			<div class="logo-glow" aria-hidden="true">
				<Logo size={120} />
			</div>

			<h1 class="hero-title">
				<span class="title-main">OBZORARR</span>
				<span class="title-sub">Year in Review</span>
			</h1>

			<p class="hero-description">
				Discover your Plex viewing journey. Beautiful statistics, stunning animations, and shareable
				summaries of your media consumption.
			</p>

			<!-- PRIMARY CTA: Username Lookup -->
			<div class="username-section">
				<form
					method="POST"
					action="?/lookupUser"
					use:enhance={() => {
						isLookingUp = true;
						return async ({ update }) => {
							isLookingUp = false;
							await update();
						};
					}}
					class="username-form"
				>
					<div class="username-input-group">
						<input
							type="text"
							name="username"
							bind:value={username}
							placeholder="Enter your Plex username"
							disabled={isLookingUp}
							class="username-input"
							autocomplete="off"
							autocapitalize="off"
							spellcheck="false"
						/>
						<button type="submit" class="view-button" disabled={isLookingUp || !username.trim()}>
							{#if isLookingUp}
								<span class="spinner small" aria-hidden="true"></span>
								Looking up...
							{:else}
								View My {data.currentYear} Wrapped
							{/if}
						</button>
					</div>

					{#if form?.error}
						<p class="error-message" role="alert">
							{form.error}
							{#if form.requiresAuth}
								<button type="button" class="link-button" onclick={handlePlexLogin}>
									Sign in now
								</button>
							{/if}
						</p>
					{/if}
				</form>
			</div>

			<!-- SECONDARY: Plex OAuth Login -->
			<div class="login-section">
				<p class="login-prompt">Want to access your dashboard or change settings?</p>
				<button
					type="button"
					class="login-button secondary"
					onclick={handlePlexLogin}
					disabled={isOAuthLoading}
				>
					{#if isOAuthLoading}
						<span class="button-loading">
							<span class="spinner" aria-hidden="true"></span>
							Connecting to Plex...
						</span>
					{:else}
						<span class="button-content">
							<span class="plex-icon" aria-hidden="true">&#9654;</span>
							Sign in with Plex
						</span>
					{/if}
				</button>

				{#if oauthError}
					<p class="error-message" role="alert">{oauthError}</p>
				{/if}
			</div>
		</div>
	</section>

	<!-- Footer -->
	<footer class="footer">
		<p>Spotify Wrapped-style summaries for your Plex Media Server</p>
	</footer>
</div>

<PopupBlockedModal
	bind:open={showPopupBlockedModal}
	onContinue={handleContinueWithRedirect}
	onCancel={handleCancelRedirect}
/>

<style>
	.landing {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
		background: hsl(var(--background));
	}

	/* Hero Section */
	.hero {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 2rem;
		min-height: 80vh;
		position: relative;
		overflow: hidden;
	}

	.hero::before {
		content: '';
		position: absolute;
		inset: 0;
		background: radial-gradient(ellipse at center, hsl(var(--primary) / 0.1) 0%, transparent 70%);
		pointer-events: none;
	}

	.hero-content {
		max-width: 600px;
		text-align: center;
		position: relative;
		z-index: 1;
	}

	.logo-glow {
		margin-bottom: 1rem;
		filter: drop-shadow(0 0 20px hsl(var(--primary) / 0.5))
			drop-shadow(0 0 40px hsl(var(--primary) / 0.3));
	}

	.hero-title {
		margin: 0 0 1.5rem;
	}

	.title-main {
		display: block;
		font-size: clamp(2.5rem, 8vw, 4rem);
		font-weight: 900;
		letter-spacing: 0.15em;
		color: hsl(var(--primary));
		text-shadow:
			2px 2px 0 hsl(var(--primary) / 0.3),
			4px 4px 0 hsl(var(--primary) / 0.1);
	}

	.title-sub {
		display: block;
		font-size: clamp(1rem, 3vw, 1.5rem);
		font-weight: 400;
		letter-spacing: 0.3em;
		text-transform: uppercase;
		color: hsl(var(--accent));
		margin-top: 0.5rem;
	}

	.hero-description {
		font-size: 1.125rem;
		line-height: 1.7;
		color: hsl(var(--muted-foreground));
		margin: 0 0 2rem;
	}

	/* Username Section - PRIMARY CTA */
	.username-section {
		margin-bottom: 2rem;
	}

	.username-form {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.username-input-group {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
		justify-content: center;
	}

	.username-input {
		flex: 1;
		min-width: 200px;
		max-width: 300px;
		padding: 0.875rem 1rem;
		font-size: 1rem;
		background: hsl(var(--input));
		border: 1px solid hsl(var(--border));
		border-radius: var(--radius);
		color: hsl(var(--foreground));
		transition:
			border-color 0.2s ease,
			box-shadow 0.2s ease;
	}

	.username-input::placeholder {
		color: hsl(var(--muted-foreground));
	}

	.username-input:focus {
		outline: none;
		border-color: hsl(var(--ring));
		box-shadow: 0 0 0 2px hsl(var(--ring) / 0.2);
	}

	.username-input:disabled {
		opacity: 0.7;
		cursor: not-allowed;
	}

	.view-button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 0.875rem 1.5rem;
		font-size: 1rem;
		font-weight: 600;
		color: hsl(var(--primary-foreground));
		background: hsl(var(--primary));
		border: none;
		border-radius: var(--radius);
		cursor: pointer;
		transition: all 0.2s ease;
		white-space: nowrap;
		box-shadow:
			0 4px 14px hsl(var(--primary) / 0.4),
			0 0 0 0 hsl(var(--accent) / 0);
	}

	.view-button:hover:not(:disabled) {
		background: hsl(var(--primary) / 0.9);
		transform: translateY(-2px);
		box-shadow:
			0 6px 20px hsl(var(--primary) / 0.5),
			0 0 0 3px hsl(var(--accent) / 0.3);
	}

	.view-button:active:not(:disabled) {
		transform: translateY(0);
	}

	.view-button:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	/* Login Section - SECONDARY */
	.login-section {
		padding-top: 1.5rem;
		border-top: 1px solid hsl(var(--border) / 0.5);
	}

	.login-prompt {
		font-size: 0.875rem;
		color: hsl(var(--muted-foreground));
		margin: 0 0 0.75rem;
	}

	.login-button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 200px;
		padding: 0.75rem 1.5rem;
		font-size: 1rem;
		font-weight: 600;
		border: none;
		border-radius: var(--radius);
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.login-button.secondary {
		background: hsl(var(--secondary));
		color: hsl(var(--secondary-foreground));
		border: 1px solid hsl(var(--border));
		box-shadow: none;
	}

	.login-button.secondary:hover:not(:disabled) {
		background: hsl(var(--muted));
		transform: none;
	}

	.login-button:disabled {
		opacity: 0.8;
		cursor: not-allowed;
	}

	.button-content,
	.button-loading {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.plex-icon {
		font-size: 1.125rem;
	}

	/* Shared Elements */
	.spinner {
		display: inline-block;
		width: 1.25rem;
		height: 1.25rem;
		border: 2px solid hsl(var(--primary-foreground) / 0.3);
		border-top-color: hsl(var(--primary-foreground));
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	.spinner.small {
		width: 1rem;
		height: 1rem;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.error-message {
		margin-top: 0.75rem;
		padding: 0.75rem 1rem;
		background: hsl(var(--destructive) / 0.2);
		border: 1px solid hsl(var(--destructive));
		border-radius: var(--radius);
		color: hsl(var(--destructive-foreground));
		font-size: 0.875rem;
	}

	.link-button {
		background: none;
		border: none;
		color: hsl(var(--primary));
		text-decoration: underline;
		cursor: pointer;
		font-size: inherit;
		padding: 0;
		margin-left: 0.25rem;
	}

	.link-button:hover {
		opacity: 0.8;
	}

	/* Footer */
	.footer {
		padding: 1.5rem 2rem;
		text-align: center;
		border-top: 1px solid hsl(var(--border));
	}

	.footer p {
		margin: 0;
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
		letter-spacing: 0.05em;
	}

	/* Responsive */
	@media (max-width: 640px) {
		.hero {
			min-height: 70vh;
			padding: 1.5rem;
		}

		.logo-glow :global(.logo) {
			width: 96px;
			height: 96px;
		}

		.hero-description {
			font-size: 1rem;
		}

		.username-input-group {
			flex-direction: column;
			align-items: stretch;
		}

		.username-input {
			max-width: none;
		}

		.view-button {
			justify-content: center;
			width: 100%;
		}

		.login-button {
			width: 100%;
			min-width: unset;
		}
	}

	/* Reduced motion */
	@media (prefers-reduced-motion: reduce) {
		.spinner {
			animation: none;
		}

		.view-button,
		.login-button,
		.username-input {
			transition: none;
		}
	}
</style>
